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

function montar({ bonus = 0 } = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
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
