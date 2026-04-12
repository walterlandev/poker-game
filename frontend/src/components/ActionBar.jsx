/* ================================================================
   ARQUIVO: frontend/src/components/ActionBar.jsx

   REDESIGN DESKTOP-FIRST:
   → Layout horizontal em uma única linha (slider + botões juntos)
   → Botão All-in dedicado (4º botão na grade)
   → Atalhos de teclado: F=Fold, C=Check/Call, R=Raise, A=All-in
     ← → para ajustar o slider com o teclado
   → Barra de info embaixo: saldo, custo, pote, indicador de vez
   → Mobile mantido com grid de 4 colunas e slider acima
   → Position relative (não fixed) — encaixe no layout do pai
================================================================ */

import { useState, useEffect, useCallback, useMemo } from 'react';


// ================================================================
// ESTILOS ESTÁTICOS
// ================================================================

const css = `
  .ab-root { font-family: sans-serif; }

  .ab-bar {
    background: #0d1424;
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 10px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Linha do slider: label + display + track + atalhos */
  .ab-raise-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ab-raise-label {
    font-size: 10px;
    color: rgba(255,255,255,0.30);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    flex-shrink: 0;
    width: 32px;
  }
  .ab-raise-val {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    flex-shrink: 0;
    min-width: 96px;
    text-align: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 4px 8px;
    transition: color 0.15s, border-color 0.15s;
  }
  .ab-raise-val.allin { color: #f87171; border-color: rgba(248,113,113,0.30); }
  .ab-slider { flex: 1; accent-color: #a855f7; cursor: pointer; height: 4px; }
  .ab-slider:disabled { opacity: 0.3; cursor: default; }

  /* Atalhos rápidos de aposta */
  .ab-shortcuts { display: flex; gap: 5px; flex-shrink: 0; }
  .ab-sc {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 5px;
    color: rgba(255,255,255,0.42);
    font-size: 11px;
    padding: 3px 7px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    font-family: inherit;
    line-height: 1.6;
    text-align: center;
  }
  .ab-sc:hover { background: rgba(255,255,255,0.09); color: #f8fafc; }
  .ab-sc span  { display: block; font-size: 9px; opacity: 0.5; }

  /* Linha de botões */
  .ab-btns {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr 86px;
    gap: 7px;
  }
  .ab-btn {
    border-radius: 9px;
    border: 1px solid;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 9px 6px;
    transition: transform 0.08s, opacity 0.08s, background 0.12s;
    font-family: inherit;
    min-height: 50px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .ab-btn:active   { transform: scale(0.96); opacity: 0.80; }
  .ab-btn:disabled { opacity: 0.25; cursor: default; pointer-events: none; }
  .ab-btn .lbl  { font-size: 14px; font-weight: 600; white-space: nowrap; }
  .ab-btn .hkey {
    font-size: 10px; opacity: 0.40;
    background: rgba(255,255,255,0.07);
    border-radius: 3px; padding: 0px 5px;
    letter-spacing: 0.04em;
  }

  .btn-fold   { color:#f87171; background:rgba(248,113,113,0.08); border-color:rgba(248,113,113,0.22); }
  .btn-fold:hover   { background:rgba(248,113,113,0.16); }
  .btn-check  { color:#4ade80; background:rgba(74,222,128,0.09); border-color:rgba(74,222,128,0.26); }
  .btn-check:hover  { background:rgba(74,222,128,0.17); }
  .btn-call   { color:#60a5fa; background:rgba(96,165,250,0.09); border-color:rgba(96,165,250,0.26); }
  .btn-call:hover   { background:rgba(96,165,250,0.17); }
  .btn-raise  { color:#c084fc; background:rgba(192,132,252,0.09); border-color:rgba(192,132,252,0.24); }
  .btn-raise:hover  { background:rgba(192,132,252,0.17); }
  .btn-allin  { color:#f87171; background:rgba(248,113,113,0.09); border-color:rgba(248,113,113,0.24); }
  .btn-allin:hover  { background:rgba(248,113,113,0.17); }

  /* Linha de info */
  .ab-info {
    display: flex;
    gap: 0;
    font-size: 11px;
    color: rgba(255,255,255,0.30);
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ab-info-item { display: flex; gap: 4px; align-items: center; }
  .ab-info-item b { color: rgba(255,255,255,0.58); font-weight: 500; }

  .ab-turn-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; color: #f59e0b;
    background: rgba(245,158,11,0.10);
    border: 1px solid rgba(245,158,11,0.22);
    border-radius: 20px; padding: 2px 9px; font-weight: 600;
  }
  .ab-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #f59e0b; flex-shrink: 0;
    animation: ab-pulse 1.4s ease-in-out infinite;
  }
  @keyframes ab-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .ab-disabled { opacity: 0.28; pointer-events: none; }

  /* Mobile: botões maiores */
  @media (max-width: 520px) {
    .ab-btns { grid-template-columns: 1fr 1.4fr 1fr 72px; gap: 6px; }
    .ab-btn  { min-height: 54px; }
    .ab-shortcuts { display: none; }
    .ab-hkeys { display: none; }
  }
`;


