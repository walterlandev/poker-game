/* ================================================================
   ARQUIVO: frontend/src/components/ChipPoker.jsx

   Ficha de pôquer (SVG) — usada em qualquer lugar que hoje só mostra
   texto pra aposta/pote (Jogador.jsx, Mesa.jsx). Visual de ficha de
   cassino de verdade: borda serrilhada, anel tracejado, miolo escuro.

   Cores por valor de aposta → ver core/chipCores.js (corPorValor).
================================================================ */

import { corPorValor } from '../core/chipCores';

export default function ChipPoker({ size = 22, cor = '#F59E0B', corMiolo = '#7C4A03' }) {
    const marcas = Array.from({ length: 8 });
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}>
            <circle cx="20" cy="20" r="18.5" fill={cor} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
            {marcas.map((_, i) => (
                <rect
                    key={i}
                    x="18.5" y="1.5" width="3" height="6.5" rx="1.2"
                    fill="#fff" fillOpacity="0.92"
                    transform={`rotate(${(i / marcas.length) * 360} 20 20)`}
                />
            ))}
            <circle cx="20" cy="20" r="13.5" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.1" strokeDasharray="2.4 2.4" />
            <circle cx="20" cy="20" r="10" fill={corMiolo} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
        </svg>
    );
}

/* Pilha de fichas (2 sobrepostas) — pra apostas/pote, mais "cassino" que uma ficha só.
   `valor` define a cor pela convenção de cassino (corPorValor); sem valor, cai no dourado. */
export function PilhaFichas({ size = 20, valor }) {
    const cores = valor != null ? corPorValor(valor) : { cor: '#F59E0B', corMiolo: '#92400E' };
    return (
        <div style={{ position: 'relative', width: size + Math.round(size * 0.35), height: size, flexShrink: 0 }}>
            <div style={{ position: 'absolute', left: 0, top: Math.round(size * 0.18) }}>
                <ChipPoker size={size} {...cores} />
            </div>
            <div style={{ position: 'absolute', left: Math.round(size * 0.22), top: Math.round(size * 0.06) }}>
                <ChipPoker size={size} {...cores} />
            </div>
        </div>
    );
}
