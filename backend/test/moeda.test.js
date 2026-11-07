/* Moeda da mesa: Real ou Bônus (spec docs/superpowers/specs/2026-11-06-moeda-da-mesa-design.md).
   Cada bloco corresponde a uma regra da seção "Testes" da spec. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../game-manager.js';
import { TournamentManager } from '../tournament-manager.js';
import { criarServicoMesas } from '../servico-mesas.js';
import { criarIoFalso } from './helpers.js';

const TIMERS = { apis: ['setTimeout'] };
const tick = () => new Promise(r => setImmediate(r));

/**
 * Serviço com carteira em memória. debitar/creditar recebem a moeda e são
 * espionados; quando a carteira tem saldo explícito, o débito segue a regra
 * da moeda (planejarDebito) — senão só registra.
 */
function montar({ carteira = {}, planejarDebito = null, planejarCredito = null } = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
    for (const m of gm.getMesasAtivas()) for (const uid of Object.keys(m.jogadores)) gm.sairMesa(m.id, uid);
    const debitos = [], creditos = [];
    const conta = uid => (carteira[uid] ??= { saldo: 100_000, saldoBonus: 100_000 });

    const debitar = async (uid, valor, moeda) => {
        await tick();
        const v = Math.floor(Number(valor)) || 0;
        if (planejarDebito) {
            const plano = planejarDebito(conta(uid), v, moeda);
            if (!plano.sucesso) return plano;
            conta(uid).saldo      -= plano.debitarReal;
            conta(uid).saldoBonus -= plano.debitarBonus;
            debitos.push({ uid, valor: v, moeda });
            return plano;
        }
        debitos.push({ uid, valor: v, moeda });
        return { sucesso: true, fichasDebitadas: v, debitarReal: moeda === 'bonus' ? 0 : v, debitarBonus: moeda === 'bonus' ? v : 0 };
    };
    const creditar = async (uid, valor, moeda, origemBonus = 0) => {
        creditos.push({ uid, valor, moeda, origemBonus });
        if (planejarCredito) {
            const c = planejarCredito(valor, moeda, origemBonus);
            conta(uid).saldo      += c.real;
            conta(uid).saldoBonus += c.bonus;
        }
    };
    const tm = new TournamentManager(io, gm, { creditarSaidaMesa: creditar, buscarSaldo: async () => ({}) });
    gm.setTournamentManager(tm);
    const servico = criarServicoMesas({ io, gameManager: gm, tournamentManager: tm, debitar, creditar, emitirSaldo: async () => {} });
    gm.setAoRemoverPorInatividade(servico.removidoPorInatividade);
    return { io, gm, tm, servico, debitos, creditos, carteira, conta };
}

function sock(uid) {
    const emitidos = [];
    return {
        id: `sock_${uid}`, data: { uid, nome: uid }, emitidos,
        join() {}, leave() {},
        emit(ev, dados) { emitidos.push({ ev, dados }); },
        erros() { return emitidos.filter(e => e.ev === 'erro').map(e => e.dados.mensagem); },
    };
}

/** criarMesa espera 300 ms entre bots: avança o relógio falso até terminar. */
async function criar(t, servico, socket, config) {
    const p = servico.criarMesa(socket, config);
    let pronto = false, id;
    p.then(v => { pronto = true; id = v; });
    for (let i = 0; i < 200 && !pronto; i++) { await tick(); t.mock.timers.tick(100); }
    return id;
}

// ── Regra 6: a moeda é decidida e validada no servidor ────────────────
test('regra 6: config.moeda inválido vira real; bonus é aceito', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm } = montar();
    const a = await criar(t, servico, sock('a6'), { buyIn: 100, moeda: 'dolar' });
    const b = await criar(t, servico, sock('b6'), { buyIn: 100, moeda: 'bonus' });
    const c = await criar(t, servico, sock('c6'), { buyIn: 100 });
    assert.equal(gm.getMesa(a).moeda, 'real');
    assert.equal(gm.getMesa(b).moeda, 'bonus');
    assert.equal(gm.getMesa(c).moeda, 'real');
});

