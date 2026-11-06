/* Cenários do motor (game-manager.js) dirigidos direto, sem servidor.
   Posições na 1ª mão: dealer = h0.
     heads-up: h0 = dealer/SB (age primeiro no pré-flop), h1 = BB
     3 jogadores: h1 = SB, h2 = BB, h0 age primeiro
     4 jogadores: h1 = SB, h2 = BB, h3 = UTG */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMesa, definirCartas, totalFichas, agir, errosEmitidos, avancar } from './helpers.js';

const TIMERS = { apis: ['setTimeout'] };

test('fluxo básico: blinds, dealer heads-up age primeiro, fold dá o pote ao BB', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    assert.equal(mesa.dealer, 'h0');
    assert.equal(mesa.sbId, 'h0');
    assert.equal(mesa.bbId, 'h1');
    assert.equal(mesa.turno, 'h0');
    assert.equal(mesa.pote, 30);
    agir(gm, mesaId, 'h0', 'FOLD');
    assert.equal(mesa.jogadores.h1.saldo, 1010);
    assert.equal(totalFichas(mesa), 2000);
});

test('ação fora de vez é rejeitada', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, io, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h1', 'RAISE', 500);
    assert.equal(mesa.jogadores.h1.apostaRodada, 20);
    assert.ok(errosEmitidos(io).includes('Não é sua vez.'));
});

test('opção do big blind: limp do SB devolve a vez ao BB', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'CALL');
    assert.equal(mesa.fase, 'PRE-FLOP');
    assert.equal(mesa.turno, 'h1');
    agir(gm, mesaId, 'h1', 'CHECK');
    assert.equal(mesa.fase, 'FLOP');
    assert.equal(mesa.turno, 'h1'); // pós-flop heads-up: BB age primeiro
});

test('raise mínimo é validado para humano', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, io, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 30);           // mínimo é 40
    assert.equal(mesa.turno, 'h0');
    assert.ok(errosEmitidos(io).some(m => m.startsWith('Raise mínimo')));
    agir(gm, mesaId, 'h0', 'RAISE', 100);
    assert.equal(mesa.maiorAposta, 100);
    assert.equal(mesa.ultimoRaiseVal, 80);
});

test('all-in pelo botão (RAISE do stack inteiro) marca o jogador como all-in', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    // O botão All-in do ActionBar manda RAISE com saldo + apostaRodada
    agir(gm, mesaId, 'h0', 'RAISE', 1000);
    assert.equal(mesa.jogadores.h0.saldo, 0);
    assert.equal(mesa.jogadores.h0.status, 'all-in');
});

test('quem está all-in nunca recebe a vez nem o relógio nas ruas seguintes', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 500]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);         // all-in pelo botão
    agir(gm, mesaId, 'h1', 'CALL');                // paga all-in (500)
    assert.equal(mesa.fase, 'FLOP');
    assert.equal(mesa.turno, null, `turno deveria ser null, está com ${mesa.turno}`);
    avancar(t, 1500 * 3);
    assert.equal(mesa.fase, 'SHOWDOWN');
    assert.equal(totalFichas(mesa), 1500);
});

test('all-in curto pelo botão (raise incompleto) não reabre nem reduz o raise mínimo', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 130, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 100);          // raise de 80
    agir(gm, mesaId, 'h1', 'RAISE', 130);          // all-in: +30, incompleto
    assert.equal(mesa.jogadores.h1.status, 'all-in');
    assert.equal(mesa.ultimoRaiseVal, 80);
    assert.equal(mesa.primeiroJogador, 'h0');
    assert.equal(mesa.maiorAposta, 130);
});

test('all-in incompleto não reabre o raise para quem já agiu (só pagar ou desistir)', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, io, mesaId, mesa } = montarMesa([1000, 130, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 100);          // h0 já agiu (raise completo)
    agir(gm, mesaId, 'h1', 'RAISE', 130);          // all-in incompleto (+30)
    agir(gm, mesaId, 'h2', 'CALL');                // BB ainda não tinha agido: poderia aumentar, só pagou
    assert.equal(mesa.turno, 'h0');
    agir(gm, mesaId, 'h0', 'RAISE', 400);          // não pode: a ação não foi reaberta pra ele
    assert.equal(mesa.turno, 'h0', 'raise deveria ser recusado');
    assert.equal(mesa.jogadores.h0.apostaRodada, 100);
    assert.ok(errosEmitidos(io).some(m => /pagar ou desistir/i.test(m)));
    agir(gm, mesaId, 'h0', 'CALL');
    assert.equal(mesa.fase, 'FLOP');
});

