import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularForca } from '../core/engine-poker.js';

const f = (mao, board) => calcularForca(mao, board);
const maior = (a, b) => assert.ok(a.pontos > b.pontos, `${JSON.stringify(a)} deveria vencer ${JSON.stringify(b)}`);
const empate = (a, b) => assert.equal(a.pontos, b.pontos);

test('categorias reconhecidas pelo nome', () => {
    const casos = [
        [['A♠', 'K♠'], ['Q♠', 'J♠', '10♠', '2♥', '3♦'], 'Straight Flush'],
        [['9♠', '9♥'], ['9♦', '9♣', '2♠', '3♥', '4♦'], 'Quadra'],
        [['9♠', '9♥'], ['9♦', '2♣', '2♠', '7♥', 'K♦'], 'Full House'],
        [['A♥', '3♥'], ['9♥', '2♥', 'K♥', '7♠', '8♦'], 'Flush'],
        [['5♠', '6♥'], ['7♦', '8♣', '9♠', 'K♥', '2♦'], 'Sequência'],
        [['5♠', '5♥'], ['5♦', '8♣', '9♠', 'K♥', '2♦'], 'Trinca'],
        [['5♠', '5♥'], ['8♦', '8♣', '9♠', 'K♥', '2♦'], 'Dois Pares'],
        [['5♠', '5♥'], ['3♦', '8♣', '9♠', 'K♥', '2♦'], 'Par'],
        [['5♠', '4♥'], ['J♦', '8♣', '9♠', 'K♥', '2♦'], 'Carta Alta'],
    ];
    for (const [mao, board, nome] of casos) assert.equal(f(mao, board).nome, nome);
});

test('hierarquia: cada categoria vence a de baixo', () => {
    const board = ['2♣', '7♦', '9♥', 'J♠', 'K♣'];
    const maos = [
        f(['3♠', '4♦'], board),                                   // carta alta
        f(['3♠', '3♦'], board),                                   // par
        f(['9♠', '7♣'], board),                                   // dois pares
        f(['9♠', '9♦'], board),                                   // trinca
        f(['10♠', 'Q♦'], board),                                  // sequência
        f(['A♣', '5♣'], ['2♣', '7♣', '9♥', 'J♠', 'K♣']),          // flush
        f(['9♠', '9♦'], ['2♣', '9♥', '7♦', '7♠', 'K♣']),          // full house
        f(['9♠', '9♦'], ['9♣', '9♥', '7♦', 'J♠', 'K♣']),          // quadra
        f(['8♥', '10♥'], ['2♣', '7♦', '9♥', 'J♥', 'Q♥']),         // straight flush
    ];
    for (let i = 1; i < maos.length; i++) maior(maos[i], maos[i - 1]);
});

test('wheel A-2-3-4-5 é sequência de 5 e perde para 2-3-4-5-6', () => {
    const board = ['2♣', '3♦', '4♥', '9♠', 'K♣'];
    const wheel = f(['A♠', '5♦'], board);
    const seis  = f(['5♠', '6♦'], board);
    assert.equal(wheel.nome, 'Sequência');
    maior(seis, wheel);
    maior(wheel, f(['4♠', '4♦'], board)); // wheel > trinca
});

test('steel wheel (straight flush A-5) perde para straight flush 6-high', () => {
    const steel = f(['A♠', '5♠'], ['2♠', '3♠', '4♠', '9♦', 'K♣']);
    const seis  = f(['6♠', '5♠'], ['2♠', '3♠', '4♠', '9♦', 'K♣']);
    assert.equal(steel.nome, 'Straight Flush');
    maior(seis, steel);
});

test('royal flush é o maior straight flush', () => {
    maior(f(['A♥', 'K♥'], ['Q♥', 'J♥', '10♥', '9♥', '2♣']),
          f(['9♥', '8♥'], ['Q♥', 'J♥', '10♥', 'K♣', '2♣']));
});

test('sequência com 6 cartas consecutivas usa a mais alta', () => {
    const board = ['4♣', '5♦', '6♥', '7♠', '2♣'];
    maior(f(['8♠', '9♦'], board), f(['8♠', '3♦'], board));
});

test('kicker decide par igual', () => {
    const board = ['A♣', 'A♦', '7♥', '4♠', '2♣'];
    maior(f(['K♠', '3♦'], board), f(['Q♠', 'J♦'], board));
});

test('par: terceiro kicker conta, quarto não', () => {
    const board = ['K♣', 'K♦', '9♥', '7♠', '2♣'];
    maior(f(['A♠', '8♦'], board), f(['A♦', '6♦'], board));       // 3º kicker 8 > 7? (A,9,8 vs A,9,7)
    empate(f(['A♠', '3♦'], board), f(['A♦', '4♥'], board));      // 3 e 4 não entram nas 5 cartas
});

test('dois pares: com três pares usa os dois maiores e o melhor kicker', () => {
    const board = ['Q♣', 'Q♦', '5♥', '5♠', '3♣'];
    // A-A, Q-Q, kicker 5 (da terceira dupla) vs A-A, Q-Q, kicker K
    maior(f(['A♠', 'A♦'], ['Q♣', 'Q♦', 'K♥', '5♠', '3♣']), f(['A♠', 'A♦'], ['Q♣', 'Q♦', '5♥', '5♠', '3♣']));
    // 3 pares no board+mão: K-K, Q-Q, 5-5 → kicker é o 5
    const tresPares = f(['K♠', 'K♦'], board);
    assert.equal(tresPares.nome, 'Dois Pares');
    maior(f(['K♠', 'K♦'], ['Q♣', 'Q♦', '5♥', '6♠', '3♣']), tresPares);
});

