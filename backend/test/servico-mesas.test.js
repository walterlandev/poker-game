/* Débito/crédito em volta das mesas (servico-mesas.js), com debitar e
   creditar espionados — sem Firebase. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../game-manager.js';
import { TournamentManager } from '../tournament-manager.js';
import { criarServicoMesas } from '../servico-mesas.js';
import { criarIoFalso, avancar } from './helpers.js';

const TIMERS = { apis: ['setTimeout'] };
const tick = () => new Promise(r => setImmediate(r));

function montar({ bonus = 0, aoDebitar = null } = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
    // As mesas vivem num Map do módulo: esvazia o que sobrou de outros testes
    for (const m of gm.getMesasAtivas()) for (const uid of Object.keys(m.jogadores)) gm.sairMesa(m.id, uid);
    const debitos = [], creditos = [];
    const tm = new TournamentManager(io, gm, {
        creditarSaidaMesa: async (uid, valor, origemBonus = 0) => { creditos.push({ uid, valor, origemBonus }); },
        buscarSaldo: async () => ({}),
    });
    gm.setTournamentManager(tm);
    const servico = criarServicoMesas({
        io, gameManager: gm, tournamentManager: tm,
        // débito "lento" (await de verdade, como o Firestore) para expor corridas
        debitar: async (uid, valor) => {
            await tick();
            if (aoDebitar) aoDebitar(uid);
            const v = Math.floor(Number(valor)) || 0;
            debitos.push({ uid, valor: v });
            return { sucesso: true, fichasDebitadas: v, debitarBonus: Math.min(bonus, v) };
        },
        creditar: async (uid, valor, origemBonus = 0) => { creditos.push({ uid, valor, origemBonus }); },
        emitirSaldo: async () => {},
    });
    gm.setAoRemoverPorInatividade(servico.removidoPorInatividade);
    return { io, gm, tm, servico, debitos, creditos };
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

const soma = l => l.reduce((s, x) => s + x.valor, 0);

test('entrar no torneio registra quanto da entrada foi paga com bônus', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, tm } = montar({ bonus: 40 });
    const { torneioId } = tm.criarTorneio({ buyIn: 100 }, { uid: 'h', nome: 'h' });
    await servico.entrarTorneio(sock('x'), { torneioId });
    const torneio = tm.getTorneio(torneioId);
    assert.equal(torneio.jogadores.x.pagoBonus, 40);
    assert.equal(torneio.premioBonus, 40);
});

test('criar, entrar e sair de mesa real: debita o buy-in e devolve o stack', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos, creditos } = montar();
    const a = sock('a'), b = sock('b');
    const mesaId = await servico.criarMesa(a, { buyIn: 500 });
    await servico.entrarMesa(b, { mesaId });
    assert.deepEqual(debitos.map(d => [d.uid, d.valor]), [['a', 500], ['b', 500]]);
    await servico.sairMesa(b, 'voluntária');
    assert.deepEqual(creditos, [{ uid: 'b', valor: 500, origemBonus: 0 }]);
    assert.ok(gm.getMesa(mesaId));
});

// ── #21: uma mesa por jogador ────────────────────────────────────────
test('quem já está sentado não cria nem entra em outra mesa (e não é debitado)', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos } = montar();
    const a = sock('a'), b = sock('b');
    const mesa1 = await servico.criarMesa(a, { buyIn: 500 });
    const mesa2 = await servico.criarMesa(b, { buyIn: 500 });
    const debitosAntes = debitos.length;

    assert.equal(await servico.criarMesa(a, { buyIn: 500 }), undefined);
    assert.equal(await servico.entrarMesa(a, { mesaId: mesa2 }), undefined);
    assert.equal(debitos.length, debitosAntes);
    assert.equal(gm.getMesa(mesa2).jogadores.a, undefined);
    assert.ok(a.erros().every(m => m === 'Você já está sentado em outra mesa. Saia dela antes de entrar em outra.'));
    assert.equal(a.erros().length, 2);

    // reconexão na MESMA mesa continua funcionando, sem novo débito
    assert.equal(await servico.entrarMesa(a, { mesaId: mesa1 }), mesa1);
    assert.equal(debitos.length, debitosAntes);
});

// ── #20: duplo clique / requisições concorrentes ─────────────────────
const liquido = (debitos, creditos, uid) =>
    soma(debitos.filter(d => d.uid === uid)) - soma(creditos.filter(c => c.uid === uid));

test('duplo "Entrar" na mesma mesa debita o buy-in uma vez só', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos, creditos } = montar();
    const mesaId = await servico.criarMesa(sock('a'), { buyIn: 500 });
    const b = sock('b');
    await Promise.all([servico.entrarMesa(b, { mesaId }), servico.entrarMesa(b, { mesaId })]);
    assert.equal(gm.getMesa(mesaId).jogadores.b.saldo, 500);
    assert.equal(liquido(debitos, creditos, 'b'), 500);
});

test('débito feito mas o jogador já estava sentado: o débito é estornado', async (t) => {
    t.mock.timers.enable(TIMERS);
    let gmRef, mesaRef;
    const ctx = montar({ aoDebitar: (uid) => {
        // outra requisição sentou o jogador enquanto o débito rodava
        if (uid === 'b' && mesaRef) gmRef.entrarMesa(mesaRef, { uid: 'b', nome: 'b' }, sock('b'));
    } });
    gmRef = ctx.gm;
    mesaRef = await ctx.servico.criarMesa(sock('a'), { buyIn: 500 });
    await ctx.servico.entrarMesa(sock('b'), { mesaId: mesaRef });
    assert.equal(liquido(ctx.debitos, ctx.creditos, 'b'), 0);
});

test('duplo "Criar mesa" cria uma mesa só e debita uma vez', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos, creditos } = montar();
    const a = sock('criador_duplo');   // mesas são um Map global: uid exclusivo do teste
    await Promise.all([servico.criarMesa(a, { buyIn: 500 }), servico.criarMesa(a, { buyIn: 500 })]);
    assert.equal(gm.getMesasAtivas().filter(m => m.jogadores.criador_duplo).length, 1);
    assert.equal(liquido(debitos, creditos, 'criador_duplo'), 500);
});

test('rebuy duplicado processa uma vez só', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, gm, debitos, creditos } = montar();
    const a = sock('a');
    const mesaId = await servico.criarMesa(a, { buyIn: 500 });
    gm.getMesa(mesaId).jogadores.a.saldo = 0;
    await Promise.all([servico.rebuy(a, { valor: 500 }), servico.rebuy(a, { valor: 500 })]);
    assert.equal(gm.getMesa(mesaId).jogadores.a.saldo, 500);
    assert.equal(liquido(debitos, creditos, 'a'), 1000);
});

test('duplo "Entrar no torneio" debita uma vez só', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { servico, tm, debitos, creditos } = montar();
    const { torneioId } = tm.criarTorneio({ buyIn: 100 }, { uid: 'h', nome: 'h' });
    const x = sock('x');
    await Promise.all([servico.entrarTorneio(x, { torneioId }), servico.entrarTorneio(x, { torneioId })]);
    assert.equal(liquido(debitos, creditos, 'x'), 100);
    assert.equal(tm.getTorneio(torneioId).premioTotal, 200);
});
