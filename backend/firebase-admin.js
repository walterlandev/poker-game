/* ================================================================
   ARQUIVO: backend/firebase-admin.js

   RESPONSABILIDADES:
   → Inicializa o Firebase Admin SDK
   → debitarEntradaMesa    : desconta buyIn do saldo REAL ao sentar
   → creditarSaidaMesa     : devolve fichas restantes ao saldo REAL
   → salvarResultadoRodada : credita prêmio + atualiza ranking
   → buscarRanking / buscarPerfil / buscarSaldo

   REGRA DE OURO DO SALDO:
   saldo      → ₿C comprados com dinheiro real  (pode sacar)
   saldoBonus → ₿C de bônus promocional         (NÃO pode sacar)

   Ao entrar na mesa:
     1. Debita do saldo real primeiro
     2. Se insuficiente, complementa com bônus
     3. Se nem somado cobrir o buyIn → recusa entrada

   Ao ganhar rodada:
     → Credita SEMPRE em saldo real (fichas ganhas viram saldo sacável)

   Ao sair com fichas restantes:
     → Credita em saldo real

   ESTRUTURA FIRESTORE:
   ┌────────────────────────────────────────────────┐
   │ jogadores/{uid}                                │
   │   nome, avatar                                 │
   │   saldo        (₿C reais)                     │
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

            // Regra: debita do saldo real primeiro
            const debitarReal  = Math.min(valorBuyIn, saldo);
            const debitarBonus = valorBuyIn - debitarReal;  // complementa com bônus se necessário

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
// Chamado quando o jogador SAI da mesa com fichas restantes.
// (voluntariamente, por desconexão ou após fim de rodada sem ganho)
//
// Todas as fichas restantes voltam como saldo REAL.
// Isso inclui o buyIn original caso o jogador não tenha perdido.
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
// Chamado pelo game-manager.js ao fim de cada mão (showdown / W.O.)
// Faz DUAS coisas em paralelo:
//
//   A) Atualiza estatísticas no ranking (coleção separada)
//   B) Credita o prêmio no saldo REAL dos vencedores
//
// IMPORTANTE — Contabilidade correta:
//   O buyIn foi debitado em debitarEntradaMesa.
//   Durante o jogo as fichas ficam na mesa (estado em memória).
//   Ao fim da rodada, o vencedor recebe fichasGanhas (pote total).
//   Esse valor inclui o buyIn dele + o que ganhou dos outros.
//   Creditamos fichasGanhas integralmente em saldo real.
//
//   Os perdedores já tiveram seu buyIn debitado ao sentar —
//   não há nada a debitar novamente aqui.
//
// resultados: [{
//   uid, nome, avatar,
//   fichasGanhas,    → total recebido (pote ganho)
//   fichasPerdidas,  → apenas para estatística do ranking
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

        // ---- A) Ranking (estatísticas) ----
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

        // ---- B) Saldo real: credita prêmio ----
        // Só credita vencedores (perdedores não recebem nada)
        if (fichasGanhas > 0) {
            batch.update(refJogador(u), {
                saldo: admin.firestore.FieldValue.increment(fichasGanhas),
            });
        }
    });

    if (humanos === 0) return; // só bots, sem operação no Firebase

    try {
        await batch.commit();
        console.log(`📊 Rodada: ${humanos} jogador(es) atualizados no Firestore.`);
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
// BLOCO 8: BUSCAR SALDO (antes de sentar na mesa)
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
