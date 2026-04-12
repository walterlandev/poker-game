/* ================================================================
   ARQUIVO: frontend/src/components/HandStrength.jsx

   O QUE FAZ:
   Exibe a força da mão em tempo real com:
     → Anel circular de vitória (% atualizada a cada carta)
     → Nome da mão colorido por categoria
     → Barra de nível (Carta Alta → Straight Flush)
     → Stats: vitória / empate / derrota
     → Animação "Mão melhorou!" quando a combinação sobe

   COMO CALCULA O % DE VITÓRIA — MONTE CARLO:
   Simula N partidas aleatórias completando as cartas restantes
   da mesa com cartas do baralho e comparando contra 1 oponente.
   Com N=600 simulações, o erro é ≤ 4% e roda em < 5ms.

   PROPS:
     cartasMao  → ['As', 'Kh']          (códigos do servidor: valor+naipe)
     cartasMesa → ['Td', 'Jc', 'Qh']   (0 a 5 cartas)
     visivel    → boolean
     nOponentes → number (padrão 1)
================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react';

// ================================================================
// BLOCO 1: ENGINE LOCAL (independe do engine-poker.js)
//
// Reimplementação compacta para evitar dependência circular.
// Usa a mesma lógica de pontuação do engine-poker.js mas
// otimizada para rodar centenas de vezes por simulação.
// ================================================================

const VALS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['h','d','c','s'];
const DECK  = VALS.flatMap(v => SUITS.map(s => v + s));

const VAL_MAP = { T:10, J:11, Q:12, K:13, A:14 };
const valNum  = (c) => VAL_MAP[c.slice(0,-1)] || parseInt(c.slice(0,-1));
const suit    = (c) => c.slice(-1);

/** Gera todas as combinações de k elementos de arr */
function combinar(arr, k) {
    if (k === 0) return [[]];
    if (!arr.length) return [];
    const [h, ...t] = arr;
    return [
        ...combinar(t, k - 1).map(c => [h, ...c]),
        ...combinar(t, k),
    ];
}

/** Pontua uma mão de exatamente 5 cartas */
function pontuar5(cartas) {
    const vals  = cartas.map(valNum).sort((a, b) => b - a);
    const suits = cartas.map(suit);
    const flush = suits.every(s => s === suits[0]);

    const cnt = {};
    vals.forEach(v => (cnt[v] = (cnt[v] || 0) + 1));
    const grps = Object.values(cnt).sort((a, b) => b - a);
    const uniq = [...new Set(vals)];

    let straight = false, hiSt = 0;
    if (uniq.length === 5 && vals[0] - vals[4] === 4) { straight = true; hiSt = vals[0]; }
    if (!straight && uniq.includes(14) && [2,3,4,5].every(x => uniq.includes(x))) {
        straight = true; hiSt = 5;
    }

    const kicker = (n = 5) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += vals[i] * Math.pow(15, n - 1 - i);
        return s;
    };

    if (flush && straight) return 9e7 + hiSt;
    if (grps[0] === 4)     return 8e7 + kicker();
    if (grps[0] === 3 && grps[1] === 2) return 7e7 + kicker();
    if (flush)             return 6e7 + kicker();
    if (straight)          return 5e7 + hiSt;
    if (grps[0] === 3)     return 4e7 + kicker();
    if (grps[0] === 2 && grps[1] === 2) return 3e7 + kicker();
    if (grps[0] === 2)     return 2e7 + kicker();
    return 1e7 + kicker();
}

/** Melhor mão possível dentre 5, 6 ou 7 cartas */
function melhorMao(cartas) {
    if (cartas.length < 5) return avaliarPreFlop(cartas);
    return Math.max(...combinar(cartas, 5).map(pontuar5));
}

/** Heurística para pré-flop (menos de 5 cartas) */
function avaliarPreFlop(cartas) {
    if (!cartas || cartas.length < 2) return 0;
    const [v1, v2] = cartas.map(valNum);
    let p = v1 + v2;
    if (v1 === v2) { p += 20; if (v1 > 10) p += 15; }
    if (suit(cartas[0]) === suit(cartas[1])) p += 5;
    if (Math.abs(v1 - v2) === 1) p += 3;
    return p;
}

/** Nome da mão pelo score */
function nomeDaMao(pts) {
    if (pts >= 9e7) return 'Straight Flush';
    if (pts >= 8e7) return 'Quadra';
    if (pts >= 7e7) return 'Full House';
    if (pts >= 6e7) return 'Flush';
    if (pts >= 5e7) return 'Sequência';
    if (pts >= 4e7) return 'Trinca';
    if (pts >= 3e7) return 'Dois Pares';
    if (pts >= 2e7) return 'Par';
    if (pts >= 1e7) return 'Carta Alta';
    return 'Pré-Flop';
}

