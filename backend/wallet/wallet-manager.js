/* ================================================================
   ARQUIVO: backend/wallet/wallet-manager.js

   CORREÇÕES DESTA VERSÃO:
   → wallet:criar_pin e wallet:alterar_pin ATIVADOS (não mais comentados)
   → wallet:depositar: em modo DEV (sem MP_ACCESS_TOKEN), confirma
     automaticamente o depósito após 3s simulando o webhook do MP
   → wallet:deposito_simulado_confirmar: evento para dev confirmar manualmente
   → Todas as demais funcionalidades mantidas intactas
================================================================ */

import admin        from 'firebase-admin';
import bcrypt       from 'bcrypt';
import { depositar, sacar, bonus, confirmarTransacao, TIPOS } from './transactions.js';
import { blockchain }                    from './blockchain.js';
import { criarCarteira, validarEndereco } from './wallet.js';
import { criarPagamentoPIX, enviarPIXSaida } from './mercadopago.js';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const BONUS_BOAS_VINDAS_BC = 10_000;
const TAXA_DEPOSITO        = 0.05;
const TAXA_SAQUE           = 0.03;
const TAXA_ENVIO           = 0.01;
const TAXA_ENVIO_MIN_BC    = 10;
const COTACAO_BC_POR_REAL  = 1000;
const SAQUE_MAX_DIARIO_BC  = 500_000;
const SAQUE_MIN_BC         = 5_000;
const ENVIO_MIN_BC         = 100;
const ENVIO_MAX_BC         = 100_000;
const PIN_MAX_TENTATIVAS   = 5;
const PIN_BLOQUEIO_MS      = 5 * 60 * 1000; // 5 minutos

const MODO_DEV = !process.env.MP_ACCESS_TOKEN;


// ================================================================
// BLOCO 2: HELPERS DO FIRESTORE
// ================================================================

function refJogador(uid) {
    return admin.firestore().collection('jogadores').doc(uid);
}

function refTransacoes(uid) {
    return admin.firestore().collection('jogadores').doc(uid).collection('transacoes');
}

async function getPerfil(uid) {
    const snap = await refJogador(uid).get();
    if (!snap.exists) return null;
    return { uid, ...snap.data() };
}

// Bloqueio de força bruta feito no SERVIDOR — o front tinha um "máximo de
// 3 tentativas" só de UI, que resetava a cada remontagem do modal e não
// protegia nada de verdade. Aqui os contadores ficam no Firestore, então
// nenhuma tentativa de burlar o cliente escapa do limite.
async function verificarPin(uid, pin) {
    const ref  = refJogador(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, erro: 'Jogador não encontrado.' };

    const d = snap.data();
    if (!d.pinHash) return { ok: false, erro: 'PIN não configurado.' };

    const bloqueadoAteMs = d.pinBloqueadoAte?.toMillis?.() || 0;
    if (bloqueadoAteMs > Date.now()) {
        const minutos = Math.ceil((bloqueadoAteMs - Date.now()) / 60000);
        return { ok: false, erro: `Muitas tentativas erradas. Tente novamente em ${minutos} min.` };
    }

    const correto = await bcrypt.compare(String(pin), d.pinHash);

    if (correto) {
        if (d.pinTentativas > 0) {
            await ref.update({
                pinTentativas:   0,
                pinBloqueadoAte: admin.firestore.FieldValue.delete(),
            });
        }
        return { ok: true };
    }

    const tentativas = (d.pinTentativas || 0) + 1;
    if (tentativas >= PIN_MAX_TENTATIVAS) {
        await ref.update({
            pinTentativas:   0,
            pinBloqueadoAte: admin.firestore.Timestamp.fromMillis(Date.now() + PIN_BLOQUEIO_MS),
        });
        return { ok: false, erro: `Muitas tentativas erradas. Tente novamente em ${Math.ceil(PIN_BLOQUEIO_MS / 60000)} min.` };
    }

    await ref.update({ pinTentativas: tentativas });
    return { ok: false, erro: 'PIN incorreto.' };
}

// contraparte: uid do outro lado da transação (destinatário, no caso de
// envio P2P) — se não informado, assume que o outro lado é o próprio
// sistema (depósito/saque/bônus são sempre jogador ↔ casa).
async function salvarEEmitirTx(uid, transacao, socket, contraparte = 'SISTEMA_BRL') {
    try {
        await refTransacoes(uid).doc(transacao.id).set(transacao);
        socket.emit('wallet:tx_nova', formatarTxParaFrontend(transacao, uid));

        // Registra na blockchain interna (ledger auditável, à prova de
        // adulteração) — não afeta o saldo real, que continua vindo só
        // do Firestore; isto é só o histórico imutável em paralelo.
        const ehRemetente = transacao.remetenteUid === uid;
        blockchain.adicionarTransacao({
            ...transacao,
            remetenteEndereco:    ehRemetente ? uid : contraparte,
            destinatarioEndereco: ehRemetente ? contraparte : uid,
        });
    } catch (e) {
        console.error('Erro ao salvar transação:', e.message);
    }
}

