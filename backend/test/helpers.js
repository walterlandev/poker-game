/* Auxiliares compartilhados pelos testes do motor (node:test).
   Dirigem o GameManager direto, sem servidor nem Firebase: o io é um
   objeto falso que só registra os eventos emitidos. */

import { GameManager } from '../game-manager.js';

export function criarIoFalso() {
    const eventos = [];
    const emissor = { emit: (ev, dados) => eventos.push({ ev, dados }) };
    return {
        eventos,
        emit:    emissor.emit,
        to:      () => emissor,
        in:      () => ({ fetchSockets: async () => [] }),
        sockets: { sockets: new Map() },
    };
}

export function socketFalso(uid) {
    return { id: `sock_${uid}`, data: { uid }, join() {}, leave() {} };
}

/**
 * Cria um GameManager e uma mesa com jogadores humanos h0..hN-1, cada um
 * com o stack indicado. Ordem dos assentos = ordem do array.
 */
export function montarMesa(stacks, { smallBlind = 10, buyIn = 1000 } = {}) {
    const io = criarIoFalso();
    const gm = new GameManager(io);
    const uids = stacks.map((_, i) => `h${i}`);

    const { mesaId } = gm.criarMesa({ smallBlind, buyIn }, { uid: uids[0], nome: uids[0] });
    for (let i = 1; i < uids.length; i++) {
        gm.entrarMesa(mesaId, { uid: uids[i], nome: uids[i] }, socketFalso(uids[i]));
    }
    const mesa = gm.getMesa(mesaId);
    uids.forEach((uid, i) => { mesa.jogadores[uid].saldo = stacks[i]; });
    return { gm, io, mesaId, mesa, uids };
}

/**
 * Troca as cartas já distribuídas por cartas escolhidas e monta o baralho
 * para que o board saia exatamente como pedido (com burn cards).
 * board = [f1, f2, f3, turn, river]
 */
export function definirCartas(mesa, maos, board) {
    Object.entries(maos).forEach(([uid, cartas]) => {
        if (mesa.jogadores[uid]) mesa.jogadores[uid].cartas = [...cartas];
    });
    if (board) {
        const [f1, f2, f3, turn, river] = board;
        // pop() tira do fim: burn, f1, f2, f3, burn, turn, burn, river
        mesa.baralho = [river, 'B3', turn, 'B2', f3, f2, f1, 'B1'];
    }
}

/** Soma de todas as fichas em jogo na mesa (stacks + pote). */
export function totalFichas(mesa) {
    return Object.values(mesa.jogadores).reduce((s, j) => s + j.saldo, 0) + mesa.pote;
}

/** Ação de um humano (socketId não nulo = ação voluntária do cliente). */
export function agir(gm, mesaId, uid, acao, valor = 0) {
    gm.processarAcao(mesaId, uid, acao, valor, `sock_${uid}`);
}

/** Erros enviados ao socket de um jogador (emitirErro usa io.to(socketId)). */
export function errosEmitidos(io) {
    return io.eventos.filter(e => e.ev === 'erro').map(e => e.dados.mensagem);
}