// ================================================================
// COMPONENTE PRINCIPAL
// ================================================================

export default function ActionBar({
    ehMinhaVez    = false,
    saldoAtual    = 0,
    apostaRodada  = 0,
    maiorAposta   = 0,
    bigBlind      = 20,
    pote          = 0,
    onAcao,
}) {

    // Custo para igualar a maior aposta
    const custo     = Math.max(0, maiorAposta - apostaRodada);
    const ehCheck   = custo <= 0;

    // Limites do raise
    const maxRaise  = saldoAtual + apostaRodada;
    const minRaise  = Math.min(
        Math.max(maiorAposta + (maiorAposta || bigBlind), bigBlind * 2),
        maxRaise
    );
    const stepRaise = Math.max(1, bigBlind);

    const valorInicial = useMemo(
        () => Math.max(minRaise, Math.min(maxRaise, minRaise)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [minRaise, ehMinhaVez]
    );

    const [valorRaise,  setValorRaise ] = useState(valorInicial);
    const [pressionado, setPressionado] = useState(null);

    useEffect(() => { setValorRaise(valorInicial); }, [valorInicial]);

    const ehAllIn = valorRaise >= maxRaise;

    // ---- Atalhos rápidos de raise ----
    const atalhos = useMemo(() => {
        const poteBruto = pote || maiorAposta * 2 || bigBlind * 4;
        return [
            { label: 'Min', val: minRaise },
            { label: '½',   val: Math.round(poteBruto * 0.5  / stepRaise) * stepRaise },
            { label: '⅔',   val: Math.round(poteBruto * 0.67 / stepRaise) * stepRaise },
            { label: 'Pote',val: Math.round(poteBruto         / stepRaise) * stepRaise },
        ].map(a => ({
            ...a,
            val: Math.max(minRaise, Math.min(maxRaise, a.val)),
        }));
    }, [minRaise, maxRaise, stepRaise, pote, maiorAposta, bigBlind]);


    // ---- Handler principal ----
    const handleAcao = useCallback((acao, valor = 0) => {
        if (!ehMinhaVez || !onAcao) return;
        setPressionado(acao);
        setTimeout(() => setPressionado(null), 160);
        if (navigator.vibrate) navigator.vibrate(25);
        onAcao(acao, valor);
    }, [ehMinhaVez, onAcao]);

    const handleCheckCall = useCallback(() => {
        handleAcao(ehCheck ? 'CHECK' : 'CALL', custo);
    }, [ehCheck, custo, handleAcao]);

    const handleRaise = useCallback(() => {
        handleAcao('RAISE', valorRaise);
    }, [valorRaise, handleAcao]);

    const handleAllIn = useCallback(() => {
        setValorRaise(maxRaise);
        handleAcao('RAISE', maxRaise);
    }, [maxRaise, handleAcao]);


    // ---- Atalhos de teclado ----
    useEffect(() => {
        const onKey = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (!ehMinhaVez) return;

            const key = e.key.toLowerCase();

            if (key === 'f') { e.preventDefault(); handleAcao('FOLD', 0); }
            if (key === 'c') { e.preventDefault(); handleCheckCall(); }
            if (key === 'r') { e.preventDefault(); handleRaise(); }
            if (key === 'a') { e.preventDefault(); handleAllIn(); }

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setValorRaise(v => Math.min(maxRaise, v + stepRaise));
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setValorRaise(v => Math.max(minRaise, v - stepRaise));
            }
        };

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [ehMinhaVez, handleAcao, handleCheckCall, handleRaise, handleAllIn, minRaise, maxRaise, stepRaise]);


    // ================================================================
    // RENDER
    // ================================================================
    return (
        <div className="ab-root">
            <style>{css}</style>

            <div className={`ab-bar${!ehMinhaVez ? ' ab-disabled' : ''}`}>

                {/* ── Slider de raise ──────────────────────────────── */}
                <div className="ab-raise-row">
                    <span className="ab-raise-label">Raise</span>

                    <div className={`ab-raise-val${ehAllIn ? ' allin' : ''}`}>
                        {ehAllIn ? `ALL-IN $${maxRaise}` : `$${valorRaise}`}
                    </div>

                    <input
                        type="range"
                        className="ab-slider"
                        min={minRaise}
                        max={maxRaise}
                        step={stepRaise}
                        value={valorRaise}
                        disabled={!ehMinhaVez}
                        onChange={e => setValorRaise(parseInt(e.target.value))}
                    />

                    {/* Atalhos rápidos (só desktop) */}
                    <div className="ab-shortcuts">
                        {atalhos.map(({ label, val }) => (
                            <button
                                key={label}
                                className="ab-sc"
                                onPointerDown={() => setValorRaise(val)}
                            >
                                {label}
                                <span>${val}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Botões de ação ────────────────────────────────── */}
                <div className="ab-btns">

                    {/* FOLD */}
                    <button
                        className={`ab-btn btn-fold`}
                        style={{ transform: pressionado === 'FOLD' ? 'scale(0.96)' : undefined }}
                        onPointerDown={() => handleAcao('FOLD', 0)}
                    >
                        <span className="lbl">Fold</span>
                        <span className="hkey ab-hkeys">F</span>
                    </button>

                    {/* CHECK ou CALL */}
                    <button
                        className={`ab-btn ${ehCheck ? 'btn-check' : 'btn-call'}`}
                        style={{ transform: (pressionado === 'CHECK' || pressionado === 'CALL') ? 'scale(0.96)' : undefined }}
                        onPointerDown={handleCheckCall}
                    >
                        <span className="lbl">
                            {ehCheck ? 'Check' : `Call $${custo}`}
                        </span>
                        <span className="hkey ab-hkeys">C</span>
                    </button>

                    {/* RAISE */}
                    <button
                        className="ab-btn btn-raise"
                        style={{ transform: pressionado === 'RAISE' ? 'scale(0.96)' : undefined }}
                        onPointerDown={handleRaise}
                    >
                        <span className="lbl">Raise</span>
                        <span className="hkey ab-hkeys">R</span>
                    </button>

                    {/* ALL-IN */}
                    <button
                        className="ab-btn btn-allin"
                        style={{ transform: pressionado === 'ALLIN' ? 'scale(0.96)' : undefined }}
                        onPointerDown={handleAllIn}
                    >
                        <span className="lbl">All-in</span>
                        <span className="hkey ab-hkeys">A</span>
                    </button>

                </div>

                {/* ── Linha de info ─────────────────────────────────── */}
                <div className="ab-info">
                    <span className="ab-info-item">
                        Fichas <b>${saldoAtual.toLocaleString('pt-BR')}</b>
                    </span>
                    <span className="ab-info-item">
                        {ehCheck
                            ? <><b style={{ color: '#4ade80' }}>Check grátis</b></>
                            : <>Para pagar <b>${custo.toLocaleString('pt-BR')}</b></>
                        }
                    </span>
                    <span className="ab-info-item">
                        Pote <b>${pote.toLocaleString('pt-BR')}</b>
                    </span>

                    {ehMinhaVez && (
                        <span className="ab-turn-badge">
                            <span className="ab-dot" />
                            Sua vez
                        </span>
                    )}
                </div>

            </div>
        </div>
    );
}