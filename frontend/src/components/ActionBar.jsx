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

// Estilos (.ab-*) ficam no CSS global (styles/tema.css) — um <style> preso
// aqui dentro seria desmontado/remontado a cada fold/all-in (este
// componente entra e sai do DOM condicionalmente), o mesmo padrão que já
// causou um bug intermitente de tela preta em outro lugar do app.

// ── Chaves de comportamento (seção 8 do DESIGN.md) ─────────────────
// ACAO_NO_CLIQUE:    true → Fold/Call/Raise/All-in disparam no clique
//                    (soltar o dedo); false → no pointerdown (toque).
// ALLIN_NOS_ATALHOS: true → "All-in" aparece também na linha de atalhos
//                    de aposta (leva o slider ao máximo); o botão All-in
//                    de ação direta continua existindo.
const ACAO_NO_CLIQUE    = false;
const ALLIN_NOS_ATALHOS = false;
const EVENTO_ACAO       = ACAO_NO_CLIQUE ? 'onClick' : 'onPointerDown';

const ROTULO_ATALHO = { Min: 'Mín', '½': '½ pote', '⅔': '⅔ pote', Pote: 'Pote' };

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

// Contagem do turno a partir do prazo absoluto do servidor (só exibição)
function ContagemTurno({ expiraEm }) {
    const [agora, setAgora] = useState(() => Date.now());
    useEffect(() => {
        if (!expiraEm) return undefined;
        const id = setInterval(() => setAgora(Date.now()), 250);
        return () => clearInterval(id);
    }, [expiraEm]);
    if (!expiraEm) return null;
    const seg = Math.max(0, Math.ceil((expiraEm - agora) / 1000));
    return <span className="num">{seg} s</span>;
}


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
    expiraEm      = null,   // prazo do turno atual (mesa.turnoExpiraEm) — só exibição
    nomeDaVez     = '',     // primeiro nome de quem está na vez — só exibição
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
    const evento = (fn) => ({ [EVENTO_ACAO]: fn });

    return (
        <div className="ab">
            <div className={`ab-faixa${ehMinhaVez ? '' : ' espera'}`} aria-live="polite">
                {ehMinhaVez
                    ? <span>Sua vez</span>
                    : <span>{nomeDaVez ? <>Vez de <b>{nomeDaVez}</b></> : 'Aguarde sua vez'}</span>}
                <ContagemTurno expiraEm={expiraEm} />
            </div>

            <div className={`ab-corpo${ehMinhaVez ? '' : ' inativo'}`}>

                {/* ── Atalhos de aposta (só ajustam o valor do raise) ── */}
                <div className={`ab-atalhos ab-controle${ALLIN_NOS_ATALHOS ? ' com-allin' : ''}`}>
                    {atalhos.map(({ label, val }, i) => (
                        <button
                            key={label}
                            type="button"
                            className={`ab-atalho${valorRaise === val && !ehAllIn && atalhos.findIndex(a => a.val === val) === i ? ' ativo' : ''}`}
                            disabled={!ehMinhaVez || !podeRaise}
                            onPointerDown={() => setValorRaise(val)}
                        >
                            {ROTULO_ATALHO[label] || label}
                            <span className="num">{fmt(val)}</span>
                        </button>
                    ))}
                    {ALLIN_NOS_ATALHOS && (
                        <button
                            type="button"
                            className={`ab-atalho allin${ehAllIn ? ' ativo' : ''}`}
                            disabled={!ehMinhaVez || !podeRaise}
                            onPointerDown={() => setValorRaise(maxRaise)}
                        >
                            All-in
                            <span className="num">{fmt(maxRaise)}</span>
                        </button>
                    )}
                </div>

                {/* ── Slider de raise ──────────────────────────────── */}
                <div className="ab-slider-linha ab-controle">
                    <span className="dica" aria-hidden="true">← →</span>
                    <input
                        type="range"
                        className="ab-slider"
                        aria-label="Valor do raise"
                        min={minRaise}
                        max={maxRaise}
                        step={stepRaise}
                        value={valorRaise}
                        disabled={!ehMinhaVez || !podeRaise}
                        onChange={e => setValorRaise(parseInt(e.target.value))}
                    />
                    <span className={`valor num${ehAllIn ? ' allin' : ''}`}>
                        {ehAllIn ? `All-in ₿C ${fmt(maxRaise)}` : `₿C ${fmt(valorRaise)}`}
                    </span>
                </div>

                {/* ── Botões de ação ────────────────────────────────── */}
                <div className="ab-botoes ab-controle">
                    <button
                        type="button"
                        className={`ab-btn fold${pressionado === 'FOLD' ? ' pressionado' : ''}`}
                        disabled={!ehMinhaVez}
                        {...evento(() => handleAcao('FOLD', 0))}
                    >
                        Fold
                        <span className="tecla" aria-hidden="true">F</span>
                    </button>

                    <button
                        type="button"
                        className={`ab-btn ${ehCheck ? 'check' : 'call'}${(pressionado === 'CHECK' || pressionado === 'CALL') ? ' pressionado' : ''}`}
                        disabled={!ehMinhaVez}
                        {...evento(handleCheckCall)}
                    >
                        {ehCheck
                            ? 'Check'
                            : <span>{callEhAllIn ? 'All-in' : 'Call'} <small>₿C {fmt(custoReal)}</small></span>}
                        <span className="tecla" aria-hidden="true">C</span>
                    </button>

                    {/* RAISE — desabilitado se não sobra saldo pra aumentar de verdade */}
                    <button
                        type="button"
                        className={`ab-btn raise${pressionado === 'RAISE' ? ' pressionado' : ''}`}
                        disabled={!ehMinhaVez || !podeRaise}
                        {...evento(handleRaise)}
                    >
                        <span>{ehAllIn ? 'All-in' : 'Raise'} <small>₿C {fmt(valorRaise)}</small></span>
                        <span className="tecla" aria-hidden="true">R</span>
                    </button>

                    {/* ALL-IN — ação direta */}
                    <button
                        type="button"
                        className={`ab-btn allin${pressionado === 'ALLIN' ? ' pressionado' : ''}`}
                        disabled={!ehMinhaVez}
                        {...evento(handleAllIn)}
                    >
                        All-in
                        <span className="tecla" aria-hidden="true">A</span>
                    </button>
                </div>

                {/* ── Linha de info (desktop) ───────────────────────── */}
                <div className="ab-info">
                    <span>Fichas <b>₿C {fmt(saldoAtual)}</b></span>
                    <span>
                        {ehCheck
                            ? <b className="positivo">Check grátis</b>
                            : <>Para pagar <b>₿C {fmt(custoReal)}</b>{callEhAllIn ? ' (all-in)' : ''}</>}
                    </span>
                    <span>Pote <b>₿C {fmt(pote)}</b></span>
                </div>
            </div>
        </div>
    );
}
