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
import { verificarPin } from './wallet/wallet-manager.js';
import { planejarCompraTema } from './moeda.js';

// Catálogo de preços — fonte única de verdade no backend
// (nunca confiar no preço enviado pelo cliente)
const PRECOS = {
    classico:    0,
    quatroCores: 0,
    // Coleções desenhadas (aprovadas em 07/11/2026)
    rivieraNoir: 2500,
    satoshi: 2000,
    lasVegas: 1500,
    cyberNeon: 1500,
    ouroImperial: 3000,
    tropicalBrasil: 3000,
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
    socket.on('comprar_tema', async ({ temaId, pin } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // PIN obrigatório pra qualquer operação que debita saldo —
            // mesma exigência de depósito/saque/envio de ₿C (faltava aqui).
            const pinCheck = await verificarPin(jogadorUid, pin);
            if (!pinCheck.ok) {
                socket.emit('tema:erro', { mensagem: pinCheck.erro });
                return;
            }

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

                // Já comprado?
                if (temasComprados.includes(temaId)) {
                    return { sucesso: false, erro: 'Você já possui este tema.' };
                }

                // Só saldo REAL compra tema (bônus não compra nada na loja)
                const plano = planejarCompraTema(d, preco);
                if (!plano.sucesso) return plano;
                const debitarReal  = plano.debitarReal;
                const debitarBonus = 0;

                tx.update(ref, {
                    saldo:          admin.firestore.FieldValue.increment(-debitarReal),
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
            const perfilAtualizado = await refJogador(jogadorUid).get();
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.data()?.saldo      || 0,
                saldoBonus: perfilAtualizado.data()?.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.data()?.sacadoHoje || 0,
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
            socket.data.tema = temaId;

            socket.emit('tema:ativado', { temaId });
            console.log(`🎨 Tema "${temaId}" ativado por ${socket.data.nome}`);

        } catch (e) {
            console.error('ativar_tema erro:', e.message);
            socket.emit('tema:erro', { mensagem: 'Erro interno ao ativar tema.' });
        }
    });
}
