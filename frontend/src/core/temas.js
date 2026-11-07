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





    // ---- Coleções desenhadas em SVG (core/colecoes.js) ----
    rivieraNoir: {
        id:        'rivieraNoir',
        nome:      'Riviera Noir',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#8e1c26' },
            '♦': { cor: '#8e1c26' },
            '♣': { cor: '#151313' },
            '♠': { cor: '#151313' },
        },
        frente: { fundo: '#f6efdf', borda: '#b8913f', raio: 8 },
        verso:  { fundo: '#0e0d0c', detalhe: '#c9a24f' },
    },

    satoshi: {
        id:        'satoshi',
        nome:      'Satoshi',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#f7931a' },
            '♦': { cor: '#f7931a' },
            '♣': { cor: '#eae6df' },
            '♠': { cor: '#eae6df' },
        },
        frente: { fundo: '#202326', borda: '#f7931a', raio: 8 },
        verso:  { fundo: '#1a1c1f', detalhe: '#f7931a' },
    },

    lasVegas: {
        id:        'lasVegas',
        nome:      'Las Vegas 1970',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#c8102e' },
            '♦': { cor: '#c8102e' },
            '♣': { cor: '#1d1a17' },
            '♠': { cor: '#1d1a17' },
        },
        frente: { fundo: '#fbf3e2', borda: '#c8102e', raio: 8 },
        verso:  { fundo: '#c8102e', detalhe: '#a50d26' },
    },

    cyberNeon: {
        id:        'cyberNeon',
        nome:      'Cyber Neon',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#ff3fb4' },
            '♦': { cor: '#ff3fb4' },
            '♣': { cor: '#21e6f2' },
            '♠': { cor: '#21e6f2' },
        },
        frente: { fundo: '#120a26', borda: '#21e6f2', raio: 8 },
        verso:  { fundo: '#0b0518', detalhe: '#ff3fb4' },
    },

    ouroImperial: {
        id:        'ouroImperial',
        nome:      'Ouro Imperial',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#7a1424' },
            '♦': { cor: '#7a1424' },
            '♣': { cor: '#1f1712' },
            '♠': { cor: '#1f1712' },
        },
        frente: { fundo: '#f4e7c8', borda: '#a8822f', raio: 8 },
        verso:  { fundo: '#5e0f1c', detalhe: '#d4a640' },
    },

    tropicalBrasil: {
        id:        'tropicalBrasil',
        nome:      'Tropical Brasil',
        premium:   true,
        colecao:   true,
        naipes: {
            '♥': { cor: '#00873a' },
            '♦': { cor: '#00873a' },
            '♣': { cor: '#0b3d91' },
            '♠': { cor: '#0b3d91' },
        },
        frente: { fundo: '#ffffff', borda: '#009c3b', raio: 8 },
        verso:  { fundo: '#009c3b', detalhe: '#ffdf00' },
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
