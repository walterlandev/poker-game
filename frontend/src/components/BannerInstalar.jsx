/* ================================================================
   ARQUIVO: frontend/src/components/BannerInstalar.jsx

   Convida a instalar o app quando o site é aberto no navegador:
     → Chrome/Android/Edge: botão "Instalar" (prompt nativo, guardado
       em src/pwa/registrar.js)
     → iPhone/iPad (Safari não tem prompt): instrução de 1 linha
   Some quando o app já está instalado, e por 7 dias depois de
   "Agora não". Escondido durante a mesa (CSS: body[data-tela="jogo"]).
================================================================ */

import { useEffect, useState } from 'react';

const CHAVE_ADIADO = 'bitchager:instalar-adiado-ate';
const SETE_DIAS    = 7 * 24 * 60 * 60 * 1000;

function jaInstalado() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function adiado() {
    try { return Number(localStorage.getItem(CHAVE_ADIADO) || 0) > Date.now(); } catch { return false; }
}

function ehIOS() {
    const ua = window.navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export default function BannerInstalar() {
    const [prompt,  setPrompt ] = useState(() => window.__bitchagerInstalar || null);
    const [fechado, setFechado] = useState(() => jaInstalado() || adiado());
    const ios = ehIOS();

    useEffect(() => {
        const onInstalavel = () => setPrompt(window.__bitchagerInstalar || null);
        const onInstalado  = () => setFechado(true);
        window.addEventListener('bitchager:instalavel', onInstalavel);
        window.addEventListener('bitchager:instalado',  onInstalado);
        return () => {
            window.removeEventListener('bitchager:instalavel', onInstalavel);
            window.removeEventListener('bitchager:instalado',  onInstalado);
        };
    }, []);

    if (fechado || (!prompt && !ios)) return null;

    function adiar() {
        try { localStorage.setItem(CHAVE_ADIADO, String(Date.now() + SETE_DIAS)); } catch { /* sem armazenamento: só fecha */ }
        setFechado(true);
    }

    async function instalar() {
        if (!prompt) return;
        prompt.prompt();
        const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
        window.__bitchagerInstalar = null;
        setPrompt(null);
        if (outcome === 'accepted') setFechado(true);
    }

    return (
        <aside className="banner-instalar" role="region" aria-label="Instalar o aplicativo">
            <img src="/icones/icone-192.png" alt="" width="44" height="44" className="banner-instalar-icone" />
            <div className="banner-instalar-texto">
                <strong>Instale o Bitchager</strong>
                <span>
                    {prompt
                        ? 'Abra direto da tela inicial, em tela cheia.'
                        : 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'}
                </span>
            </div>
            <div className="banner-instalar-botoes">
                {prompt && <button type="button" className="btn btn-principal" onClick={instalar}>Instalar</button>}
                <button type="button" className="btn btn-fantasma" onClick={adiar}>Agora não</button>
            </div>
        </aside>
    );
}
