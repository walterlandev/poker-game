/* ================================================================
   ARQUIVO: frontend/src/core/chipCores.js

   Cores de ficha de pôquer por faixa de valor — mesma convenção de
   cassino físico (branca = baixo valor, subindo pra vermelha/azul/
   verde/preta/roxa/dourada/rosa). Separado de ChipPoker.jsx porque
   um arquivo de componente só pode exportar componentes (Fast Refresh).
================================================================ */

// Do menor pro maior valor — o último cujo "min" a aposta atinge é o usado
const NIVEIS = [
    { min: 0,    cor: '#E5E7EB', corMiolo: '#6B7280' }, // branca/prata
    { min: 20,   cor: '#DC2626', corMiolo: '#7F1D1D' }, // vermelha
    { min: 50,   cor: '#2563EB', corMiolo: '#1E3A8A' }, // azul
    { min: 100,  cor: '#16A34A', corMiolo: '#14532D' }, // verde
    { min: 250,  cor: '#27272A', corMiolo: '#52525B' }, // preta
    { min: 500,  cor: '#7C3AED', corMiolo: '#4C1D95' }, // roxa
    { min: 1000, cor: '#F59E0B', corMiolo: '#92400E' }, // dourada
    { min: 5000, cor: '#EC4899', corMiolo: '#831843' }, // rosa (high-roller)
];

/** Retorna { cor, corMiolo } da faixa de valor correspondente à aposta/pote —
 *  spread direto nas props do ChipPoker: <ChipPoker {...corPorValor(valor)} /> */
export function corPorValor(valor) {
    let escolhido = NIVEIS[0];
    for (const nivel of NIVEIS) {
        if (valor >= nivel.min) escolhido = nivel;
    }
    return { cor: escolhido.cor, corMiolo: escolhido.corMiolo };
}
