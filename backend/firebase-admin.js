/* ================================================================
   ARQUIVO: backend/firebase-admin.js

   RESPONSABILIDADES:
   → Inicializa o Firebase Admin SDK
   → debitarEntradaMesa    : desconta buyIn do saldo REAL ao sentar
   → creditarSaidaMesa     : devolve fichas restantes ao saldo REAL
   → salvarResultadoRodada : atualiza APENAS ranking (sem tocar saldo)
   → buscarRanking / buscarPerfil / buscarSaldo

   REGRA DE OURO DO SALDO:
   saldo      → ₿C comprados com dinheiro real  (pode sacar)
   saldoBonus → ₿C de bônus promocional         (NÃO pode sacar)

   FLUXO CORRETO DE FICHAS:
   1. Jogador entra na mesa → debitarEntradaMesa() subtrai saldo real
   2. Fichas ficam em memória no game-manager durante o jogo
   3. Rodadas: fichas mudam só em memória (saldo Firestore não muda)
   4. Jogador sai com fichas → creditarSaidaMesa() devolve ao saldo real
   5. salvarResultadoRodada() só salva estatísticas de ranking

   POR QUE NÃO CREDITAR NO SHOWDOWN?
   O vencedor ainda está NA mesa com as fichas em memória.
   Se creditarmos no showdown E na saída → saldo duplicado.
   A única fonte de verdade do saldo em jogo é o game-manager.
   Quando o jogador sair, creditarSaidaMesa() devolve tudo.

   ESTRUTURA FIRESTORE:
   ┌────────────────────────────────────────────────┐
   │ jogadores/{uid}                                │
   │   nome, avatar                                 │
   │   saldo        (₿C reais — fora da mesa)      │
   │   saldoBonus   (₿C de bônus)                  │
   │   sacadoHoje   (controle de limite diário)     │
   │   pinHash      (bcrypt do PIN de saque)        │
   │   bonusResgatado (boolean)                     │
   │   endereco     (endereço da carteira ₿C)       │
   │                                                │
   │ ranking/{uid}                                  │
   │   vitorias, fichasGanhas, fichasPerdidas ...   │
   └────────────────────────────────────────────────┘
================================================================ */

import admin        from 'firebase-admin';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join  } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);


// ================================================================
// BLOCO 1: INICIALIZAÇÃO DO FIREBASE ADMIN
// ================================================================

let db = null;

async function inicializarFirebase() {
    if (admin.apps.length > 0) {
        db = admin.firestore();
        return;
    }

    try {
        const caminhoCredenciais = join(__dirname, 'firebase-credentials.json');
        const credenciaisJson    = await readFile(caminhoCredenciais, 'utf-8');
        const credenciais        = JSON.parse(credenciaisJson);

        admin.initializeApp({
            credential: admin.credential.cert(credenciais),
        });

        db = admin.firestore();
        console.log('✅ Firebase Admin inicializado com sucesso.');

    } catch (erro) {
        console.error('❌ Erro ao inicializar Firebase Admin:', erro.message);
        console.warn('⚠️  Saldo real não será persistido — modo offline ativo.');
    }
}

await inicializarFirebase();


// ================================================================
// BLOCO 2: HELPERS INTERNOS
// ================================================================

/** Referência do documento do jogador */
function refJogador(uid) {
    return db.collection('jogadores').doc(uid);
}

/** Busca perfil completo (retorna null se não existir) */
async function getPerfil(uid) {
    if (!db) return null;
    try {
        const snap = await refJogador(uid).get();
        if (!snap.exists) return null;
        return { uid, ...snap.data() };
    } catch (e) {
        console.error('getPerfil erro:', e.message);
        return null;
    }
}

/** Bots nunca têm saldo real — operações ignoradas */
const ehBot = (uid) => !uid || uid.startsWith('bot_');


// ================================================================
// BLOCO 3: DEBITAR ENTRADA NA MESA
//
// Chamado em server.js no evento 'entrar_mesa' e 'criar_mesa'
// ANTES de sentar o jogador na mesa.
//
// Usa transação Firestore para garantir atomicidade:
//   lê saldo → verifica → debita  (tudo ou nada)
//
// Retorna: { sucesso: bool, fichasDebitadas: number, erro?: string }
// ================================================================

export async function debitarEntradaMesa(uid, valorBuyIn) {
    // Bots e modo offline: libera sem debitar
    if (ehBot(uid)) return { sucesso: true, fichasDebitadas: valorBuyIn };
    if (!db)        return { sucesso: true, fichasDebitadas: valorBuyIn };

    try {
        const resultado = await db.runTransaction(async (tx) => {
            const ref  = refJogador(uid);
            const snap = await tx.get(ref);

            if (!snap.exists) {
                return { sucesso: false, erro: 'Conta não encontrada. Faça login novamente.' };
            }

            const { saldo = 0, saldoBonus = 0 } = snap.data();
            const saldoTotal = saldo + saldoBonus;

            if (saldoTotal < valorBuyIn) {
                return {
                    sucesso: false,
                    erro:    `Saldo insuficiente. Você tem ₿C ${saldoTotal.toLocaleString('pt-BR')} e o buy-in é ₿C ${valorBuyIn.toLocaleString('pt-BR')}.`,
                };
            }

            // Regra: debita do saldo real primeiro, complementa com bônus
            const debitarReal  = Math.min(valorBuyIn, saldo);
            const debitarBonus = valorBuyIn - debitarReal;

            tx.update(ref, {
                saldo:      admin.firestore.FieldValue.increment(-debitarReal),
                saldoBonus: admin.firestore.FieldValue.increment(-debitarBonus),
            });

            return { sucesso: true, fichasDebitadas: valorBuyIn };
        });

        if (resultado.sucesso) {
            console.log(`💸 Buy-in: ₿C ${valorBuyIn} debitados de ${uid}`);
        } else {
            console.warn(`⚠️  Buy-in recusado para ${uid}: ${resultado.erro}`);
        }

        return resultado;

    } catch (e) {
        console.error('debitarEntradaMesa erro:', e.message);
        return { sucesso: false, erro: 'Erro interno ao processar buy-in.' };
    }
}