function formatarTxParaFrontend(tx, meuUid) {
    const entradas  = ['DEPOSITO', 'BONUS', 'PREMIO', 'RECEBIMENTO'];
    const tipo      = tx.tipo?.toLowerCase() || 'taxa';
    const isEntrada = entradas.includes(tx.tipo);

    return {
        id:          tx.id,
        tipo:        tipo === 'transferencia' && isEntrada ? 'recebimento' : tipo,
        valorBC:     tx.valorLiquido || tx.valor || 0,
        taxaBC:      tx.taxa         || 0,
        taxaBRL:     tx.metadados?.taxaBRL  || 0,
        brlLiquido:  tx.metadados?.brlLiquido || 0,
        criadoEm:    tx.timestamp || new Date().toISOString(),
        status:      tx.status || 'CONFIRMADA',
        contraparte: tx.metadados?.nomeContraparte || null,
    };
}


// ================================================================
// BLOCO 3: CONFIRMAR DEPÓSITO (usado pelo webhook E pelo simulador)
// ================================================================

export async function creditarDeposito(intencaoId, io) {
    try {
        const db       = admin.firestore();
        const intencao = await db.collection('depositos_pendentes').doc(intencaoId).get();

        if (!intencao.exists) {
            console.error('Intenção de depósito não encontrada:', intencaoId);
            return;
        }

        const data = intencao.data();

        // Idempotência — não processa duas vezes
        if (data.status === 'CONFIRMADO') {
            console.warn('Depósito já processado:', intencaoId);
            return;
        }

        const { uid, bcCreditar, valorBRL, taxaBRL, totalBRL, socketId } = data;

        const perfil   = await getPerfil(uid);
        const ultimaTx = await getUltimaTransacao(uid);

        const resultado = depositar({
            uid,
            endereco:     perfil?.endereco || '',
            valor:        bcCreditar,
            hashAnterior: ultimaTx?.hash || '0'.repeat(64),
            metadados:    { valorBRL, taxaBRL, totalBRL, intencaoId },
        });

        if (!resultado.sucesso) {
            console.error('Erro ao criar tx de depósito:', resultado.erro);
            return;
        }

        const txConfirmada = confirmarTransacao(resultado.transacao);

        // Atualiza saldo + status em batch atômico
        const batch = db.batch();
        batch.update(db.collection('jogadores').doc(uid), {
            saldo: admin.firestore.FieldValue.increment(bcCreditar),
        });
        batch.update(db.collection('depositos_pendentes').doc(intencaoId), {
            status:       'CONFIRMADO',
            confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(
            db.collection('jogadores').doc(uid).collection('transacoes').doc(txConfirmada.id),
            txConfirmada
        );
        await batch.commit();

        // Registra na blockchain interna (mesmo motivo do salvarEEmitirTx —
        // ledger auditável em paralelo, não é a fonte do saldo real)
        blockchain.adicionarTransacao({
            ...txConfirmada,
            remetenteEndereco:    'SISTEMA_BRL',
            destinatarioEndereco: uid,
        });

        // Notifica o socket do jogador se ainda estiver online
        // Tenta pelo socketId salvo; se falhar, busca pelo uid
        let socketJogador = io.sockets.sockets.get(socketId);
        if (!socketJogador) {
            socketJogador = encontrarSocket(io, uid);
        }

        if (socketJogador) {
            const perfilAtualizado = await getPerfil(uid);
            socketJogador.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });
            socketJogador.emit('wallet:tx_nova', formatarTxParaFrontend(txConfirmada, uid));
            socketJogador.emit('wallet:deposito_confirmado', { bcCreditar, valorBRL });
        }

        console.log(`✅ Depósito confirmado: ₿C ${bcCreditar} para uid ${uid}`);

    } catch (e) {
        console.error('Erro ao creditar depósito:', e.message);
    }
}


// ================================================================
// BLOCO 3B: CONFIRMAR SAQUE (usado pelo simulador DEV e, futuramente,
// pela confirmação real de envio de PIX do Mercado Pago)
//
// O ₿C já foi debitado da carteira no momento do PEDIDO de saque
// (wallet:sacar) — aqui só marcamos que o PIX de saída foi de fato
// enviado, fechando a transação que ficou como PENDENTE até agora.
// ================================================================

