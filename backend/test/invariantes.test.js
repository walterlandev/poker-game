/* Fuzz do motor: milhares de ações aleatórias (inclusive inválidas e
   saídas no meio da mão) checando os invariantes financeiros e de turno
   a cada passo. Semente fixa → reproduzível. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMesa, avancar } from './helpers.js';

function rng(semente) {
    let s = semente >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const EM_JOGO = ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'];

function checarTurno(mesa, ctx) {
    if (!mesa.turno) return;
    const j = mesa.jogadores[mesa.turno];
    assert.ok(j, `${ctx}: turno com quem não está na mesa (${mesa.turno})`);
    assert.ok(j.cartas.length === 2, `${ctx}: turno com quem não tem cartas`);
    assert.ok(!['fold', 'all-in', 'sitout'].includes(j.status), `${ctx}: turno com status ${j.status}`);
    assert.ok(j.saldo > 0, `${ctx}: turno com saldo 0`);
}

for (const semente of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    test(`fuzz semente ${semente}: fichas conservadas e turno sempre válido`, (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const r = rng(semente * 2654435761);
        const n = 2 + Math.floor(r() * 5);
        const stacks = Array.from({ length: n }, () => 50 + Math.floor(r() * 1500));
        const { gm, mesaId, mesa } = montarMesa(stacks, { smallBlind: 5 + Math.floor(r() * 20) });
        const total = stacks.reduce((a, b) => a + b, 0);
        let saiuComFichas = 0;
        let acoes = 0, maos = 0, acoesNaMao = 0;

        gm.iniciarRodada(mesaId);
        for (let passo = 0; passo < 4000 && gm.getMesa(mesaId); passo++) {
            const ctx = `semente ${semente}, passo ${passo}, fase ${mesa.fase}`;
            assert.equal(totalFichas(mesa) + saiuComFichas, total, `${ctx}: fichas não conservadas`);
            checarTurno(mesa, ctx);
            for (const j of Object.values(mesa.jogadores)) assert.ok(j.saldo >= 0, `${ctx}: saldo negativo (${j.uid}: ${j.saldo})`);

            if (EM_JOGO.includes(mesa.fase) && mesa.turno) {
                acoesNaMao++;
                assert.ok(acoesNaMao < 300, `${ctx}: mão não termina (loop de ação)`);
                const uid = mesa.turno;
                const j   = mesa.jogadores[uid];
                const x   = r();
                // às vezes alguém que NÃO tem a vez tenta agir (deve ser ignorado)
                if (x < 0.05) {
                    const outro = mesa.ordem[Math.floor(r() * mesa.ordem.length)];
                    gm.processarAcao(mesaId, outro, 'RAISE', 999999, `sock_${outro}`);
                    continue;
                }
                if (x < 0.07 && Object.keys(mesa.jogadores).length > 2) {
                    const quem = mesa.ordem[Math.floor(r() * mesa.ordem.length)];
                    saiuComFichas += mesa.jogadores[quem].saldo;
                    gm.sairMesa(mesaId, quem);
                    continue;
                }
                const custo = mesa.maiorAposta - j.apostaRodada;
                let acao, valor = 0;
                if (x < 0.20)      acao = 'FOLD';
                else if (x < 0.50) acao = custo > 0 ? 'CALL' : 'CHECK';
                else if (x < 0.60) acao = 'CHECK';                       // pode ser ilegal
                else if (x < 0.85) { acao = 'RAISE'; valor = mesa.maiorAposta + Math.floor(r() * 3 * mesa.bigBlind) + 1; }
                else               { acao = 'RAISE'; valor = j.saldo + j.apostaRodada; }   // botão All-in
                gm.processarAcao(mesaId, uid, acao, valor, `sock_${uid}`);
                // ação humana recusada (check ilegal, raise abaixo do mínimo,
                // raise sem reabertura): resolve com call/fold
                if (mesa.turno === uid && mesa.fase !== 'SHOWDOWN' && mesa.jogadores[uid]) {
                    gm.processarAcao(mesaId, uid, r() < 0.5 ? 'CALL' : 'FOLD', 0, `sock_${uid}`);
                }
                acoes++;
            } else {
                if (mesa.fase === 'SHOWDOWN') { maos++; acoesNaMao = 0; }
                if (mesa.fase === 'AGUARDANDO') {
                    // recompra quem zerou, pra mesa continuar
                    Object.values(mesa.jogadores).forEach(j => {
                        if (j.saldo === 0) { if (gm.fazerRebuy(mesaId, j.uid, mesa.valorBuyIn).sucesso) saiuComFichas -= mesa.valorBuyIn; }
                    });
                    gm.iniciarRodada(mesaId);
                    if (mesa.fase === 'AGUARDANDO') { if (process.env.FUZZ_LOG) console.log('parou:', semente, mesa.mensagemVitoria, JSON.stringify(Object.values(mesa.jogadores).map(j => [j.uid, j.saldo, j.status]))); break; }
                    continue;
                }
                avancar(t, 1500, 500);
                if (mesa.fase === 'SHOWDOWN') {
                    avancar(t, 8000, 1000);
                    // quem zerou pode recomprar entre as mãos
                    Object.values(mesa.jogadores).forEach(j => {
                        if (j.saldo === 0 && r() < 0.7) { if (gm.fazerRebuy(mesaId, j.uid, mesa.valorBuyIn).sucesso) saiuComFichas -= mesa.valorBuyIn; }
                    });
                }
            }
        }
        if (gm.getMesa(mesaId)) assert.equal(totalFichas(mesa) + saiuComFichas, total);
        if (process.env.FUZZ_LOG) console.log(`semente ${semente}: ${n} jogadores, ${maos} mãos, ${acoes} ações, fase final ${mesa.fase}`);
        assert.ok(acoes > 0);
    });
}

function totalFichas(mesa) {
    return Object.values(mesa.jogadores).reduce((s, j) => s + j.saldo, 0) + mesa.pote;
}