test('regra 6: mesa real com bots é recusada, sem débito', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos } = montar();
    const s = sock('r6');
    const id = await criar(t, servico, s, { buyIn: 100, moeda: 'real', qtdBots: 2 });
    assert.equal(id, undefined);
    assert.deepEqual(s.erros(), ['Bots só jogam em mesa de bônus.']);
    assert.equal(debitos.length, 0);
    assert.equal(gm.getMesasAtivas().some(m => m.jogadores.r6), false);
});

test('regra 6: cliente antigo (bots e sem moeda) vira mesa de bônus', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm } = montar();
    const id = await criar(t, servico, sock('o6'), { buyIn: 100, qtdBots: 1 });
    assert.equal(gm.getMesa(id).moeda, 'bonus');
    assert.equal(Object.keys(gm.getMesa(id).jogadores).length, 2);
});

test('regra 6: estado enviado leva moeda e não leva mais treino', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm } = montar();
    const id = await criar(t, servico, sock('e6'), { buyIn: 100, moeda: 'bonus', qtdBots: 1 });
    const estado = gm.filtrarEstadoParaJogador(gm.getMesa(id), 'e6');
    assert.equal(estado.moeda, 'bonus');
    assert.equal('treino' in estado, false);
});

// ── Regra 1: mesa real debita só saldo real ─────────────────────────
test('regra 1: planejarDebito na moeda real usa só saldo; sem real suficiente recusa mesmo com bônus', async () => {
    const { planejarDebito } = await import('../moeda.js');
    assert.deepEqual(planejarDebito({ saldo: 1000, saldoBonus: 5000 }, 500, 'real'),
        { sucesso: true, fichasDebitadas: 500, debitarReal: 500, debitarBonus: 0 });
    assert.deepEqual(planejarDebito({ saldo: 100, saldoBonus: 5000 }, 500, 'real'),
        { sucesso: false, erro: 'Esta mesa é de saldo real. Você precisa de ₿C 500 de saldo real para entrar.' });
});

test('regra 1: entrar em mesa real cobra só o saldo real (e recusa quem só tem bônus)', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { planejarDebito } = await import('../moeda.js');
    const carteira = { dono1: { saldo: 1000, saldoBonus: 0 }, rico1: { saldo: 800, saldoBonus: 900 }, bonus1: { saldo: 50, saldoBonus: 9000 } };
    const { servico, gm, debitos } = montar({ carteira, planejarDebito });
    const mesaId = await criar(t, servico, sock('dono1'), { buyIn: 500, moeda: 'real' });
    await servico.entrarMesa(sock('rico1'), { mesaId });
    assert.deepEqual(carteira.rico1, { saldo: 300, saldoBonus: 900 });
    assert.ok(debitos.every(d => d.moeda === 'real'));

    const b = sock('bonus1');
    await servico.entrarMesa(b, { mesaId });
    assert.deepEqual(b.erros(), ['Esta mesa é de saldo real. Você precisa de ₿C 500 de saldo real para entrar.']);
    assert.equal(gm.getMesa(mesaId).jogadores.bonus1, undefined);
    assert.deepEqual(carteira.bonus1, { saldo: 50, saldoBonus: 9000 });
});

// ── Regra 2: mesa bônus debita só saldo bônus ───────────────────────
test('regra 2: entrar em mesa de bônus cobra só o bônus (e recusa quem só tem real)', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { planejarDebito } = await import('../moeda.js');
    const carteira = { dono2: { saldo: 0, saldoBonus: 1000 }, misto2: { saldo: 700, saldoBonus: 600 }, real2: { saldo: 9000, saldoBonus: 100 } };
    const { servico, gm, debitos } = montar({ carteira, planejarDebito });
    const mesaId = await criar(t, servico, sock('dono2'), { buyIn: 500, moeda: 'bonus', qtdBots: 1 });
    assert.ok(mesaId, 'mesa de bônus criada');
    assert.deepEqual(carteira.dono2, { saldo: 0, saldoBonus: 500 });
    await servico.entrarMesa(sock('misto2'), { mesaId });
    assert.deepEqual(carteira.misto2, { saldo: 700, saldoBonus: 100 });
    assert.ok(debitos.length === 2 && debitos.every(d => d.moeda === 'bonus'));

    const r = sock('real2');
    await servico.entrarMesa(r, { mesaId });
    assert.deepEqual(r.erros(), ['Esta mesa é de bônus. Você precisa de ₿C 500 de bônus para entrar.']);
    assert.equal(gm.getMesa(mesaId).jogadores.real2, undefined);
    assert.deepEqual(carteira.real2, { saldo: 9000, saldoBonus: 100 });
});