/** Nível de 0–9 (para barra de progresso) */
const NIVEL_MAP = {
    'Pré-Flop':0,'Carta Alta':1,'Par':2,'Dois Pares':3,
    'Trinca':4,'Sequência':5,'Flush':6,'Full House':7,'Quadra':8,'Straight Flush':9,
};

/** Cor temática por categoria */
const COR_MAP = {
    'Straight Flush': '#a855f7',
    'Quadra':         '#dc2626',
    'Full House':     '#ec4899',
    'Flush':          '#ef4444',
    'Sequência':      '#f97316',
    'Trinca':         '#f59e0b',
    'Dois Pares':     '#8b5cf6',
    'Par':            '#3b82f6',
    'Carta Alta':     '#6b7280',
    'Pré-Flop':       '#4b5563',
};

// ================================================================
// BLOCO 2: SIMULAÇÃO MONTE CARLO
//
// Completa as cartas da mesa aleatoriamente e distribui
// 2 cartas para cada oponente, repetindo N vezes.
// Retorna { win, tie, loss } em percentuais inteiros.
// ================================================================

function monteCarlo(mao, mesa, nOponentes = 1, N = 600) {
    const usadas  = new Set([...mao, ...mesa]);
    const baralho = DECK.filter(c => !usadas.has(c));
    let win = 0, tie = 0;
    const faltam = 5 - mesa.length;

    for (let i = 0; i < N; i++) {
        // Fisher-Yates shuffle in-place (cópia por spread para não alterar o original)
        const d = [...baralho];
        for (let j = d.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [d[j], d[k]] = [d[k], d[j]];
        }

        const board   = [...mesa, ...d.slice(0, faltam)];
        const minhaP  = melhorMao([...mao, ...board]);
        let melhorOp  = 0;

        for (let o = 0; o < nOponentes; o++) {
            const op = [d[faltam + o * 2], d[faltam + o * 2 + 1]];
            if (!op[0] || !op[1]) continue;
            melhorOp = Math.max(melhorOp, melhorMao([...op, ...board]));
        }

        if (minhaP > melhorOp)      win++;
        else if (minhaP === melhorOp) tie++;
    }

    return {
        win:  Math.round((win / N) * 100),
        tie:  Math.round((tie / N) * 100),
        loss: Math.round(100 - (win / N) * 100 - (tie / N) * 100),
    };
}


// ================================================================
// BLOCO 3: CONSTANTES DE ESTILO
// ================================================================

const CIRC = 213.6; // 2 * π * r  onde r = 34

const css = `
  @keyframes hs-pop   { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes hs-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .hs-root { font-family: sans-serif; }
  .hs-ring-fill {
    fill: none; stroke-width: 5; stroke-linecap: round;
    transition: stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s;
  }
  .hs-ring-bg { fill: none; stroke-width: 5; }
  .hs-bar     { height: 100%; border-radius: 3px; transition: width 0.6s ease, background 0.4s; }
  .hs-badge   { transition: background 0.4s, color 0.4s, border-color 0.4s; }
  .hs-improved {
    font-size: 11px; font-weight: 600; text-align: center;
    margin-top: 6px; animation: hs-pop 0.35s ease;
  }
  .hs-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%;
            animation: hs-pulse 1.4s ease-in-out infinite; margin-right: 4px; }
`;


// ================================================================
// BLOCO 4: COMPONENTE PRINCIPAL
// ================================================================

