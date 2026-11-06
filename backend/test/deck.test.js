import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarBaralho } from '../core/deck.js';

test('baralho tem 52 cartas distintas', () => {
    for (let i = 0; i < 200; i++) {
        const b = gerarBaralho();
        assert.equal(b.length, 52);
        assert.equal(new Set(b).size, 52);
    }
});

test('embaralhamento não depende de Math.random (fonte criptográfica)', (t) => {
    // Math.random (xorshift128+ do V8) é previsível a partir de saídas
    // observáveis (ids de mesa, frases e atrasos dos bots...). Com ele
    // travado, dois baralhos têm que continuar diferentes.
    t.mock.method(Math, 'random', () => 0.5);
    const a = gerarBaralho().join(',');
    const b = gerarBaralho().join(',');
    assert.notEqual(a, b);
});

test('distribuição: cada carta aparece no topo com frequência ~uniforme', () => {
    const N = 52_000;
    const cont = {};
    for (let i = 0; i < N; i++) {
        const topo = gerarBaralho()[51];
        cont[topo] = (cont[topo] || 0) + 1;
    }
    assert.equal(Object.keys(cont).length, 52);
    // esperado 1000 por carta; qui-quadrado com 51 g.l. — limite folgado (p ≈ 1e-6)
    const qui = Object.values(cont).reduce((s, o) => s + (o - 1000) ** 2 / 1000, 0);
    assert.ok(qui < 120, `qui-quadrado ${qui.toFixed(1)}`);
});
