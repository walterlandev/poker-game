import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../game-manager.js';
import { TournamentManager } from '../tournament-manager.js';
import { criarIoFalso, socketFalso, avancar } from './helpers.js';

const TIMERS = { apis: ['setTimeout', 'setInterval'] };

function montarTorneio(nJogadores, config = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
    const tm = new TournamentManager(io, gm);
    gm.setTournamentManager(tm);
    const { torneioId } = tm.criarTorneio({ buyIn: 100, ...config }, { uid: 'p0', nome: 'p0' });
    for (let i = 1; i < nJogadores; i++) tm.entrarTorneio(torneioId, { uid: `p${i}`, nome: `p${i}` });
    return { io, gm, tm, torneioId, torneio: tm.getTorneio(torneioId) };
}

test('nenhuma mesa de torneio é criada com um jogador só', (t) => {
    t.mock.timers.enable(TIMERS);
    const { tm, torneioId, torneio } = montarTorneio(3, { jogadoresPorMesa: 2 });
    tm.iniciarTorneio(torneioId, 'p0');
    const tamanhos = torneio.rodadas[0].mesas.map(m => m.jogadores.length);
    assert.equal(tamanhos.reduce((a, b) => a + b, 0), 3);
    assert.ok(tamanhos.every(n => n >= 2), `mesas com ${tamanhos.join(', ')} jogadores`);
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