export default function HandStrength({
    cartasMao   = [],
    cartasMesa  = [],
    visivel     = true,
    nOponentes  = 1,
}) {

    const [dados,    setDados   ] = useState(null);
    // melhorou é controlado via ref + classe CSS para evitar setState no effect
    const melhorouRef = useRef(false);
    const nivelRef    = useRef(0);
    const timerRef    = useRef(null);
    const containerRef = useRef(null);

    // Dispara animação via DOM direto — sem setState, sem cascata de renders
    const ativarAnimacao = useCallback((cor) => {
        melhorouRef.current = true;
        const root = containerRef.current;
        if (!root) return;
        // Mostra o badge "mão melhorou"
        const badge = root.querySelector('.hs-improved');
        if (badge) { badge.style.display = 'block'; badge.style.color = cor; }
        // Mostra o dot pulsante no label
        const dot = root.querySelector('.hs-dot');
        if (dot) dot.style.display = 'inline-block';

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            melhorouRef.current = false;
            const b = containerRef.current?.querySelector('.hs-improved');
            const d = containerRef.current?.querySelector('.hs-dot');
            if (b) b.style.display = 'none';
            if (d) d.style.display = 'none';
        }, 2200);
    }, []);

    useEffect(() => {
        // Sem cartas suficientes — agenda limpeza fora do ciclo síncrono
        if (!cartasMao || cartasMao.length < 2) {
            nivelRef.current = 0;
            const t = setTimeout(() => setDados(null), 0);
            return () => clearTimeout(t);
        }

        const pts   = melhorMao([...cartasMao, ...cartasMesa]);
        const nome  = nomeDaMao(pts);
        const cor   = COR_MAP[nome] || '#6b7280';
        const nivel = NIVEL_MAP[nome] || 0;
        const mc    = monteCarlo(cartasMao, cartasMesa, nOponentes);
        const subiu = nivel > nivelRef.current
                   && nivelRef.current > 0
                   && cartasMesa.length > 0;

        nivelRef.current = nivel;

        // Agenda setState fora do ciclo síncrono do effect
        const t = setTimeout(() => {
            setDados({ nome, cor, nivel, ...mc });
            if (subiu) ativarAnimacao(cor);
        }, 0);

        return () => { clearTimeout(t); clearTimeout(timerRef.current); };
    }, [cartasMao, cartasMesa, nOponentes, ativarAnimacao]);

    if (!visivel || !dados) return null;

    const { nome, cor, nivel, win, tie, loss } = dados;
    const nivelPct  = Math.round((nivel / 9) * 100);
    const offset    = CIRC - (CIRC * win / 100);

    return (
        <div className="hs-root">
            <style>{css}</style>

            <div ref={containerRef} style={{
                background:   '#111827',
                border:       `1px solid ${cor}44`,
                borderRadius: '12px',
                padding:      '12px 14px',
                width:        '188px',
                transition:   'border-color 0.4s',
            }}>

                {/* Label */}
                <div style={{
                    fontSize:      '10px',
                    color:         'rgba(255,255,255,0.28)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom:  '8px',
                    display:       'flex',
                    alignItems:    'center',
                }}>
                    <span className="hs-dot" style={{ background: cor, display: 'none' }} />
                    Força da mão
                </div>

                {/* Anel SVG */}
                <div style={{ display:'flex', justifyContent:'center', marginBottom:'8px' }}>
                    <svg width="80" height="80" viewBox="0 0 80 80"
                        style={{ transform: 'rotate(-90deg)' }}>
                        <circle className="hs-ring-bg" cx="40" cy="40" r="34"
                            stroke="rgba(255,255,255,0.07)" />
                        <circle className="hs-ring-fill" cx="40" cy="40" r="34"
                            stroke={cor}
                            strokeDasharray={CIRC}
                            strokeDashoffset={offset} />
                    </svg>
                </div>

                {/* % de vitória */}
                <div style={{
                    display:     'flex',
                    alignItems:  'baseline',
                    gap:         '5px',
                    marginBottom:'7px',
                    justifyContent:'center',
                }}>
                    <span style={{
                        fontSize:   '26px',
                        fontWeight: '600',
                        color:      cor,
                        lineHeight: 1,
                        transition: 'color 0.4s',
                    }}>
                        {win}%
                    </span>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.30)' }}>
                        de vitória
                    </span>
                </div>

                {/* Badge da mão */}
                <div className="hs-badge" style={{
                    display:       'flex',
                    justifyContent:'center',
                    alignItems:    'center',
                    borderRadius:  '5px',
                    padding:       '3px 10px',
                    fontSize:      '12px',
                    fontWeight:    '600',
                    background:    cor + '22',
                    color:         cor,
                    border:        `1px solid ${cor}44`,
                    marginBottom:  '8px',
                }}>
                    {nome}
                </div>

                {/* Barra de nível */}
                <div style={{
                    width:        '100%',
                    height:       '5px',
                    background:   'rgba(255,255,255,0.07)',
                    borderRadius: '3px',
                    overflow:     'hidden',
                    marginBottom: '8px',
                }}>
                    <div className="hs-bar"
                        style={{ width: nivelPct + '%', background: cor }} />
                </div>

                {/* Stats */}
                <div style={{
                    display:        'flex',
                    justifyContent: 'space-between',
                }}>
                    {[
                        { label: 'Vitória', val: win  + '%', c: '#4ade80' },
                        { label: 'Empate',  val: tie  + '%', c: 'rgba(255,255,255,0.45)' },
                        { label: 'Derrota', val: loss + '%', c: '#f87171' },
                    ].map(({ label, val, c }) => (
                        <div key={label} style={{
                            display:       'flex',
                            flexDirection: 'column',
                            alignItems:    'center',
                            gap:           '1px',
                        }}>
                            <span style={{ fontSize:'12px', fontWeight:'500', color: c }}>
                                {val}
                            </span>
                            <span style={{
                                fontSize:      '9px',
                                color:         'rgba(255,255,255,0.25)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Mão melhorou — visibilidade controlada via DOM ref, sem re-render */}
                <div className="hs-improved" style={{ display: 'none', color: cor }}>
                    ↑ Mão melhorou!
                </div>

            </div>
        </div>
    );
}