export async function confirmarSaque(saqueId, io) {
    try {
        const db     = admin.firestore();
        const pedido = await db.collection('saques_pendentes').doc(saqueId).get();

        if (!pedido.exists) {
            console.error('Pedido de saque não encontrado:', saqueId);
            return;
        }

        const data = pedido.data();

        // Idempotência — não processa duas vezes
        if (data.status === 'PROCESSADO') {
            console.warn('Saque já processado:', saqueId);
            return;
        }

        const { uid, valorBC, brlLiquido, transacaoId, socketId } = data;

        const batch = db.batch();
        batch.update(db.collection('saques_pendentes').doc(saqueId), {
            status:       'PROCESSADO',
            processadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.update(
            db.collection('jogadores').doc(uid).collection('transacoes').doc(transacaoId),
            { status: 'CONFIRMADA', confirmadaEm: new Date().toISOString() },
        );
        await batch.commit();

        // Notifica o socket do jogador se ainda estiver online
        let socketJogador = io.sockets.sockets.get(socketId);
        if (!socketJogador) {
            socketJogador = encontrarSocket(io, uid);
        }

        if (socketJogador) {
            socketJogador.emit('wallet:saque_confirmado', { valorBC, brlLiquido });
        }

        console.log(`✅ Saque confirmado: ₿C ${valorBC} (R$ ${brlLiquido}) para uid ${uid}`);

    } catch (e) {
        console.error('Erro ao confirmar saque:', e.message);
    }
}


// ================================================================
// BLOCO 4: REGISTRO DOS EVENTOS NO SOCKET
// ================================================================

export function registrarEventosWallet(socket, io) {

    const uid = () => socket.data.uid;


    // ----------------------------------------------------------------
    // EVENTO: wallet:resgatar_bonus
    // ----------------------------------------------------------------
    socket.on('wallet:resgatar_bonus', async () => {
        const jogadorUid = uid();
        if (!jogadorUid) {
            socket.emit('wallet:bonus_erro', { mensagem: 'Não autenticado.' });
            return;
        }

        try {
            const perfil = await getPerfil(jogadorUid);

            if (!perfil) {
                socket.emit('wallet:bonus_erro', { mensagem: 'Jogador não encontrado.' });
                return;
            }

            const ultimaTx  = await getUltimaTransacao(jogadorUid);
            const resultado = bonus({
                uid:          jogadorUid,
                endereco:     perfil.endereco || '',
                valor:        BONUS_BOAS_VINDAS_BC,
                hashAnterior: ultimaTx?.hash || '0'.repeat(64),
                descricao:    'Bônus de boas-vindas',
            });

            if (!resultado.sucesso) {
                socket.emit('wallet:bonus_erro', { mensagem: resultado.erro });
                return;
            }

            const txConfirmada = confirmarTransacao(resultado.transacao);

            // Transação atômica: lê + marca resgatado numa única operação —
            // sem isso, dois cliques rápidos (ou reconexão) podiam ambos ler
            // bonusResgatado=false e creditar o bônus duas vezes.
            const creditado = await admin.firestore().runTransaction(async (tx) => {
                const ref  = refJogador(jogadorUid);
                const snap = await tx.get(ref);
                if (!snap.exists) return false;
                if (snap.data().bonusResgatado === true) return false;

                tx.update(ref, {
                    saldoBonus:     admin.firestore.FieldValue.increment(BONUS_BOAS_VINDAS_BC),
                    bonusResgatado: true,
                });
                return true;
            });

            if (!creditado) {
                socket.emit('wallet:bonus_erro', { mensagem: 'Bônus já resgatado anteriormente.' });
                return;
            }

            await salvarEEmitirTx(jogadorUid, txConfirmada, socket);

            const perfilAtualizado = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });

            socket.emit('wallet:bonus_creditado', { valor: BONUS_BOAS_VINDAS_BC });
            console.log(`🎁 Bônus creditado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao resgatar bônus:', e.message);
            socket.emit('wallet:bonus_erro', { mensagem: 'Erro interno. Tente novamente.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:depositar
    // Em PRODUÇÃO: cria intenção pendente → aguarda webhook do MP
    // Em DEV:      confirma automaticamente após 3 segundos
    // ----------------------------------------------------------------
    socket.on('wallet:depositar', async ({ valorBRL, taxaBRL, bcEsperado, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // Valida PIN
            const pinCheck = await verificarPin(jogadorUid, pin);
            if (!pinCheck.ok) {
                socket.emit('erro', { mensagem: pinCheck.erro });
                return;
            }

            if (!valorBRL || valorBRL < 1) {
                socket.emit('erro', { mensagem: 'Valor mínimo de depósito: R$ 1,00.' });
                return;
            }
            if (valorBRL > 500) {
                socket.emit('erro', { mensagem: 'Valor máximo por transação: R$ 500,00.' });
                return;
            }

            const totalBRL   = parseFloat((valorBRL + (taxaBRL || 0)).toFixed(2));
            const bcCreditar = Math.floor(valorBRL * COTACAO_BC_POR_REAL);

            // Salva intenção no Firestore
            const intencaoId = `dep_${jogadorUid}_${Date.now()}`;
            await admin.firestore().collection('depositos_pendentes').doc(intencaoId).set({
                uid:       jogadorUid,
                valorBRL,
                taxaBRL:   taxaBRL || 0,
                totalBRL,
                bcCreditar,
                status:    'PENDENTE',
                criadoEm:  admin.firestore.FieldValue.serverTimestamp(),
                socketId:  socket.id,
            });

            if (MODO_DEV) {
                // DEV: simula pagamento e confirma automaticamente em 3s
                console.log(`🧪 [DEV] Depósito simulado: ₿C ${bcCreditar} para ${socket.data.nome}`);

                socket.emit('wallet:deposito_iniciado', {
                    intencaoId,
                    valorBRL,
                    totalBRL,
                    bcCreditar,
                    simulado:      true,
                    pixCopiaECola: 'SIMULADO_DEV_SEM_MERCADOPAGO',
                    mensagemDev:   '⚙️ Modo dev: depósito confirmado automaticamente em 3s',
                });

                setTimeout(async () => {
                    await creditarDeposito(intencaoId, io);
                }, 3000);

            } else {
                // PRODUÇÃO: cria pagamento PIX real no Mercado Pago
                const pagamento = await criarPagamentoPIX({
                    intencaoId,
                    valorBRL,
                    totalBRL,
                    uid:         jogadorUid,
                    nomeJogador: socket.data.nome || 'Jogador',
                });

                if (!pagamento.sucesso) {
                    await admin.firestore().collection('depositos_pendentes').doc(intencaoId).delete();
                    socket.emit('erro', { mensagem: 'Erro ao gerar PIX. Tente novamente.' });
                    console.error(`❌ Falha ao criar PIX para ${socket.data.nome}:`, pagamento.erro);
                    return;
                }

                // Salva o pagamentoId do MP para correlação com o webhook
                await admin.firestore().collection('depositos_pendentes').doc(intencaoId).update({
                    pagamentoId: pagamento.pagamentoId,
                });

                socket.emit('wallet:deposito_iniciado', {
                    intencaoId,
                    valorBRL,
                    totalBRL,
                    bcCreditar,
                    simulado:      false,
                    pagamentoId:   pagamento.pagamentoId,
                    qrCode:        pagamento.qrCode,
                    pixCopiaECola: pagamento.pixCopiaECola,
                    expiracaoEm:   pagamento.expiracaoEm,
                });

                console.log(`💰 PIX criado: R$ ${totalBRL} por ${socket.data.nome} → pagamento ${pagamento.pagamentoId}`);
            }

        } catch (e) {
            console.error('Erro ao iniciar depósito:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar depósito.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:sacar
    // ----------------------------------------------------------------
    socket.on('wallet:sacar', async ({ valorBC, chavePix, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            const pinCheck = await verificarPin(jogadorUid, pin);
            if (!pinCheck.ok) {
                socket.emit('erro', { mensagem: pinCheck.erro });
                return;
            }

            const valor = Math.floor(Number(valorBC));
            if (!Number.isFinite(valor) || valor < SAQUE_MIN_BC) {
                socket.emit('erro', { mensagem: `Saque mínimo: ₿C ${SAQUE_MIN_BC.toLocaleString('pt-BR')}` });
                return;
            }

            const chave = String(chavePix || '').trim();
            if (!chave) {
                socket.emit('erro', { mensagem: 'Informe a chave PIX que vai receber o valor.' });
                return;
            }

            // brlLiquido/taxaBRL são só o que é MOSTRADO/registrado — sempre
            // recalculados aqui a partir de valor, nunca aceitos do cliente
            // (senão o jogador podia inflar o valor a ser pago pelo saque
            // mantendo o débito de ₿C mínimo).
            const brlBruto   = parseFloat((valor / COTACAO_BC_POR_REAL).toFixed(2));
            const taxaBRL    = parseFloat((brlBruto * TAXA_SAQUE).toFixed(2));
            const brlLiquido = parseFloat((brlBruto - taxaBRL).toFixed(2));

            const perfil = await getPerfil(jogadorUid);
            if (!perfil) return;

            // Transação atômica: lê saldo real + limite diário e debita numa
            // única operação — evita corrida (duplo clique, reconexão) que
            // deixaria o saldo negativo ou passaria do limite diário.
            const resultado2 = await admin.firestore().runTransaction(async (tx) => {
                const ref  = refJogador(jogadorUid);
                const snap = await tx.get(ref);
                if (!snap.exists) return { sucesso: false, erro: 'Jogador não encontrado.' };

                const d          = snap.data();
                const saldoReal  = d.saldo      || 0;
                const sacadoHoje = d.sacadoHoje || 0;

                if (valor > saldoReal) {
                    return { sucesso: false, erro: 'Saldo real insuficiente. O bônus não pode ser sacado.' };
                }
                if (sacadoHoje + valor > SAQUE_MAX_DIARIO_BC) {
                    return { sucesso: false, erro: 'Limite diário de saque atingido.' };
                }

                tx.update(ref, {
                    saldo:      admin.firestore.FieldValue.increment(-valor),
                    sacadoHoje: admin.firestore.FieldValue.increment(valor),
                });
                return { sucesso: true };
            });

            if (!resultado2.sucesso) {
                socket.emit('erro', { mensagem: resultado2.erro });
                return;
            }

            const ultimaTx  = await getUltimaTransacao(jogadorUid);
            const resultado = sacar({
                uid:            jogadorUid,
                endereco:       perfil.endereco || '',
                valor,
                privateKeyPem:  null,
                hashAnterior:   ultimaTx?.hash || '0'.repeat(64),
                dadosBancarios: { ...(perfil.dadosBancarios || {}), chavePix: chave },
            });

            if (!resultado.sucesso) {
                // Saque já foi debitado na transação acima — devolve o saldo,
                // já que a construção do registro de transação falhou depois.
                await refJogador(jogadorUid).update({
                    saldo:      admin.firestore.FieldValue.increment(valor),
                    sacadoHoje: admin.firestore.FieldValue.increment(-valor),
                });
                socket.emit('erro', { mensagem: resultado.erro });
                return;
            }

            // Fica PENDENTE até o PIX de saída ser realmente enviado —
            // diferente do resto da carteira, isso ainda não confirma na
            // hora (ver processarSaquePIX/confirmarSaque logo abaixo).
            const txPendente = {
                ...resultado.transacao,
                metadados: {
                    ...resultado.transacao.metadados,
                    taxaBRL,
                    brlLiquido,
                    chavePix: chave,
                },
            };

            await salvarEEmitirTx(jogadorUid, txPendente, socket);

            // Lembra a chave PIX pra próxima vez, sem sobrescrever outros
            // dados bancários que já existam no perfil.
            await refJogador(jogadorUid).update({
                dadosBancarios: { ...(perfil.dadosBancarios || {}), chavePix: chave },
            }).catch(() => {});

            const saqueId = `saq_${jogadorUid}_${Date.now()}`;
            await admin.firestore().collection('saques_pendentes').doc(saqueId).set({
                uid:         jogadorUid,
                valorBC:     valor,
                brlBruto,
                taxaBRL,
                brlLiquido,
                chavePix:    chave,
                transacaoId: txPendente.id,
                status:      'PENDENTE',
                criadoEm:    admin.firestore.FieldValue.serverTimestamp(),
                socketId:    socket.id,
            });

            const perfilAtualizado = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });
            socket.emit('wallet:saque_pendente', { saqueId, valorBC: valor, brlLiquido, chavePix: chave });

            if (MODO_DEV) {
                // DEV: simula o envio do PIX e confirma automaticamente em 3s
                console.log(`🧪 [DEV] Saque simulado: ₿C ${valor} (R$ ${brlLiquido}) para ${socket.data.nome} → chave ${chave}`);
                setTimeout(() => confirmarSaque(saqueId, io), 3000);
            } else {
                const envio = await enviarPIXSaida({
                    saqueId, valorBC: valor, brlLiquido, chavePix: chave,
                    uid: jogadorUid, nomeJogador: socket.data.nome,
                });
                if (!envio.sucesso) {
                    // Não devolve o débito automaticamente — o saque fica
                    // registrado como PENDENTE pra processamento manual,
                    // já que o jogador já viu a confirmação do pedido.
                    console.error(`❌ Envio de PIX de saída falhou (saque ${saqueId}):`, envio.erro);
                    socket.emit('notificacao', {
                        mensagem: 'Seu saque foi registrado, mas o envio automático falhou. Nossa equipe vai processar manualmente.',
                    });
                }
            }

            console.log(`⬆️  Saque solicitado: ₿C ${valor} por ${socket.data.nome} → R$ ${brlLiquido} (chave ${chave})`);

        } catch (e) {
            console.error('Erro ao processar saque:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar saque.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:enviar
    // ----------------------------------------------------------------
    socket.on('wallet:enviar', async ({ destinatarioUid, valorBC, mensagem, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            const pinCheck = await verificarPin(jogadorUid, pin);
            if (!pinCheck.ok) {
                socket.emit('wallet:envio_erro', { mensagem: pinCheck.erro });
                return;
            }

            if (jogadorUid === destinatarioUid) {
                socket.emit('wallet:envio_erro', { mensagem: 'Não pode enviar para si mesmo.' });
                return;
            }

            // valor é a ÚNICA entrada confiada ao cliente — taxa e total sempre
            // recalculados aqui. Nunca aceitar taxaBC/totalDebitado do cliente:
            // permitia ao jogador creditar qualquer valorBC debitando quase nada.
            const valor = Math.floor(Number(valorBC));
            if (!Number.isFinite(valor) || valor < ENVIO_MIN_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio mínimo: ₿C ${ENVIO_MIN_BC}` });
                return;
            }
            if (valor > ENVIO_MAX_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio máximo: ₿C ${ENVIO_MAX_BC.toLocaleString('pt-BR')}` });
                return;
            }

            const taxa          = Math.max(TAXA_ENVIO_MIN_BC, Math.ceil(valor * TAXA_ENVIO));
            const totalDebitado = valor + taxa;

            const destinatario = await getPerfil(destinatarioUid);
            if (!destinatario) {
                socket.emit('wallet:envio_erro', { mensagem: 'Destinatário não encontrado.' });
                return;
            }

            // Transação atômica: lê + valida + debita/credita numa única operação —
            // sem isso, dois envios simultâneos (duplo clique, reconexão) podiam
            // ler o mesmo saldo e ambos passar na validação, deixando saldo negativo.
            const resultado = await admin.firestore().runTransaction(async (tx) => {
                const refRem  = refJogador(jogadorUid);
                const snapRem = await tx.get(refRem);
                if (!snapRem.exists) return { sucesso: false, erro: 'Jogador não encontrado.' };

                const remetente  = snapRem.data();
                const saldoReal  = remetente.saldo      || 0;
                const saldoBonus = remetente.saldoBonus || 0;

                if (totalDebitado > saldoReal + saldoBonus) {
                    return { sucesso: false, erro: 'Saldo insuficiente.' };
                }

                const debitarReal  = Math.min(totalDebitado, saldoReal);
                const debitarBonus = totalDebitado - debitarReal;

                tx.update(refRem, {
                    saldo:      admin.firestore.FieldValue.increment(-debitarReal),
                    saldoBonus: admin.firestore.FieldValue.increment(-debitarBonus),
                });
                tx.update(refJogador(destinatarioUid), {
                    saldo: admin.firestore.FieldValue.increment(valor),
                });

                return { sucesso: true, remetenteNome: remetente.nome };
            });

            if (!resultado.sucesso) {
                socket.emit('wallet:envio_erro', { mensagem: resultado.erro });
                return;
            }

            const remetenteNome = resultado.remetenteNome;

            const ultimaTxRemetente    = await getUltimaTransacao(jogadorUid);
            const ultimaTxDestinatario = await getUltimaTransacao(destinatarioUid);

            const txEnvio = confirmarTransacao({
                id:           `env_${jogadorUid}_${Date.now()}`,
                hash:         `env_${jogadorUid}_${Date.now()}`,
                hashAnterior: ultimaTxRemetente?.hash || '0'.repeat(64),
                tipo:         TIPOS.TRANSFERENCIA,
                remetenteUid: jogadorUid,
                destinatarioUid,
                valor:        totalDebitado,
                taxa,
                valorLiquido: valor,
                timestamp:    new Date().toISOString(),
                status:       'CONFIRMADA',
                metadados: {
                    mensagem:        mensagem || null,
                    nomeContraparte: destinatario.nome,
                    descricao:       `Envio para ${destinatario.nome}`,
                },
            });

            const txRecebimento = confirmarTransacao({
                id:           `rec_${destinatarioUid}_${Date.now()}`,
                hash:         `rec_${destinatarioUid}_${Date.now()}`,
                hashAnterior: ultimaTxDestinatario?.hash || '0'.repeat(64),
                tipo:         'RECEBIMENTO',
                remetenteUid: jogadorUid,
                destinatarioUid,
                valor,
                taxa:         0,
                valorLiquido: valor,
                timestamp:    new Date().toISOString(),
                status:       'CONFIRMADA',
                metadados: {
                    mensagem:        mensagem || null,
                    nomeContraparte: remetenteNome,
                    descricao:       `Recebido de ${remetenteNome}`,
                },
            });

            await salvarEEmitirTx(jogadorUid, txEnvio, socket, destinatarioUid);

            const socketDestinatario = encontrarSocket(io, destinatarioUid);
            if (socketDestinatario) {
                await salvarEEmitirTx(destinatarioUid, txRecebimento, socketDestinatario, jogadorUid);
                const perfilDest = await getPerfil(destinatarioUid);
                socketDestinatario.emit('wallet:saldo_atualizado', {
                    saldo:      perfilDest.saldo      || 0,
                    saldoBonus: perfilDest.saldoBonus || 0,
                    sacadoHoje: perfilDest.sacadoHoje || 0,
                });
            } else {
                await refTransacoes(destinatarioUid).doc(txRecebimento.id).set(txRecebimento);
                blockchain.adicionarTransacao({
                    ...txRecebimento,
                    remetenteEndereco:    jogadorUid,
                    destinatarioEndereco: destinatarioUid,
                });
            }

            const perfilRem = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilRem.saldo      || 0,
                saldoBonus: perfilRem.saldoBonus || 0,
                sacadoHoje: perfilRem.sacadoHoje || 0,
            });

            socket.emit('wallet:envio_confirmado', { valorBC: valor, destinatario: destinatario.nome });
            console.log(`➡️  ${remetenteNome} enviou ₿C ${valor} para ${destinatario.nome}`);

        } catch (e) {
            console.error('Erro ao processar envio:', e.message);
            socket.emit('wallet:envio_erro', { mensagem: 'Erro ao processar envio.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: blockchain:verificar
    // Qualquer jogador pode conferir que a cadeia inteira ainda bate —
    // nenhum bloco foi adulterado, o encadeamento de hashes está intacto.
    // ----------------------------------------------------------------
    socket.on('blockchain:verificar', () => {
        const validacao = blockchain.validarCadeia();
        socket.emit('blockchain:status', {
            ...blockchain.getInfo(),
            valida: validacao.valida,
            motivo: validacao.motivo || null,
        });
    });

    // ----------------------------------------------------------------
    // EVENTO: blockchain:meu_historico
    // Histórico do próprio jogador reconstruído DIRETO da blockchain
    // (não do Firestore) — prova de que as transações estão mesmo
    // registradas na cadeia, com o número do bloco de cada uma.
    // ----------------------------------------------------------------
    socket.on('blockchain:meu_historico', () => {
        const jogadorUid = uid();
        if (!jogadorUid) return;
        socket.emit('blockchain:meu_historico_resultado', {
            historico: blockchain.getHistoricoEndereco(jogadorUid),
        });
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:buscar_historico
    // ----------------------------------------------------------------
    socket.on('wallet:buscar_historico', async ({ periodo = '30d' } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            let query = refTransacoes(jogadorUid).orderBy('timestamp', 'desc');

            if (periodo !== 'tudo') {
                const agora  = new Date();
                const inicio = new Date(agora);
                if (periodo === 'hoje')     inicio.setHours(0, 0, 0, 0);
                else if (periodo === '7d')  inicio.setDate(agora.getDate() - 7);
                else if (periodo === '30d') inicio.setDate(agora.getDate() - 30);
                query = query.where('timestamp', '>=', inicio.toISOString());
            }

            query = query.limit(100);

            const snap       = await query.get();
            const transacoes = snap.docs.map(doc => formatarTxParaFrontend(doc.data(), jogadorUid));
            socket.emit('wallet:historico', { transacoes });

        } catch (e) {
            console.error('Erro ao buscar histórico:', e.message);
            socket.emit('wallet:historico', { transacoes: [] });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:buscar_jogador
    // ----------------------------------------------------------------
    socket.on('wallet:buscar_jogador', async ({ query: q } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid || !q || q.trim().length < 3) {
            socket.emit('wallet:jogador_nao_encontrado');
            return;
        }

        try {
            const db       = admin.firestore();
            const queryStr = q.trim();
            let   encontrado = null;

            const docUid = await db.collection('jogadores').doc(queryStr).get();
            if (docUid.exists && docUid.id !== jogadorUid) {
                encontrado = { uid: docUid.id, ...docUid.data() };
            }

            if (!encontrado) {
                const snap = await db.collection('jogadores')
                    .where('nome', '>=', queryStr)
                    .where('nome', '<=', queryStr + '\uf8ff')
                    .limit(1)
                    .get();

                if (!snap.empty) {
                    const doc = snap.docs[0];
                    if (doc.id !== jogadorUid) {
                        encontrado = { uid: doc.id, ...doc.data() };
                    }
                }
            }

            if (encontrado) {
                socket.emit('wallet:jogador_encontrado', {
                    uid:    encontrado.uid,
                    nome:   encontrado.nome   || 'Jogador',
                    avatar: encontrado.avatar || '',
                });
            } else {
                socket.emit('wallet:jogador_nao_encontrado');
            }

        } catch (e) {
            console.error('Erro ao buscar jogador:', e.message);
            socket.emit('wallet:jogador_nao_encontrado');
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:criar_pin
    // Salva hash bcrypt do PIN no primeiro cadastro.
    // O PIN nunca é salvo em texto claro.
    // ----------------------------------------------------------------
    socket.on('wallet:criar_pin', async ({ pin } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            if (!pin || String(pin).length < 4) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN deve ter no mínimo 4 dígitos.' });
                return;
            }

            const perfil = await getPerfil(jogadorUid);
            if (perfil?.pinHash) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN já existe. Use alterar PIN.' });
                return;
            }

            const pinHash = await bcrypt.hash(String(pin), 12);
            await refJogador(jogadorUid).update({ pinHash });

            socket.emit('wallet:pin_criado');
            console.log(`🔐 PIN criado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao criar PIN:', e.message);
            socket.emit('wallet:pin_erro', { mensagem: 'Erro ao salvar PIN.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:alterar_pin
    // Verifica PIN atual com bcrypt e salva novo hash.
    // ----------------------------------------------------------------
    socket.on('wallet:alterar_pin', async ({ pinAtual, pinNovo } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            if (!pinAtual || !pinNovo || String(pinNovo).length < 4) {
                socket.emit('wallet:pin_erro', { mensagem: 'Dados inválidos. PIN mínimo: 4 dígitos.' });
                return;
            }

            const perfil = await getPerfil(jogadorUid);
            if (!perfil?.pinHash) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN não configurado.' });
                return;
            }

            const pinOk = await bcrypt.compare(String(pinAtual), perfil.pinHash);
            if (!pinOk) {
                socket.emit('wallet:pin_erro', { tipo: 'PIN_INCORRETO', mensagem: 'PIN atual incorreto.' });
                return;
            }

            const mesmoPIN = await bcrypt.compare(String(pinNovo), perfil.pinHash);
            if (mesmoPIN) {
                socket.emit('wallet:pin_erro', { mensagem: 'O novo PIN deve ser diferente do atual.' });
                return;
            }

            const novoPinHash = await bcrypt.hash(String(pinNovo), 12);
            await refJogador(jogadorUid).update({ pinHash: novoPinHash });

            socket.emit('wallet:pin_alterado');
            console.log(`🔐 PIN alterado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao alterar PIN:', e.message);
            socket.emit('wallet:pin_erro', { mensagem: 'Erro ao alterar PIN.' });
        }
    });
}


// ================================================================
// BLOCO 5: RESET DO SACADO_HOJE (cron diário)
// ================================================================

export async function resetarLimiteDiario() {
    try {
        const db        = admin.firestore();
        const jogadores = await db.collection('jogadores')
            .where('sacadoHoje', '>', 0)
            .get();

        const batch = db.batch();
        jogadores.docs.forEach(doc => {
            batch.update(doc.ref, { sacadoHoje: 0 });
        });

        await batch.commit();
        console.log(`🔄 Limite diário zerado para ${jogadores.size} jogador(es).`);

    } catch (e) {
        console.error('Erro ao resetar limite diário:', e.message);
    }
}


// ================================================================
// BLOCO 6: MINERAÇÃO PERIÓDICA DA BLOCKCHAIN INTERNA
//
// Chamado por um setInterval em server.js. Não há rede de nós de
// verdade (Fase 1 centralizada) — "minerar" aqui só fecha os blocos
// pendentes na mempool em blocos encadeados e persistidos, deixando
// o histórico auditável e à prova de adulteração.
// ================================================================

export async function minerarBlocoSeNecessario() {
    if (blockchain.mempool.length === 0) return;
    try {
        const resultado = await blockchain.minarBloco('BC_SISTEMA_NODE_CENTRAL');
        if (resultado.sucesso) {
            console.log(`⛏️  Blockchain: bloco #${resultado.bloco.indice} minerado — ${resultado.transacoes} tx, ${resultado.tentativas} tentativas, ${resultado.tempoMineracao}.`);
        }
    } catch (e) {
        console.error('Erro ao minerar bloco:', e.message);
    }
}


// ================================================================
// BLOCO 6: HELPERS INTERNOS
// ================================================================

async function getUltimaTransacao(uid) {
    try {
        const snap = await refTransacoes(uid)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        if (snap.empty) return null;
        return snap.docs[0].data();
    } catch {
        return null;
    }
}

function encontrarSocket(io, uid) {
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.uid === uid) return socket;
    }
    return null;
}
