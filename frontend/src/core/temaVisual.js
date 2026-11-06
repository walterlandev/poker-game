/* ================================================================
   ARQUIVO: frontend/src/core/temaVisual.js

   Tema visual do app (claro / escuro / igual ao aparelho).
   Não confundir com core/temas.js (temas de BARALHO comprados na loja).

   A preferência fica no localStorage ('bitchager:tema'). O index.html
   tem um script inline mínimo que aplica o tema antes do React montar
   (sem piscar o tema errado); este módulo cuida das trocas depois disso
   e de acompanhar o aparelho quando a preferência é "sistema".
================================================================ */

export const CHAVE_TEMA = 'bitchager:tema';
export const PREFERENCIAS_TEMA = ['sistema', 'claro', 'escuro'];

const COR_BARRA = { claro: '#DCD5C8', escuro: '#1C1714' };

const consultaClaro = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

export function lerPreferenciaTema() {
    try {
        const v = localStorage.getItem(CHAVE_TEMA);
        return PREFERENCIAS_TEMA.includes(v) ? v : 'sistema';
    } catch {
        return 'sistema';
    }
}

function resolver(preferencia) {
    if (preferencia === 'claro' || preferencia === 'escuro') return preferencia;
    return consultaClaro?.matches ? 'claro' : 'escuro';
}

function aplicar(preferencia) {
    const tema = resolver(preferencia);
    document.documentElement.setAttribute('data-tema', tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR_BARRA[tema]);
    return tema;
}

export function salvarPreferenciaTema(preferencia) {
    const p = PREFERENCIAS_TEMA.includes(preferencia) ? preferencia : 'sistema';
    try { localStorage.setItem(CHAVE_TEMA, p); } catch { /* modo privado: só não persiste */ }
    return aplicar(p);
}

/** Chamado uma vez em main.jsx: reaplica e acompanha o aparelho no modo "sistema". */
export function iniciarTemaVisual() {
    aplicar(lerPreferenciaTema());
    if (consultaClaro?.addEventListener) {
        consultaClaro.addEventListener('change', () => {
            if (lerPreferenciaTema() === 'sistema') aplicar('sistema');
        });
    }
}
