/* ================================================================
   ARQUIVO: frontend/src/core/temas.js

   FONTE ÚNICA DE VERDADE dos temas de cartas no frontend.
   Importado por:
     → Game/Jogador.jsx     (cartas do jogador)
     → Game/Mesa.jsx        (cartas comunitárias)

   COMO USAR:
     import { getTema, NAIPE_SIMBOLO } from '../core/temas';
     const tema = getTema(usuario.tema); // → objeto com cores/estilos
     const cor  = tema.naipes['♥'].cor;  // → '#DC2626'

   NAIPES — CÓDIGO DO SERVIDOR:
     O servidor envia cartas como "A♥", "K♠", "10♦", "2♣"
     O último caractere é o símbolo Unicode do naipe.
     ♥ = copas
     ♠ = espadas
     ♦ = ouros
     ♣ = paus
================================================================ */

// Símbolo unicode de cada naipe (indexado pelo símbolo Unicode)
export const NAIPE_SIMBOLO = { '♥': '♥', '♠': '♠', '♦': '♦', '♣': '♣' };

// Nome para acessibilidade
export const NAIPE_NOME = {
    '♥': 'Copas', '♠': 'Espadas', '♦': 'Ouros', '♣': 'Paus',
};

// Valor legível (T = Ten = 10)
export const VALOR_DISPLAY = { T: '10' };

// ================================================================
// CATÁLOGO DE TEMAS
// Cada tema define:
//   naipes[naipe].cor  → cor do texto/símbolo
//   frente.fundo       → cor de fundo da carta
//   frente.borda       → cor da borda
//   frente.raio        → border-radius em px
//   verso.fundo        → cor de fundo do verso
//   verso.detalhe      → cor do padrão interno do verso
// ================================================================

const CATALOGO = {

    classico: {
        id:      'classico',
        nome:    'Clássico',
        premium: false,
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#DC2626' },
            '♠': { cor: '#111827' },
            '♣': { cor: '#111827' },
        },
        frente: { fundo: '#FFFFFF', borda: '#D1D5DB', raio: 8 },
        verso:  { fundo: '#1E3A8A', detalhe: '#1E40AF' },
    },

    quatroCores: {
        id:      'quatroCores',
        nome:    '4 Cores',
        premium: false,
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#2563EB' },
            '♣': { cor: '#16A34A' },
            '♠': { cor: '#111827' },
        },
        frente: { fundo: '#FFFFFF', borda: '#9CA3AF', raio: 8 },
        verso:  { fundo: '#111827', detalhe: '#374151' },
    },

    royal: {
        id:      'royal',
        nome:    'Royal',
        premium: true,
        naipes: {
            '♥': { cor: '#C0392B' },
            '♦': { cor: '#C0392B' },
            '♠': { cor: '#2C1810' },
            '♣': { cor: '#2C1810' },
        },
        frente: { fundo: '#FFFBEB', borda: '#8B6914', raio: 8 },
        verso:  { fundo: '#6B0F1A', detalhe: '#8B1A2A' },
    },

    neon: {
        id:      'neon',
        nome:    'Neon',
        premium: true,
        naipes: {
            '♥': { cor: '#F472B6' },
            '♦': { cor: '#34D399' },
            '♣': { cor: '#60A5FA' },
            '♠': { cor: '#A78BFA' },
        },
        frente: { fundo: '#0F172A', borda: '#7C3AED', raio: 10 },
        verso:  { fundo: '#0F0F1A', detalhe: '#7C3AED' },
    },

    dourado: {
        id:      'dourado',
        nome:    'Dourado',
        premium: true,
        naipes: {
            '♥': { cor: '#EF4444' },
            '♦': { cor: '#F59E0B' },
            '♣': { cor: '#92400E' },
            '♠': { cor: '#78350F' },
        },
        frente: { fundo: '#FFFBEB', borda: '#D97706', raio: 8 },
        verso:  { fundo: '#78350F', detalhe: '#B45309' },
    },

    minimalista: {
        id:      'minimalista',
        nome:    'Minimalista',
        premium: true,
        naipes: {
            '♥': { cor: '#6B7280' },
            '♦': { cor: '#6B7280' },
            '♣': { cor: '#374151' },
            '♠': { cor: '#374151' },
        },
        frente: { fundo: '#FFFFFF', borda: '#E5E7EB', raio: 4 },
        verso:  { fundo: '#F9FAFB', detalhe: '#E5E7EB' },
    },
};

// Tema padrão usado como fallback
const TEMA_PADRAO = CATALOGO.classico;

/**
 * Retorna a configuração completa de um tema pelo ID.
 * Se o ID não existir, retorna o tema clássico.
 */
export function getTema(temaId) {
    return CATALOGO[temaId] || TEMA_PADRAO;
}

/**
 * Retorna todos os temas disponíveis (para a loja).
 */
export function listarTemas() {
    return Object.values(CATALOGO);
}

/**
 * Parseia o código de uma carta para um objeto com valor e naipe.
 * Ex: "As" → { valor: 'A', naipe: 's', display: 'A', simbolo: '♠' }
 * Ex: "Td" → { valor: 'T', naipe: 'd', display: '10', simbolo: '♦' }
 * Ex: "XX" → null (carta desconhecida/virada)
 */
export function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe  = codigo.slice(-1);  // Unicode — não aplicar toLowerCase
    const valor  = codigo.slice(0, -1);
    return {
        valor,
        naipe,
        display: VALOR_DISPLAY[valor] || valor,
        simbolo: NAIPE_SIMBOLO[naipe] || naipe,
    };
}
