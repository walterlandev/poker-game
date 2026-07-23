/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Temporizador.jsx

   Barra circular SVG ao redor do avatar do jogador da vez.
   Conta regressivamente o tempo disponível para agir.

   PROPS:
     totalMs → tempo total em ms (90000=humano, 30000=bot)
     ativo   → boolean: true quando é a vez deste jogador
     tamanho → tamanho do SVG em pixels (padrão 50)
================================================================ */

import { useState, useEffect, useRef } from 'react';

export default function Temporizador({ totalMs = 90000, ativo = false, tamanho = 50 }) {

    const [restante, setRestante] = useState(totalMs);
    const intervaloRef            = useRef(null);
    const inicioRef               = useRef(null);

    useEffect(() => {
        // Limpa timer anterior
        if (intervaloRef.current) clearInterval(intervaloRef.current);

        if (!ativo) {
            const reset = setTimeout(() => setRestante(totalMs), 0);
            return () => clearTimeout(reset);
        }

        // Inicia contagem
        inicioRef.current = Date.now();

        const tick = () => {
            const decorrido = Date.now() - inicioRef.current;
            const novoRestante = Math.max(0, totalMs - decorrido);
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
    }, [ativo, totalMs]);

    if (!ativo) return null;

    const raio      = (tamanho - 4) / 2;
    const circunf   = 2 * Math.PI * raio;
    const progresso = restante / totalMs;
    const offset    = circunf * (1 - progresso);
    const segundos  = Math.ceil(restante / 1000);

    let cor = '#22C55E';
    if (progresso < 0.5) cor = '#F59E0B';
    if (progresso < 0.2) cor = '#EF4444';

    return (
        <div style={{
            position:       'absolute',
            top:            '50%',
            left:           '50%',
            transform:      'translate(-50%, -50%)',
            width:          `${tamanho}px`,
            height:         `${tamanho}px`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            pointerEvents:  'none',
            zIndex:         10,
        }}>
            <svg width={tamanho} height={tamanho}
                style={{ position:'absolute', top:0, left:0 }}>
                <circle cx={tamanho/2} cy={tamanho/2} r={raio}
                    fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
                <circle cx={tamanho/2} cy={tamanho/2} r={raio}
                    fill="none" stroke={cor} strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circunf}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${tamanho/2} ${tamanho/2})`}
                    style={{
                        transition: 'stroke-dashoffset 0.1s linear, stroke 0.5s ease',
                        filter:     `drop-shadow(0 0 4px ${cor}80)`,
                    }}
                />
            </svg>
            <span style={{
                fontSize:   segundos >= 10 ? '10px' : '12px',
                fontWeight: '800',
                color:      cor,
                lineHeight: 1,
                zIndex:     1,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                animation:  segundos <= 10 ? 'pulsar 0.8s ease-in-out infinite' : 'none',
            }}>
                {segundos}
            </span>
        </div>
    );
}