test('quem ainda não agiu pode aumentar depois de um all-in incompleto', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 130, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 100);
    agir(gm, mesaId, 'h1', 'RAISE', 130);          // incompleto
    agir(gm, mesaId, 'h2', 'RAISE', 300);          // BB: raise completo (130 + 80 mínimo)
    assert.equal(mesa.maiorAposta, 300);
    agir(gm, mesaId, 'h0', 'RAISE', 600);          // ação reaberta para h0
    assert.equal(mesa.maiorAposta, 600);
});

test('fold com check disponível no pós-flop não trava a rodada num loop de check', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'CALL');
    agir(gm, mesaId, 'h1', 'CALL');
    agir(gm, mesaId, 'h2', 'CHECK');
    assert.equal(mesa.fase, 'FLOP');
    assert.equal(mesa.turno, 'h1');
    agir(gm, mesaId, 'h1', 'FOLD');                // primeiro a agir desiste
    agir(gm, mesaId, 'h2', 'CHECK');
    agir(gm, mesaId, 'h0', 'CHECK');
    assert.equal(mesa.fase, 'TURN', `rodada deveria fechar; turno ficou com ${mesa.turno}`);
});

test('jogador all-in não consegue agir durante o runout', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);
    agir(gm, mesaId, 'h1', 'CALL');
    assert.equal(mesa.fase, 'FLOP');
    agir(gm, mesaId, 'h1', 'CHECK');               // clique atrasado / repetido
    assert.equal(mesa.fase, 'FLOP');
    assert.equal(mesa.cartasComunitarias.length, 3);
});

test('com só um jogador com fichas, as ruas seguintes saem sem pedir ação a ninguém', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 500]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 500);          // h0 ainda fica com 500
    agir(gm, mesaId, 'h1', 'CALL');                // h1 paga all-in
    assert.equal(mesa.jogadores.h1.status, 'all-in');
    assert.equal(mesa.fase, 'FLOP');
    assert.equal(mesa.turno, null, `ninguém pode apostar contra h0, mas a vez foi para ${mesa.turno}`);
    avancar(t, 1500 * 3);
    assert.equal(mesa.fase, 'SHOWDOWN');
    assert.equal(totalFichas(mesa), 1500);
});

test('heads-up: SB que fica all-in só com o blind não recebe a vez', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([5, 1000]);
    gm.iniciarRodada(mesaId);
    assert.equal(mesa.jogadores.h0.status, 'all-in');
    assert.notEqual(mesa.turno, 'h0');
    assert.equal(mesa.turno, null, 'BB não tem contra quem apostar');
    avancar(t, 60_000);
    assert.equal(totalFichas(mesa), 1005);
});

test('fichas de quem deu fold e SAIU da mesa continuam no pote principal certo', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 100, 1000, 1000]);
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, {
        h0: ['7♣', '2♦'], h1: ['A♠', 'A♦'], h2: ['K♠', 'K♦'], h3: ['Q♠', 'Q♦'],
    }, ['3♣', '8♦', '9♥', 'J♠', '4♣']);
    agir(gm, mesaId, 'h3', 'RAISE', 100);
    agir(gm, mesaId, 'h0', 'CALL');
    agir(gm, mesaId, 'h1', 'CALL');                // all-in de 100
    agir(gm, mesaId, 'h2', 'CALL');
    assert.equal(mesa.fase, 'FLOP');
    agir(gm, mesaId, 'h2', 'RAISE', 300);
    agir(gm, mesaId, 'h3', 'CALL');
    agir(gm, mesaId, 'h0', 'FOLD');
    gm.sairMesa(mesaId, 'h0');                     // sai depois do fold
    assert.equal(mesa.fase, 'TURN');
    agir(gm, mesaId, 'h2', 'CHECK');
    agir(gm, mesaId, 'h3', 'CHECK');
    agir(gm, mesaId, 'h2', 'CHECK');
    agir(gm, mesaId, 'h3', 'CHECK');
    assert.equal(mesa.fase, 'SHOWDOWN');
    // Pote principal = 4 × 100 (inclui os 100 de h0, que saiu)
    assert.equal(mesa.jogadores.h1.saldo, 400);
    assert.equal(mesa.jogadores.h2.saldo, 1000 - 100 - 300 + 600);
});

