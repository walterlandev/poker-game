/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Temporizador.jsx

   Barra circular SVG ao redor do avatar do jogador da vez.
   Conta regressivamente o tempo disponível para agir.

   PROPS:
     totalMs  → tempo total em ms (90000=humano, 30000=bot) — só usado como
                fallback caso expiraEm não esteja disponível
     expiraEm → timestamp absoluto (Date.now() + ms) vindo do servidor
                (mesa.turnoExpiraEm) — fonte de verdade da contagem. Contar
                a partir de um prazo absoluto (em vez de "totalMs a partir
                do momento em que este componente montou") evita que um
                refresh de página ou uma reconexão no meio do turno reinicie
                o anel do zero, dessincronizado do timeout real do servidor.
     ativo    → boolean: true quando é a vez deste jogador
     tamanho  → tamanho do SVG em pixels (padrão 50)
================================================================ */

import { useState, useEffect, useRef } from 'react';

export default function Temporizador({ totalMs = 90000, expiraEm = null, ativo = false, tamanho = 50 }) {

    const [restante, setRestante] = useState(totalMs);
    const intervaloRef            = useRef(null);

    useEffect(() => {
        // Limpa timer anterior
        if (intervaloRef.current) clearInterval(intervaloRef.current);

        if (!ativo || !expiraEm) {
            const reset = setTimeout(() => setRestante(totalMs), 0);
            return () => clearTimeout(reset);
        }

        const tick = () => {
            const novoRestante = Math.max(0, expiraEm - Date.now());
            setRestante(novoRestante);

            if (novoRestante <= 0) {
                clearInterval(intervaloRef.current);
            }
        };

        const inicial = setTimeout(tick, 0);
        intervaloRef.current = setInterval(tick, 100);

        return () => {
            clearTimeout(inicial);
            if (intervaloRef.current) clearInterval(intervaloRef.current);
        };
    }, [ativo, expiraEm, totalMs]);

    if (!ativo) return null;

    // Anel desenhado por fora do avatar (o contêiner tem inset -4px)
    const lado      = tamanho + 8;
    const raio      = (lado - 3) / 2;
    const circunf   = 2 * Math.PI * raio;
    const progresso = Math.max(0, Math.min(1, restante / totalMs));
    const offset    = circunf * (1 - progresso);
    const segundos  = Math.ceil(restante / 1000);
    const urgente   = progresso < 0.2;
    const cor       = urgente ? 'var(--cor-perigo)' : 'var(--cor-destaque)';

    return (
        <div className="temporizador" aria-hidden="true">
            <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`}>
                <circle cx={lado/2} cy={lado/2} r={raio}
                    fill="none" style={{ stroke: 'var(--cor-linha-forte)' }} strokeWidth="3" />
                <circle cx={lado/2} cy={lado/2} r={raio}
                    fill="none" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circunf}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${lado/2} ${lado/2})`}
                    style={{ stroke: cor, transition: 'stroke-dashoffset 0.1s linear' }}
                />
            </svg>
            <span className={`temporizador-seg${urgente ? ' urgente' : ''}`}>
                {segundos}
            </span>
        </div>
    );
}