// ================================================================
// BLOCO 4: CREDITAR SAÍDA DA MESA
//
// Chamado quando o jogador SAI da mesa (voluntário ou desconexão).
// Esta é a ÚNICA função que devolve fichas ao saldo real.
//
// Importante: inclui fichas ganhas nas rodadas anteriores,
// pois o saldo da mesa (em memória) já foi atualizado pelo
// game-manager a cada showdown.
// ================================================================

export async function creditarSaidaMesa(uid, fichasRestantes) {
    if (ehBot(uid))           return;
    if (!db)                  return;
    if (fichasRestantes <= 0) return;

    try {
        await refJogador(uid).update({
            saldo: admin.firestore.FieldValue.increment(fichasRestantes),
        });
        console.log(`↩️  Saída mesa: ₿C ${fichasRestantes} devolvidos a ${uid}`);
    } catch (e) {
        console.error('creditarSaidaMesa erro:', e.message);
    }
}


// ================================================================
// BLOCO 5: SALVAR RESULTADO DA RODADA
//
// ⚠️  ATENÇÃO — APENAS ESTATÍSTICAS, SEM TOCAR NO SALDO ⚠️
//
// Esta função SOMENTE atualiza o ranking de estatísticas.
// Ela NÃO credita fichas no saldo real.
//
// Por quê?
//   O vencedor ainda está NA mesa com as fichas em memória.
//   O saldo real só é atualizado quando ele SAI via creditarSaidaMesa().
//   Se creditarmos aqui E na saída, o saldo seria duplicado.
//
// resultados: [{
//   uid, nome, avatar,
//   fichasGanhas,    → para estatística do ranking
//   fichasPerdidas,  → para estatística do ranking
//   venceu,          → boolean
// }]
// ================================================================

export async function salvarResultadoRodada(resultados) {
    if (!db) return;

    const batch = db.batch();
    let humanos = 0;

    resultados.forEach(({ uid: u, nome, avatar, fichasGanhas, fichasPerdidas, venceu }) => {
        if (ehBot(u)) return;
        humanos++;

        // Apenas estatísticas de ranking — sem mexer em saldo/saldoBonus
        const refRanking = db.collection('ranking').doc(u);
        batch.set(refRanking, {
            nome,
            avatar:          avatar || '',
            vitorias:        admin.firestore.FieldValue.increment(venceu ? 1 : 0),
            fichasGanhas:    admin.firestore.FieldValue.increment(fichasGanhas   || 0),
            fichasPerdidas:  admin.firestore.FieldValue.increment(fichasPerdidas || 0),
            fichasLiquidas:  admin.firestore.FieldValue.increment((fichasGanhas || 0) - (fichasPerdidas || 0)),
            partidasJogadas: admin.firestore.FieldValue.increment(1),
            ultimaPartida:   admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // ❌ REMOVIDO: batch.update(refJogador(u), { saldo: ... })
        // O saldo real é gerenciado exclusivamente por:
        //   debitarEntradaMesa() → ao entrar
        //   creditarSaidaMesa()  → ao sair
    });

    if (humanos === 0) return; // só bots, sem operação no Firebase

    try {
        await batch.commit();
        console.log(`📊 Ranking: ${humanos} jogador(es) atualizados.`);
    } catch (e) {
        console.error('salvarResultadoRodada erro:', e.message);
    }
}


// ================================================================
// BLOCO 6: BUSCAR RANKING
// ================================================================

export async function buscarRanking(top = 20) {
    if (!db) return [];

    try {
        const snapshot = await db
            .collection('ranking')
            .orderBy('fichasLiquidas', 'desc')
            .limit(top)
            .get();

        return snapshot.docs.map((doc, index) => ({
            posicao:         index + 1,
            uid:             doc.id,
            nome:            doc.data().nome            || 'Jogador',
            avatar:          doc.data().avatar          || '',
            vitorias:        doc.data().vitorias        || 0,
            fichasGanhas:    doc.data().fichasGanhas    || 0,
            fichasPerdidas:  doc.data().fichasPerdidas  || 0,
            fichasLiquidas:  doc.data().fichasLiquidas  || 0,
            partidasJogadas: doc.data().partidasJogadas || 0,
            ultimaPartida:   doc.data().ultimaPartida?.toDate()?.toISOString() || null,
        }));

    } catch (e) {
        console.error('buscarRanking erro:', e.message);
        return [];
    }
}


// ================================================================
// BLOCO 7: BUSCAR PERFIL
// ================================================================

export async function buscarPerfil(uid) {
    if (!db || !uid) return null;
    return getPerfil(uid);
}


// ================================================================
// BLOCO 8: BUSCAR SALDO
// ================================================================

export async function buscarSaldo(uid) {
    if (ehBot(uid)) return { saldo: Infinity, saldoBonus: 0, total: Infinity };
    if (!db)        return { saldo: 0, saldoBonus: 0, total: 0 };

    try {
        const snap = await refJogador(uid).get();
        if (!snap.exists) return { saldo: 0, saldoBonus: 0, total: 0 };
        const d = snap.data();
        const saldo      = d.saldo      || 0;
        const saldoBonus = d.saldoBonus || 0;
        return { saldo, saldoBonus, total: saldo + saldoBonus };
    } catch (e) {
        console.error('buscarSaldo erro:', e.message);
        return { saldo: 0, saldoBonus: 0, total: 0 };
    }
}