test('aposta de uma mão anterior de quem quebrou não entra nos side pots da mão seguinte', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 100, 300, 1000]);
    // Mão 1: h2 (BB) paga all-in de 300 e perde → fica sem fichas
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, { h0: ['9♣', '8♣'], h1: ['6♦', '5♦'], h2: ['7♠', '2♦'], h3: ['A♠', 'A♦'] },
                  ['3♣', '8♦', 'J♥', 'Q♠', '4♣']);
    agir(gm, mesaId, 'h3', 'RAISE', 300);
    agir(gm, mesaId, 'h0', 'FOLD');
    agir(gm, mesaId, 'h1', 'FOLD');
    agir(gm, mesaId, 'h2', 'CALL');
    avancar(t, 1500 * 4);
    assert.equal(mesa.jogadores.h2.saldo, 0);
    // Mão 2 (h2 fica de fora): dealer h1, SB h3, BB h0, h1 age primeiro
    avancar(t, 8000);
    assert.equal(mesa.fase, 'PRE-FLOP');
    assert.equal(mesa.turno, 'h1');
    definirCartas(mesa, { h0: ['Q♣', 'Q♦'], h1: ['A♣', 'A♥'], h3: ['K♣', 'K♥'] },
                  ['2♣', '7♦', '9♥', '3♠', '4♦']);
    const totalAntes = totalFichas(mesa);
    const h3Antes = mesa.jogadores.h3.saldo + mesa.jogadores.h3.apostaRodada;
    agir(gm, mesaId, 'h1', 'RAISE', 90);           // all-in (90)
    agir(gm, mesaId, 'h3', 'CALL');
    agir(gm, mesaId, 'h0', 'CALL');
    agir(gm, mesaId, 'h3', 'RAISE', 200);
    agir(gm, mesaId, 'h0', 'CALL');
    for (let i = 0; i < 4; i++) agir(gm, mesaId, mesa.turno, 'CHECK');
    assert.equal(mesa.fase, 'SHOWDOWN');
    assert.equal(totalFichas(mesa), totalAntes);
    assert.equal(mesa.jogadores.h1.saldo, 270);                    // pote principal 3 × 90
    assert.equal(mesa.jogadores.h3.saldo, h3Antes - 290 + 400);    // side pot 2 × 200
});

test('iniciarRodada com mão em andamento não apaga o pote', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 200);
    gm.iniciarRodada(mesaId);                      // ex.: host clica "Iniciar" de novo
    assert.equal(totalFichas(mesa), 3000);
    assert.equal(mesa.jogadores.h0.apostaTotal, 200);
});

test('runout de all-in não continua depois que a mão acabou por W.O.', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);
    agir(gm, mesaId, 'h1', 'CALL');
    agir(gm, mesaId, 'h2', 'FOLD');
    assert.equal(mesa.fase, 'FLOP');
    gm.sairMesa(mesaId, 'h1');                     // sai no meio do runout
    assert.equal(mesa.resultadoMao.tipo, 'wo');
    avancar(t, 1600);
    assert.equal(mesa.resultadoMao.tipo, 'wo', 'timer antigo do runout recalculou o showdown');
});

test('remoção por inatividade (3ª falta) avisa o servidor com as fichas a devolver', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    const removidos = [];
    gm.setAoRemoverPorInatividade?.((info) => removidos.push(info));
    gm.iniciarRodada(mesaId);
    mesa.jogadores.h0.faltasSeguidas = 2;
    mesa.jogadores.h0.origemBonus    = 300;
    avancar(t, 45_500);
    assert.equal(mesa.jogadores.h0, undefined);
    assert.deepEqual(removidos, [{ mesaId, uid: 'h0', saldo: 1000, origemBonus: 300, torneioId: null }]);
});

test('id de mesa repetido não sobrescreve uma mesa existente', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId: id1 } = montarMesa([1000, 1000]);
    const sequencia = [0.5, 0.5, 0.9, 0.9, 0.3, 0.3];
    let i = 0;
    t.mock.method(Math, 'random', () => sequencia[i++ % sequencia.length]);
    const { mesaId: a } = gm.criarMesa({}, { uid: 'x1', nome: 'x1' });
    const { mesaId: b } = gm.criarMesa({}, { uid: 'x2', nome: 'x2' });
    assert.notEqual(a, b);
    assert.equal(gm.getMesa(a).host, 'x1');
    assert.equal(gm.getMesa(b).host, 'x2');
    assert.ok(gm.getMesa(id1));
});

test('rebuy pago com saldo real não vira bônus por causa do bônus já perdido', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    const j = mesa.jogadores.h0;
    j.origemBonus = 1000;          // entrou com 1000 de bônus...
    j.saldo       = 0;             // ...e perdeu tudo
    const r = gm.fazerRebuy(mesaId, 'h0', 1000, 0);   // rebuy 100% saldo real
    assert.equal(r.sucesso, true);
    assert.equal(j.saldo, 1000);
    // origemBonus 1000 faria creditarSaidaMesa devolver os 1000 reais como BÔNUS
    assert.equal(j.origemBonus, 0);
});

test('vitória por W.O. não revela as cartas do vencedor aos outros', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 100);
    agir(gm, mesaId, 'h1', 'FOLD');
    assert.equal(mesa.resultadoMao.tipo, 'wo');
    const visto = gm.filtrarEstadoParaJogador(mesa, 'h1');
    assert.deepEqual(visto.jogadores.h0.cartas, ['XX', 'XX']);
});