// ── Regra 3: tudo o que sai da mesa volta na moeda dela ──────────────
test('regra 3: planejarCredito — bônus vai todo para saldoBonus; real segue a rede de segurança', async () => {
    const { planejarCredito } = await import('../moeda.js');
    assert.deepEqual(planejarCredito(800, 'bonus', 0),   { real: 0,   bonus: 800 });
    assert.deepEqual(planejarCredito(800, 'real', 0),    { real: 800, bonus: 0 });
    assert.deepEqual(planejarCredito(800, 'real', 300),  { real: 500, bonus: 300 });
    assert.deepEqual(planejarCredito(800, 'real', 9999), { real: 0,   bonus: 800 });
});

test('regra 3: sair, desconectar e vencer por W.O. em mesa de bônus credita bônus; em mesa real, real', async (t) => {
    t.mock.timers.enable(TIMERS);
    const m = await import('../moeda.js');
    const { servico, gm, conta, creditos } = montar({ planejarDebito: m.planejarDebito, planejarCredito: m.planejarCredito });
    const a = sock('s3a'), b = sock('s3b'), r1 = sock('s3r1'), r2 = sock('s3r2');
    const mesaB = await criar(t, servico, a, { buyIn: 500, moeda: 'bonus' });
    await servico.entrarMesa(b, { mesaId: mesaB });
    const antesA = { ...conta('s3a') }, antesB = { ...conta('s3b') };
    // W.O.: a ganha os blinds de b na mão
    gm.iniciarRodada(mesaB);
    const mb = gm.getMesa(mesaB);
    gm.processarAcao(mesaB, mb.turno, 'FOLD', 0, 'x');
    assert.equal(mb.resultadoMao.tipo, 'wo');
    const fichasA = mb.jogadores.s3a.saldo, fichasB = mb.jogadores.s3b.saldo;
    await servico.sairMesa(a, 'voluntária');
    await servico.sairMesa(b, 'desconexão');
    assert.deepEqual(conta('s3a'), { saldo: antesA.saldo, saldoBonus: antesA.saldoBonus + fichasA });
    assert.deepEqual(conta('s3b'), { saldo: antesB.saldo, saldoBonus: antesB.saldoBonus + fichasB });

    const mesaR = await criar(t, servico, r1, { buyIn: 500, moeda: 'real' });
    await servico.entrarMesa(r2, { mesaId: mesaR });
    const antesR = { ...conta('s3r2') };
    await servico.sairMesa(r2, 'voluntária');
    assert.deepEqual(conta('s3r2'), { saldo: antesR.saldo + 500, saldoBonus: antesR.saldoBonus });
    assert.deepEqual(creditos.map(c => c.moeda), ['bonus', 'bonus', 'real']);
});

test('regra 3: remoção por inatividade em mesa de bônus credita bônus', async (t) => {
    t.mock.timers.enable(TIMERS);
    const m = await import('../moeda.js');
    const { servico, gm, conta, creditos } = montar({ planejarDebito: m.planejarDebito, planejarCredito: m.planejarCredito });
    const mesaId = await criar(t, servico, sock('i3a'), { buyIn: 500, moeda: 'bonus' });
    await servico.entrarMesa(sock('i3b'), { mesaId });
    const mesa = gm.getMesa(mesaId);
    gm.iniciarRodada(mesaId);
    const quem = mesa.turno;
    const antes = { ...conta(quem) };
    const fichas = mesa.jogadores[quem].saldo;
    mesa.jogadores[quem].faltasSeguidas = 2;
    for (let i = 0; i < 50; i++) t.mock.timers.tick(1000);
    await tick();
    assert.equal(mesa.jogadores[quem], undefined);
    const credito = creditos.find(c => c.uid === quem);
    assert.equal(credito?.valor, fichas);
    assert.equal(credito?.moeda, 'bonus');
    assert.deepEqual(conta(quem), { saldo: antes.saldo, saldoBonus: antes.saldoBonus + fichas });
});

