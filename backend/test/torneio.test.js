import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../game-manager.js';
import { TournamentManager } from '../tournament-manager.js';
import { criarIoFalso, socketFalso, avancar } from './helpers.js';

const TIMERS = { apis: ['setTimeout', 'setInterval'] };

function montarTorneio(nJogadores, config = {}, pagoBonus = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
    // Crédito espionado: registra em vez de ir ao Firestore
    const creditos = [];
    const tm = new TournamentManager(io, gm, {
        creditarSaidaMesa: async (uid, valor, origemBonus = 0) => { creditos.push({ uid, valor, origemBonus }); },
        buscarSaldo:       async () => ({}),
    });
    gm.setTournamentManager(tm);
    const { torneioId } = tm.criarTorneio({ buyIn: 100, ...config }, { uid: 'p0', nome: 'p0', pagoBonus: pagoBonus.p0 || 0 });
    for (let i = 1; i < nJogadores; i++) tm.entrarTorneio(torneioId, { uid: `p${i}`, nome: `p${i}`, pagoBonus: pagoBonus[`p${i}`] || 0 });
    return { io, gm, tm, torneioId, torneio: tm.getTorneio(torneioId), creditos };
}

/** Saída igual à do server.js (processarSaidaMesa): sairMesa + abandonarMesa. */
function sair(gm, tm, torneioId, mesaId, uid) {
    gm.sairMesa(mesaId, uid);
    tm.abandonarMesa(torneioId, uid);
}

test('todos saem de uma mesa de torneio: mesa fecha sem vencedor e o vencedor da outra é campeão', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, tm, torneioId, torneio, creditos } = montarTorneio(4, { jogadoresPorMesa: 2, maxRebuys: 0 });
    tm.iniciarTorneio(torneioId, 'p0');
    const [m0, m1] = torneio.rodadas[0].mesas;
    for (const uid of m0.jogadores) sair(gm, tm, torneioId, m0.mesaId, uid);
    tm.notificarVencedorMesa(torneioId, m1.mesaId, m1.jogadores[0]);
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    assert.equal(torneio.status, 'finalizado');
    assert.equal(torneio.campeao, m1.jogadores[0]);
    assert.deepEqual(creditos, [{ uid: m1.jogadores[0], valor: 400, origemBonus: 0 }]);
});

const esperarCreditos = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const porUid = creditos => Object.fromEntries(creditos.map(c => [c.uid, [c.valor, c.origemBonus]]));

test('abandono na rodada 0, antes de qualquer eliminação: cada um recebe o que pagou, bônus como bônus', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, tm, torneioId, torneio, creditos } = montarTorneio(2, { maxRebuys: 0 }, { p0: 30, p1: 100 });
    tm.iniciarTorneio(torneioId, 'p0');
    const m0 = torneio.rodadas[0].mesas[0];
    for (const uid of m0.jogadores) sair(gm, tm, torneioId, m0.mesaId, uid);
    await esperarCreditos();
    assert.equal(torneio.status, 'finalizado');
    assert.equal(torneio.campeao, null);
    assert.deepEqual(porUid(creditos), { p0: [100, 30], p1: [100, 100] });
});

test('abandono depois de eliminações: prêmio dividido só entre os vivos, eliminado não recebe', async (t) => {
    t.mock.timers.enable(TIMERS);
    // p0..p3, 2 por mesa; pagos: p0 100 real, p1 100 bônus, p2 50 bônus, p3 real
    const { gm, tm, torneioId, torneio, creditos } = montarTorneio(4, { jogadoresPorMesa: 2, maxRebuys: 0 },
                                                                    { p1: 100, p2: 50 });
    tm.iniciarTorneio(torneioId, 'p0');
    const [m0, m1] = torneio.rodadas[0].mesas;
    tm.notificarVencedorMesa(torneioId, m0.mesaId, m0.jogadores[0]);   // eliminação jogando
    tm.notificarVencedorMesa(torneioId, m1.mesaId, m1.jogadores[0]);
    assert.equal(torneio.rodadaAtual, 1);
    const vivos = [m0.jogadores[0], m1.jogadores[0]].sort();
    const final = torneio.rodadas[1].mesas[0];
    for (const uid of final.jogadores) sair(gm, tm, torneioId, final.mesaId, uid);
    await esperarCreditos();
    assert.equal(torneio.status, 'finalizado');
    assert.deepEqual(creditos.map(c => c.uid).sort(), vivos);
    assert.equal(creditos.reduce((s, c) => s + c.valor, 0), 400);          // soma conservada
    assert.equal(creditos.reduce((s, c) => s + c.origemBonus, 0), 150);    // bônus continua bônus
    assert.deepEqual(creditos.map(c => c.valor), [200, 200]);
    // bônus de cada sobrevivente = o próprio bônus pago + parte do bônus dos eliminados
    const pagos = { p0: 0, p1: 100, p2: 50, p3: 0 };
    const bonusEliminados = Object.keys(pagos).filter(u => !vivos.includes(u)).reduce((s, u) => s + pagos[u], 0);
    for (const c of creditos) {
        const extra = c.origemBonus - pagos[c.uid];
        assert.ok(extra === Math.floor(bonusEliminados / 2) || extra === Math.ceil(bonusEliminados / 2),
                  `${c.uid}: bônus ${c.origemBonus}, pagou ${pagos[c.uid]} em bônus`);
    }
});