test('dois pares iguais: kicker decide e empate exato quando o board joga', () => {
    const board = ['A♣', 'A♦', 'K♥', 'K♠', 'Q♣'];
    empate(f(['2♠', '3♦'], board), f(['J♦', '9♥'], board));
    maior(f(['A♠', '3♦'], ['K♣', 'K♦', '9♥', '9♠', '2♣']), f(['Q♠', '3♦'], ['K♣', 'K♦', '9♥', '9♠', '2♣']));
});

test('full house: duas trincas → maior vira trinca, menor vira par', () => {
    const r = f(['8♠', '8♦'], ['8♣', '5♦', '5♥', '5♠', 'K♣']);
    assert.equal(r.nome, 'Full House');
    maior(r, f(['K♠', '2♦'], ['5♣', '5♦', '5♥', '8♠', '2♣'])); // 888-55 > 555-22? (888 trinca)
    maior(f(['8♠', '8♦'], ['8♣', 'K♦', 'K♥', '5♠', '5♣']),       // 888-KK
          f(['8♠', '8♦'], ['8♣', 'Q♦', 'Q♥', '5♠', '5♣']));      // 888-QQ
});

test('flush: compara as 5 maiores do naipe e ignora a 6ª', () => {
    const board = ['2♥', '5♥', '9♥', 'J♥', '3♣'];
    maior(f(['A♥', '4♦'], board), f(['K♥', 'Q♥'], board));
    empate(f(['A♥', '3♥'], ['K♥', 'Q♥', 'J♥', '9♥', '2♣']),
           f(['A♥', '4♥'], ['K♥', 'Q♥', 'J♥', '9♥', '2♣']));
});

test('quadra no board: kicker decide; kicker no board empata', () => {
    const board = ['7♣', '7♦', '7♥', '7♠', '2♣'];
    maior(f(['A♠', '3♦'], board), f(['K♠', 'Q♦'], board));
    empate(f(['3♠', '4♦'], ['7♣', '7♦', '7♥', '7♠', 'A♣']), f(['K♠', 'Q♦'], ['7♣', '7♦', '7♥', '7♠', 'A♣']));
});

test('sequência no board joga para os dois: empate', () => {
    const board = ['5♣', '6♦', '7♥', '8♠', '9♣'];
    empate(f(['A♠', 'A♦'], board), f(['2♠', '3♦'], board));
});

test('carta alta: cinco cartas comparadas em ordem', () => {
    const board = ['K♣', '9♦', '7♥', '4♠', '2♣'];
    maior(f(['A♠', '3♦'], board), f(['Q♠', 'J♦'], board));
    empate(f(['5♠', '3♦'], ['A♣', 'K♦', 'J♥', '9♠', '7♣']), f(['6♠', '2♦'], ['A♣', 'K♦', 'J♥', '9♠', '7♣']));
});

// ── Avaliador de referência independente (força bruta nas 21 combinações) ──
const VAL = { J: 11, Q: 12, K: 13, A: 14 };
const valorDe = c => VAL[c.slice(0, -1)] || parseInt(c.slice(0, -1), 10);
function rank5(cartas) {
    const vs = cartas.map(valorDe).sort((a, b) => b - a);
    const flush = new Set(cartas.map(c => c.slice(-1))).size === 1;
    const unicos = [...new Set(vs)];
    let topoSeq = 0;
    if (unicos.length === 5 && vs[0] - vs[4] === 4) topoSeq = vs[0];
    if (unicos.length === 5 && vs[0] === 14 && vs[1] === 5) topoSeq = 5;
    const cont = {};
    vs.forEach(v => { cont[v] = (cont[v] || 0) + 1; });
    const grupos = Object.entries(cont).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const forma = grupos.map(g => g[0]).join('');
    const ordem = grupos.map(g => g[1]);
    if (topoSeq && flush) return [8, topoSeq];
    if (forma === '41') return [7, ...ordem];
    if (forma === '32') return [6, ...ordem];
    if (flush)          return [5, ...vs];
    if (topoSeq)        return [4, topoSeq];
    if (forma === '311')  return [3, ...ordem];
    if (forma === '221')  return [2, ...ordem];
    if (forma === '2111') return [1, ...ordem];
    return [0, ...ordem];
}
function cmp(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] || 0) - (b[i] || 0);
        if (d) return Math.sign(d);
    }
    return 0;
}
function melhor7(cartas) {
    let best = null;
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        const r = rank5(cartas.filter((_, i) => i !== a && i !== b));
        if (!best || cmp(r, best) > 0) best = r;
    }
    return best;
}

test('bate com um avaliador de referência em 20.000 confrontos aleatórios', () => {
    const N = ['♥', '♦', '♣', '♠'], V = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const baralho = []; for (const n of N) for (const v of V) baralho.push(v + n);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let t = 0; t < 20000; t++) {
        const d = [...baralho];
        for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
        const board = d.slice(4, 9), m1 = d.slice(0, 2), m2 = d.slice(2, 4);
        const esperado = cmp(melhor7([...m1, ...board]), melhor7([...m2, ...board]));
        const obtido   = Math.sign(f(m1, board).pontos - f(m2, board).pontos);
        assert.equal(obtido, esperado, `${m1} x ${m2} | board ${board}`);
    }
});