test('regra 3: estorno de entrada recusada volta na moeda da mesa', async (t) => {
    t.mock.timers.enable(TIMERS);
    const m = await import('../moeda.js');
    const { servico, conta } = montar({ planejarDebito: m.planejarDebito, planejarCredito: m.planejarCredito });
    const mesaId = await criar(t, servico, sock('e3a'), { buyIn: 500, moeda: 'bonus', senha: 'abc' });
    const s = sock('e3b');
    const antes = { ...conta('e3b') };
    await servico.entrarMesa(s, { mesaId, senha: 'errada' });
    assert.deepEqual(s.erros(), ['Senha incorreta.']);
    assert.deepEqual(conta('e3b'), antes);
});

// ── Regra 4: rebuy cobra na moeda da mesa ───────────────────────────
test('regra 4: rebuy cobra na moeda da mesa (bônus em mesa bônus, real em mesa real)', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { planejarDebito } = await import('../moeda.js');
    const carteira = {
        rb_b: { saldo: 5000, saldoBonus: 1000 },
        rb_r: { saldo: 1000, saldoBonus: 5000 },
        rb_x: { saldo: 5000, saldoBonus: 500 },     // só dá para o buy-in de bônus, sem rebuy
    };
    const { servico, gm } = montar({ carteira, planejarDebito });
    const sb = sock('rb_b'), sr = sock('rb_r'), sx = sock('rb_x');
    const mesaB = await criar(t, servico, sb, { buyIn: 500, moeda: 'bonus', qtdBots: 1 });
    const mesaR = await criar(t, servico, sr, { buyIn: 500, moeda: 'real' });

    gm.getMesa(mesaB).jogadores.rb_b.saldo = 0;
    await servico.rebuy(sb, { valor: 500 });
    assert.equal(gm.getMesa(mesaB).jogadores.rb_b.saldo, 500);
    assert.deepEqual(carteira.rb_b, { saldo: 5000, saldoBonus: 0 });

    gm.getMesa(mesaR).jogadores.rb_r.saldo = 0;
    await servico.rebuy(sr, { valor: 500 });
    assert.deepEqual(carteira.rb_r, { saldo: 0, saldoBonus: 5000 });

    await servico.entrarMesa(sx, { mesaId: mesaB });
    gm.getMesa(mesaB).jogadores.rb_x.saldo = 0;
    await servico.rebuy(sx, { valor: 500 });
    assert.deepEqual(sx.erros(), ['Esta mesa é de bônus. Você precisa de ₿C 500 de bônus para entrar.']);
    assert.equal(gm.getMesa(mesaB).jogadores.rb_x.saldo, 0);
    assert.deepEqual(carteira.rb_x, { saldo: 5000, saldoBonus: 0 });
});

// ── Regra 5: bots só em mesa de bônus, nunca em torneio ──────────────
test('regra 5: adicionarBot recusa mesa real e torneio, aceita mesa de bônus', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, tm } = montar();
    const real  = await criar(t, servico, sock('r5'), { buyIn: 100, moeda: 'real' });
    const bonus = await criar(t, servico, sock('b5'), { buyIn: 100, moeda: 'bonus' });
    assert.deepEqual(gm.adicionarBot(real, 0), { sucesso: false, erro: 'Bots só jogam em mesa de bônus.' });
    assert.equal(gm.adicionarBot(bonus, 0).sucesso, true);
    assert.equal(Object.keys(gm.getMesa(bonus).jogadores).length, 2);

    const { torneioId } = tm.criarTorneio({ buyIn: 100, moeda: 'bonus' }, { uid: 't5a', nome: 't5a' });
    tm.entrarTorneio(torneioId, { uid: 't5b', nome: 't5b' });
    tm.iniciarTorneio(torneioId, 't5a');
    const mesaT = tm.getTorneio(torneioId).rodadas[0].mesas[0].mesaId;
    assert.equal(gm.adicionarBot(mesaT, 0).sucesso, false);
});