test('abandono: sobrevivente que pagou com bônus não recebe saldo real de outro sobrevivente', async (t) => {
    t.mock.timers.enable(TIMERS);
    // p0 pagou só bônus, p1 só real; p2 e p3 (eliminados) pagaram real
    const { tm, torneioId, torneio, creditos } = montarTorneio(4, { maxRebuys: 0 }, { p0: 100 });
    tm.iniciarTorneio(torneioId, 'p0');
    torneio.houveEliminacao = true;
    torneio.rodadaAtual = 1;
    torneio.rodadas[1] = { mesas: [{ mesaId: 'x', jogadores: ['p0', 'p1'], vencedor: null, semVencedor: true }] };
    for (const uid of ['p0', 'p1', 'p2', 'p3']) torneio.jogadores[uid].status = 'eliminado';
    torneio.jogadores.p0.abandonouNaRodada = 1;
    torneio.jogadores.p1.abandonouNaRodada = 1;
    await tm._avancarRodada(torneioId);
    await esperarCreditos();
    // cada um: o que pagou (na origem) + metade do pool dos eliminados (200 real)
    assert.deepEqual(porUid(creditos), { p0: [200, 100], p1: [200, 0] });
});

test('sem nenhum vivo no abandono: divide entre quem estava na última rodada', async (t) => {
    t.mock.timers.enable(TIMERS);
    const { tm, torneioId, torneio, creditos } = montarTorneio(3, { maxRebuys: 0 }, { p0: 1 });
    tm.iniciarTorneio(torneioId, 'p0');
    // estado montado: a mesa da rodada fechou sem vencedor e ninguém consta como vivo
    const m0 = torneio.rodadas[0].mesas[0];
    m0.semVencedor = true;
    torneio.jogadores.p0.status = 'eliminado';
    torneio.jogadores.p1.status = 'eliminado';
    torneio.jogadores.p2.status = 'eliminado';
    torneio.houveEliminacao = true;
    await tm._avancarRodada(torneioId);
    await esperarCreditos();
    assert.deepEqual(creditos.map(c => c.uid).sort(), ['p0', 'p1', 'p2']);
    assert.equal(creditos.reduce((s, c) => s + c.valor, 0), 300);
    assert.equal(creditos.reduce((s, c) => s + c.origemBonus, 0), 1);
});

test('nenhuma mesa de torneio é criada com um jogador só', (t) => {
    t.mock.timers.enable(TIMERS);
    const { tm, torneioId, torneio } = montarTorneio(3, { jogadoresPorMesa: 2 });
    tm.iniciarTorneio(torneioId, 'p0');
    const tamanhos = torneio.rodadas[0].mesas.map(m => m.jogadores.length);
    assert.equal(tamanhos.reduce((a, b) => a + b, 0), 3);
    assert.ok(tamanhos.every(n => n >= 2), `mesas com ${tamanhos.join(', ')} jogadores`);
});

test('torneio sem rebuy (maxRebuys 0) é respeitado', (t) => {
    t.mock.timers.enable(TIMERS);
    const { torneio } = montarTorneio(2, { maxRebuys: 0 });
    assert.equal(torneio.maxRebuys, 0);
});

test('quem não está no torneio não consegue sentar numa mesa do torneio', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, tm, torneioId, torneio } = montarTorneio(2);
    tm.iniciarTorneio(torneioId, 'p0');
    const mesaId = torneio.rodadas[0].mesas[0].mesaId;
    const r = gm.entrarMesa(mesaId, { uid: 'intruso', nome: 'intruso' }, socketFalso('intruso'));
    assert.equal(r.sucesso, false);
    assert.equal(gm.getMesa(mesaId).jogadores.intruso, undefined);
    // quem é do torneio continua conseguindo (re)entrar na sala
    assert.equal(gm.entrarMesa(mesaId, { uid: 'p0', nome: 'p0' }, socketFalso('p0')).sucesso, true);
});

test('mesa de torneio que fica com um só jogador (os outros saíram entre mãos) termina e o torneio anda', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, tm, torneioId, torneio } = montarTorneio(3, { jogadoresPorMesa: 3, maxRebuys: 0 });
    tm.iniciarTorneio(torneioId, 'p0');
    const mesaId = torneio.rodadas[0].mesas[0].mesaId;
    // dois saem antes da primeira mão (mesmo caminho de processarSaidaMesa)
    for (const uid of ['p1', 'p2']) { gm.sairMesa(mesaId, uid); tm.abandonarMesa(torneioId, uid); }
    avancar(t, 65_000, 1000);  // inclui a janela de rebuy (60 s)
    assert.equal(torneio.status, 'finalizado', `torneio ficou '${torneio.status}', mesa em ${gm.getMesa(mesaId)?.fase}`);
    assert.equal(torneio.campeao, 'p0');
});
