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
