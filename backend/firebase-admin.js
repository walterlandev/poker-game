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
import { planejarDebito, planejarCredito, normalizarMoeda } from './moeda.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join  } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);


// ================================================================
// BLOCO 1: INICIALIZAÇÃO DO FIREBASE ADMIN
// ================================================================

let db = null;

export async function inicializarFirebase() {
    if (admin.apps.length > 0) {
        db = admin.firestore();
        return;
    }

    try {
        let credenciais;

        // ✅ CORREÇÃO: lê da variável de ambiente em produção (Railway)
        // Fallback para arquivo local em desenvolvimento
        if (process.env.FIREBASE_CREDENTIALS_BASE64) {
            const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
            credenciais = JSON.parse(decoded);
            console.log('🔑 Firebase: usando credenciais base64 do ambiente.');
        } else if (process.env.FIREBASE_CREDENTIALS) {
            credenciais = JSON.parse(process.env.FIREBASE_CREDENTIALS);
            console.log('🔑 Firebase: usando credenciais da variável de ambiente.');
        } else {
            const caminhoCredenciais = join(__dirname, 'firebase-credentials.json');
            const credenciaisJson    = await readFile(caminhoCredenciais, 'utf-8');
            credenciais              = JSON.parse(credenciaisJson);
            console.log('🔑 Firebase: usando arquivo firebase-credentials.json.');
        }

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

// Chamado explicitamente por server.js (await inicializarFirebase())
// durante a inicialização — nunca no topo do módulo. Node só permite
// await no topo em ESM puro; a Hostinger carrega o servidor via
// require() (CommonJS), que não suporta isso (ERR_REQUIRE_ASYNC_MODULE).


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

/** true em produção (Firebase inicializado); false no modo offline de testes locais */
export function firebaseEstaAtivo() {
    return !!db;
}

/**
 * Verifica um ID token do Firebase e devolve o uid REAL do dono da sessão.
 * Nunca confiar no uid que o cliente afirma ser no evento 'autenticar' —
 * ele é público (aparece pra outros jogadores na mesma mesa e via
 * GET /jogador/:uid), então sem essa verificação qualquer um podia abrir
 * uma conexão alegando ser outro uid (inclusive um admin) e assumir a
 * conta dele. Retorna null se o token for inválido/expirado.
 */
export async function verificarIdToken(idToken) {
    if (!db)       return null; // modo offline: sem Firebase inicializado, não dá pra verificar
    if (!idToken)  return null;
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        return decoded.uid;
    } catch (e) {
        console.error('Token de autenticação inválido:', e.message);
        return null;
    }
}


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

export async function debitarEntradaMesa(uid, valorBuyIn, moeda = 'real') {
    moeda = normalizarMoeda(moeda);
    // Nunca confiar em valor vindo do cliente sem validar sinal/tipo — um
    // buyIn negativo ou não-numérico faria o "debitarReal" abaixo virar
    // negativo, e increment(-debitarReal) creditaria ₿C em vez de debitar
    // (exploit real de "imprimir" dinheiro — já aconteceu antes, ver CLAUDE.md).
    valorBuyIn = Math.floor(Number(valorBuyIn));
    if (!Number.isFinite(valorBuyIn) || valorBuyIn <= 0) {
        return { sucesso: false, erro: 'Valor de buy-in inválido.' };
    }

    // Bots e modo offline: libera sem debitar
    if (ehBot(uid)) return { sucesso: true, fichasDebitadas: valorBuyIn, debitarReal: 0, debitarBonus: 0 };
    if (!db) {
        const real = moeda === 'real';
        return { sucesso: true, fichasDebitadas: valorBuyIn, debitarReal: real ? valorBuyIn : 0, debitarBonus: real ? 0 : valorBuyIn };
    }

    try {
        const resultado = await db.runTransaction(async (tx) => {
            const ref  = refJogador(uid);
            const snap = await tx.get(ref);

            if (!snap.exists) {
                return { sucesso: false, erro: 'Conta não encontrada. Faça login novamente.' };
            }

            // Moeda da mesa: 'real' debita só saldo, 'bonus' só saldoBonus.
            // Nunca mistura (ver moeda.js / spec moeda-da-mesa).
            const plano = planejarDebito(snap.data(), valorBuyIn, moeda);
            if (!plano.sucesso) return plano;
            const { debitarReal, debitarBonus } = plano;

            tx.update(ref, {
                saldo:      admin.firestore.FieldValue.increment(-debitarReal),
                saldoBonus: admin.firestore.FieldValue.increment(-debitarBonus),
            });

            return { sucesso: true, fichasDebitadas: valorBuyIn, debitarReal, debitarBonus };
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

// origemBonus: quanto do buy-in/rebuy que formou essa pilha de fichas veio
// do saldo BÔNUS — nunca pode virar mais do que isso de volta em saldo
// bônus; o resto (o que realmente veio de saldo real, mais qualquer ganho
// da mesa) volta como saldo real. Sem isso, sentar numa mesa com bônus e
// sair na sequência "lavava" o bônus (não sacável) em saldo real sacável.
export async function creditarSaidaMesa(uid, fichasRestantes, moeda = 'real', origemBonus = 0) {
    if (ehBot(uid))           return;
    if (!db)                  return;
    if (fichasRestantes <= 0) return;

    // Na moeda da mesa: 'bonus' → tudo em saldoBonus; 'real' → rede de
    // segurança de origemBonus (ver moeda.js / spec moeda-da-mesa).
    const { real: realDevolvido, bonus: bonusDevolvido } = planejarCredito(fichasRestantes, moeda, origemBonus);

    try {
        await refJogador(uid).update({
            saldo:      admin.firestore.FieldValue.increment(realDevolvido),
            saldoBonus: admin.firestore.FieldValue.increment(bonusDevolvido),
        });
        console.log(`↩️  Saída mesa: ₿C ${realDevolvido} (real) + ₿C ${bonusDevolvido} (bônus) devolvidos a ${uid}`);
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


// ================================================================
// BLOCO 9: ATUALIZAR AVATAR (após upload da foto no servidor)
// ================================================================

export async function atualizarAvatar(uid, avatarUrl) {
    if (!db) return { sucesso: false, erro: 'Banco de dados indisponível.' };
    try {
        await refJogador(uid).update({ avatar: avatarUrl });
        return { sucesso: true };
    } catch (e) {
        console.error('atualizarAvatar erro:', e.message);
        return { sucesso: false, erro: 'Erro ao salvar avatar.' };
    }
}
