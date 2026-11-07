/* Bônus nunca vira saldo real (decisão do dono, achado #23).
   Regra: ao apostar, saem primeiro as fichas de bônus do jogador
   (jogador.origemBonus); cada pote/side pot carrega a parte de bônus das
   contribuições, e quem ganha recebe essa parte como bônus (origemBonus). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMesa, definirCartas, agir, avancar } from './helpers.js';

const TIMERS = { apis: ['setTimeout'] };
const BOARD  = ['2♣', '7♦', '9♥', 'J♠', '4♣'];

/** bônus total da mesa: nos stacks + no pote da mão em curso + de quem saiu */
const bonusNaMesa = (mesa) =>
    Object.values(mesa.jogadores).reduce((s, j) => s + (j.origemBonus || 0) + (j.apostaBonus || 0), 0)
    + (mesa.contribuicoesEncerradas || []).reduce((s, c) => s + (c.apostaBonus || 0), 0);

test('A entra só com bônus e perde tudo para B (só real): o ganho de B chega como bônus', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    mesa.jogadores.h0.origemBonus = 1000;          // A = h0, só bônus
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, { h0: ['3♠', '5♦'], h1: ['A♠', 'A♦'] }, BOARD);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);
    agir(gm, mesaId, 'h1', 'CALL');
    avancar(t, 1500 * 4);
    assert.equal(mesa.fase, 'SHOWDOWN');
    assert.equal(mesa.jogadores.h1.saldo, 2000);
    assert.equal(mesa.jogadores.h1.origemBonus, 1000);   // só os 1000 dele são reais
    assert.equal(mesa.jogadores.h0.origemBonus, 0);
});

test('bônus contra bônus: o vencedor fica com tudo em bônus', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    mesa.jogadores.h0.origemBonus = 1000;
    mesa.jogadores.h1.origemBonus = 1000;
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, { h0: ['A♠', 'A♦'], h1: ['3♠', '5♦'] }, BOARD);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);
    agir(gm, mesaId, 'h1', 'CALL');
    avancar(t, 1500 * 4);
    assert.equal(mesa.jogadores.h0.saldo, 2000);
    assert.equal(mesa.jogadores.h0.origemBonus, 2000);
});

test('side pots carregam a origem de cada faixa (bônus sai primeiro ao apostar)', (t) => {
    t.mock.timers.enable(TIMERS);
    // h0 dealer, h1 SB, h2 BB; h0 age primeiro
    const { gm, mesaId, mesa } = montarMesa([1000, 500, 1000]);
    mesa.jogadores.h1.origemBonus = 500;           // h1: só bônus, curto
    mesa.jogadores.h2.origemBonus = 300;           // h2: 300 bônus + 700 real
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, { h0: ['K♠', 'K♦'], h1: ['A♠', 'A♦'], h2: ['3♠', '5♦'] }, BOARD);
    agir(gm, mesaId, 'h0', 'RAISE', 1000);         // h0 all-in, só real
    agir(gm, mesaId, 'h1', 'CALL');                // all-in 500 (bônus)
    agir(gm, mesaId, 'h2', 'CALL');                // all-in 1000 (300 bônus primeiro)
    avancar(t, 1500 * 4);
    assert.equal(mesa.fase, 'SHOWDOWN');
    // principal 1500 (h0 500 real, h1 500 bônus, h2 300 bônus + 200 real) → h1
    assert.equal(mesa.jogadores.h1.saldo, 1500);
    assert.equal(mesa.jogadores.h1.origemBonus, 800);
    // lateral 1000 (h0 500 real, h2 500 real) → h0
    assert.equal(mesa.jogadores.h0.saldo, 1000);
    assert.equal(mesa.jogadores.h0.origemBonus, 0);
});

test('W.O.: o vencedor recebe cada ficha do pote com a origem dela', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000]);
    mesa.jogadores.h0.origemBonus = 1000;          // h0 só bônus, h1 só real
    gm.iniciarRodada(mesaId);
    agir(gm, mesaId, 'h0', 'RAISE', 100);
    agir(gm, mesaId, 'h1', 'FOLD');                // h1 perde o BB (20 real)
    assert.equal(mesa.jogadores.h0.saldo, 1020);
    assert.equal(mesa.jogadores.h0.origemBonus, 1000);
    assert.equal(mesa.jogadores.h1.origemBonus, 0);
});

test('aposta de quem saiu da mesa leva a origem junto (bônus vai como bônus ao vencedor)', (t) => {
    t.mock.timers.enable(TIMERS);
    const { gm, mesaId, mesa } = montarMesa([1000, 1000, 1000]);
    mesa.jogadores.h0.origemBonus = 1000;          // h0 só bônus
    gm.iniciarRodada(mesaId);
    definirCartas(mesa, { h0: ['3♠', '5♦'], h1: ['A♠', 'A♦'], h2: ['K♠', 'K♦'] }, BOARD);
    const bonusAntes = bonusNaMesa(mesa);
    agir(gm, mesaId, 'h0', 'RAISE', 200);
    agir(gm, mesaId, 'h1', 'CALL');
    agir(gm, mesaId, 'h2', 'CALL');
    gm.sairMesa(mesaId, 'h0');                     // sai no flop, 200 de bônus no pote
    const saiuComBonus = 0;                        // stack dele (800) volta, mas não está mais na mesa
    while (mesa.fase !== 'SHOWDOWN') agir(gm, mesaId, mesa.turno, 'CHECK');
    assert.equal(mesa.jogadores.h1.saldo, 1000 - 200 + 600);
    assert.equal(mesa.jogadores.h1.origemBonus, 200);
    assert.equal(bonusNaMesa(mesa) + 800 + saiuComBonus, bonusAntes);
});

// ── Promoção: ₿C 10.000 de bônus automático para conta nova até 07/12/2026 ──
import { bonusBoasVindasAtivo, BONUS_PROMO_FIM_MS } from '../moeda.js';

test('bônus de boas-vindas vale até o fim de 07/12/2026 (horário de Brasília)', () => {
    assert.equal(bonusBoasVindasAtivo(Date.parse('2026-11-07T23:00:00-03:00')), true);
    assert.equal(bonusBoasVindasAtivo(Date.parse('2026-12-07T23:59:00-03:00')), true);
    assert.equal(bonusBoasVindasAtivo(Date.parse('2026-12-08T00:00:01-03:00')), false);
    assert.equal(BONUS_PROMO_FIM_MS, Date.parse('2026-12-08T00:00:00-03:00'));
});
