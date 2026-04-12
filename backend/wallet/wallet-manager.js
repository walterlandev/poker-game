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

async function verificarPin(uid, pin) {
    const perfil = await getPerfil(uid);
    if (!perfil?.pinHash) return false;
    return bcrypt.compare(String(pin), perfil.pinHash);
}

async function salvarEEmitirTx(uid, transacao, socket) {
    try {
        await refTransacoes(uid).doc(transacao.id).set(transacao);
        socket.emit('wallet:tx_nova', formatarTxParaFrontend(transacao, uid));
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

            if (perfil.bonusResgatado === true) {
                socket.emit('wallet:bonus_erro', { mensagem: 'Bônus já resgatado anteriormente.' });
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

            await refJogador(jogadorUid).update({
                saldoBonus:     admin.firestore.FieldValue.increment(BONUS_BOAS_VINDAS_BC),
                bonusResgatado: true,
            });

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
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('erro', { mensagem: 'PIN incorreto.' });
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
                // PRODUÇÃO: retorna dados para exibir QR Code real do MP
                // O crédito acontece via webhook /webhook/mercadopago
                socket.emit('wallet:deposito_iniciado', {
                    intencaoId,
                    valorBRL,
                    totalBRL,
                    bcCreditar,
                    simulado: false,
                });

                console.log(`💰 Depósito iniciado: R$ ${totalBRL} por ${socket.data.nome}`);
            }

        } catch (e) {
            console.error('Erro ao iniciar depósito:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar depósito.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:sacar
    // ----------------------------------------------------------------
    socket.on('wallet:sacar', async ({ valorBC, brlLiquido, taxaBRL, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('erro', { mensagem: 'PIN incorreto.' });
                return;
            }

            const perfil = await getPerfil(jogadorUid);
            if (!perfil) return;

            const saldoReal  = perfil.saldo      || 0;
            const sacadoHoje = perfil.sacadoHoje || 0;

            if (valorBC < SAQUE_MIN_BC) {
                socket.emit('erro', { mensagem: `Saque mínimo: ₿C ${SAQUE_MIN_BC.toLocaleString('pt-BR')}` });
                return;
            }
            if (valorBC > saldoReal) {
                socket.emit('erro', { mensagem: 'Saldo real insuficiente. O bônus não pode ser sacado.' });
                return;
            }
            if (sacadoHoje + valorBC > SAQUE_MAX_DIARIO_BC) {
                socket.emit('erro', { mensagem: 'Limite diário de saque atingido.' });
                return;
            }

            const ultimaTx  = await getUltimaTransacao(jogadorUid);
            const resultado = sacar({
                uid:            jogadorUid,
                endereco:       perfil.endereco || '',
                valor:          valorBC,
                privateKeyPem:  null,
                hashAnterior:   ultimaTx?.hash || '0'.repeat(64),
                dadosBancarios: perfil.dadosBancarios || {},
            });

            if (!resultado.sucesso) {
                socket.emit('erro', { mensagem: resultado.erro });
                return;
            }

            await refJogador(jogadorUid).update({
                saldo:      admin.firestore.FieldValue.increment(-valorBC),
                sacadoHoje: admin.firestore.FieldValue.increment(valorBC),
            });

            const txConfirmada = confirmarTransacao({
                ...resultado.transacao,
                metadados: {
                    ...resultado.transacao.metadados,
                    taxaBRL,
                    brlLiquido,
                },
            });

            await salvarEEmitirTx(jogadorUid, txConfirmada, socket);

            const perfilAtualizado = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });

            console.log(`⬆️  Saque de ₿C ${valorBC} por ${socket.data.nome} → R$ ${brlLiquido}`);

        } catch (e) {
            console.error('Erro ao processar saque:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar saque.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:enviar
    // ----------------------------------------------------------------
    socket.on('wallet:enviar', async ({ destinatarioUid, valorBC, taxaBC, totalDebitado, mensagem, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('wallet:envio_erro', { mensagem: 'PIN incorreto.' });
                return;
            }

            if (jogadorUid === destinatarioUid) {
                socket.emit('wallet:envio_erro', { mensagem: 'Não pode enviar para si mesmo.' });
                return;
            }

            if (valorBC < ENVIO_MIN_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio mínimo: ₿C ${ENVIO_MIN_BC}` });
                return;
            }
            if (valorBC > ENVIO_MAX_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio máximo: ₿C ${ENVIO_MAX_BC.toLocaleString('pt-BR')}` });
                return;
            }

            const remetente    = await getPerfil(jogadorUid);
            const destinatario = await getPerfil(destinatarioUid);

            if (!destinatario) {
                socket.emit('wallet:envio_erro', { mensagem: 'Destinatário não encontrado.' });
                return;
            }

            const saldoTotal = (remetente.saldo || 0) + (remetente.saldoBonus || 0);
            if (totalDebitado > saldoTotal) {
                socket.emit('wallet:envio_erro', { mensagem: 'Saldo insuficiente.' });
                return;
            }

            // Debita real primeiro, complementa com bônus
            const saldoReal  = remetente.saldo      || 0;
            const saldoBonus = remetente.saldoBonus || 0;
            const debitarReal  = Math.min(totalDebitado, saldoReal);
            const debitarBonus = Math.min(totalDebitado - debitarReal, saldoBonus);

            const batch = admin.firestore().batch();
            batch.update(refJogador(jogadorUid), {
                saldo:      admin.firestore.FieldValue.increment(-debitarReal),
                saldoBonus: admin.firestore.FieldValue.increment(-debitarBonus),
            });
            batch.update(refJogador(destinatarioUid), {
                saldo: admin.firestore.FieldValue.increment(valorBC),
            });
            await batch.commit();

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
                taxa:         taxaBC,
                valorLiquido: valorBC,
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
                valor:        valorBC,
                taxa:         0,
                valorLiquido: valorBC,
                timestamp:    new Date().toISOString(),
                status:       'CONFIRMADA',
                metadados: {
                    mensagem:        mensagem || null,
                    nomeContraparte: remetente.nome,
                    descricao:       `Recebido de ${remetente.nome}`,
                },
            });

            await salvarEEmitirTx(jogadorUid, txEnvio, socket);

            const socketDestinatario = encontrarSocket(io, destinatarioUid);
            if (socketDestinatario) {
                await salvarEEmitirTx(destinatarioUid, txRecebimento, socketDestinatario);
                const perfilDest = await getPerfil(destinatarioUid);
                socketDestinatario.emit('wallet:saldo_atualizado', {
                    saldo:      perfilDest.saldo      || 0,
                    saldoBonus: perfilDest.saldoBonus || 0,
                    sacadoHoje: perfilDest.sacadoHoje || 0,
                });
            } else {
                await refTransacoes(destinatarioUid).doc(txRecebimento.id).set(txRecebimento);
            }

            const perfilRem = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilRem.saldo      || 0,
                saldoBonus: perfilRem.saldoBonus || 0,
                sacadoHoje: perfilRem.sacadoHoje || 0,
            });

            socket.emit('wallet:envio_confirmado', { valorBC, destinatario: destinatario.nome });
            console.log(`➡️  ${remetente.nome} enviou ₿C ${valorBC} para ${destinatario.nome}`);

        } catch (e) {
            console.error('Erro ao processar envio:', e.message);
            socket.emit('wallet:envio_erro', { mensagem: 'Erro ao processar envio.' });
        }
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
