/* ================================================================
   ARQUIVO: backend/temas.js

   RESPONSABILIDADE:
   Registra os eventos Socket.io de temas de cartas.
   Chamado dentro do io.on('connection') no server.js.

   EVENTOS RECEBIDOS:
     comprar_tema → debita ₿C e adiciona tema ao perfil
     ativar_tema  → muda o tema ativo do jogador

   EVENTOS EMITIDOS:
     tema:comprado  → { temaId, novoSaldo }
     tema:ativado   → { temaId }
     tema:erro      → { mensagem }

   ESTRUTURA FIRESTORE (jogadores/{uid}):
     tema:           string   → id do tema ativo ('classico', 'neon'...)
     temasComprados: string[] → ids de todos os temas comprados
     saldo:          number   → debitado na compra
     saldoBonus:     number   → usado se saldo real insuficiente
================================================================ */

import admin from 'firebase-admin';

// Catálogo de preços — fonte única de verdade no backend
// (nunca confiar no preço enviado pelo cliente)
const PRECOS = {
    classico:    0,
    quatroCores: 0,
    royal:       1000,
    neon:        500,
    dourado:     800,
    minimalista: 300,
};

const TEMAS_GRATIS = new Set(['classico', 'quatroCores']);

function refJogador(uid) {
    return admin.firestore().collection('jogadores').doc(uid);
}

export function registrarEventosTemas(socket) {

    const uid = () => socket.data.uid;

    // ----------------------------------------------------------------
    // comprar_tema
    // Valida saldo, debita e adiciona tema à lista do jogador.
    // ----------------------------------------------------------------
    socket.on('comprar_tema', async ({ temaId } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // Valida o temaId recebido
            if (!PRECOS.hasOwnProperty(temaId)) {
                socket.emit('tema:erro', { mensagem: 'Tema não encontrado.' });
                return;
            }
            if (TEMAS_GRATIS.has(temaId)) {
                socket.emit('tema:erro', { mensagem: 'Este tema é gratuito, apenas ative-o.' });
                return;
            }

            const preco = PRECOS[temaId];

            // Transação atômica: lê → valida → debita → adiciona
            const resultado = await admin.firestore().runTransaction(async (tx) => {
                const ref  = refJogador(jogadorUid);
                const snap = await tx.get(ref);

                if (!snap.exists) {
                    return { sucesso: false, erro: 'Jogador não encontrado.' };
                }

                const d = snap.data();
                const temasComprados = d.temasComprados || [];
                const saldo          = d.saldo          || 0;
                const saldoBonus     = d.saldoBonus      || 0;
                const saldoTotal     = saldo + saldoBonus;

                // Já comprado?
                if (temasComprados.includes(temaId)) {
                    return { sucesso: false, erro: 'Você já possui este tema.' };
                }

                // Saldo suficiente?
                if (saldoTotal < preco) {
                    return {
                        sucesso: false,
                        erro: `Saldo insuficiente. Você tem ₿C ${saldoTotal.toLocaleString('pt-BR')}.`,
                    };
                }

                // Debita: real primeiro, complementa com bônus
                const debitarReal  = Math.min(preco, saldo);
                const debitarBonus = preco - debitarReal;

                tx.update(ref, {
                    saldo:          admin.firestore.FieldValue.increment(-debitarReal),
                    saldoBonus:     admin.firestore.FieldValue.increment(-debitarBonus),
                    temasComprados: admin.firestore.FieldValue.arrayUnion(temaId),
                });

                return {
                    sucesso:    true,
                    novoSaldo:  saldo - debitarReal,
                    novoBonus:  saldoBonus - debitarBonus,
                };
            });

            if (!resultado.sucesso) {
                socket.emit('tema:erro', { mensagem: resultado.erro });
                return;
            }

            socket.emit('tema:comprado', {
                temaId,
                novoSaldo:  resultado.novoSaldo,
                novoBonus:  resultado.novoBonus,
            });

            // Atualiza saldo na wallet do frontend
            socket.emit('wallet:saldo_atualizado', {
                saldo:      resultado.novoSaldo,
                saldoBonus: resultado.novoBonus,
                sacadoHoje: 0,
            });

            console.log(`🎨 Tema "${temaId}" comprado por ${socket.data.nome}`);

        } catch (e) {
            console.error('comprar_tema erro:', e.message);
            socket.emit('tema:erro', { mensagem: 'Erro interno ao processar compra.' });
        }
    });


    // ----------------------------------------------------------------
    // ativar_tema
    // Apenas atualiza o campo `tema` no Firestore.
    // Não debita nada — só muda qual tema está ativo.
    // ----------------------------------------------------------------
    socket.on('ativar_tema', async ({ temaId } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            if (!PRECOS.hasOwnProperty(temaId)) {
                socket.emit('tema:erro', { mensagem: 'Tema não encontrado.' });
                return;
            }

            // Verifica se o jogador possui o tema (grátis = sempre possui)
            if (!TEMAS_GRATIS.has(temaId)) {
                const snap = await refJogador(jogadorUid).get();
                const temasComprados = snap.data()?.temasComprados || [];
                if (!temasComprados.includes(temaId)) {
                    socket.emit('tema:erro', { mensagem: 'Você não possui este tema.' });
                    return;
                }
            }

            await refJogador(jogadorUid).update({ tema: temaId });

            socket.emit('tema:ativado', { temaId });
            console.log(`🎨 Tema "${temaId}" ativado por ${socket.data.nome}`);

        } catch (e) {
            console.error('ativar_tema erro:', e.message);
            socket.emit('tema:erro', { mensagem: 'Erro interno ao ativar tema.' });
        }
    });
}
