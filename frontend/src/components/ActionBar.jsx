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

// Estilos (.ab-*) movidos pro CSS global em main.jsx — um <style> preso
// aqui dentro seria desmontado/remontado a cada fold/all-in (este
// componente entra e sai do DOM condicionalmente), o mesmo padrão que já
// causou um bug intermitente de tela preta em outro lugar do app.


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
    // Se o custo for maior que o saldo, o CALL na verdade sai como all-in
    // parcial (o servidor já trata isso) — o botão precisa mostrar o valor
    // que será REALMENTE apostado (o saldo inteiro), não o custo cheio,
    // senão o jogador vê "Call ₿C 500" e acaba apostando só os ₿C 300 que
    // ele tinha.
    const custoReal   = Math.min(custo, saldoAtual);
    const callEhAllIn = !ehCheck && custo >= saldoAtual;

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

    // Sem espaço pra aumentar de verdade (o mínimo já ultrapassa tudo que
    // você tem) — só sobra pagar (all-in incompleto) ou desistir.
    const podeRaise = minRaise < maxRaise;

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
        if (!podeRaise) return;
        handleAcao('RAISE', valorRaise);
    }, [valorRaise, handleAcao, podeRaise]);

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
            <div className={`ab-bar${!ehMinhaVez ? ' ab-disabled' : ''}`}>

                {/* ── Slider de raise ──────────────────────────────── */}
                <div className="ab-raise-row">
                    <span className="ab-raise-label">Raise</span>

                    <div className={`ab-raise-val${ehAllIn ? ' allin' : ''}`}>
                        {ehAllIn ? `ALL-IN ₿C ${maxRaise}` : `₿C ${valorRaise}`}
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
                                <span>₿C {val}</span>
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
                            {ehCheck
                                ? 'Check'
                                : callEhAllIn
                                    ? `All-in ₿C ${custoReal}`
                                    : `Call ₿C ${custoReal}`}
                        </span>
                        <span className="hkey ab-hkeys">C</span>
                    </button>

                    {/* RAISE — desabilitado se não sobra saldo pra aumentar de verdade */}
                    <button
                        className="ab-btn btn-raise"
                        disabled={!podeRaise}
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
                        Fichas <b>₿C {saldoAtual.toLocaleString('pt-BR')}</b>
                    </span>
                    <span className="ab-info-item">
                        {ehCheck
                            ? <><b style={{ color: '#4ade80' }}>Check grátis</b></>
                            : <>Para pagar <b>₿C {custoReal.toLocaleString('pt-BR')}</b>{callEhAllIn ? ' (all-in)' : ''}</>
                        }
                    </span>
                    <span className="ab-info-item">
                        Pote <b>₿C {pote.toLocaleString('pt-BR')}</b>
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