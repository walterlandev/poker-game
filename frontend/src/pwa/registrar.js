/* ================================================================
   ARQUIVO: frontend/src/pwa/registrar.js

   Registra o service worker (só em produção) e cuida de:
     → ATUALIZAÇÃO: procura versão nova a cada minuto e quando o app
       volta a ficar visível. Quando o SW novo assume, o app recarrega
       sozinho, mas nunca no meio de uma mesa: espera o jogador sair
       (App.jsx marca document.body.dataset.tela).
     → INSTALAÇÃO: guarda o evento 'beforeinstallprompt' (Chrome/Android)
       para o BannerInstalar mostrar o botão "Instalar".
================================================================ */

export function registrarPWA() {
    // O evento pode chegar antes do React montar: guarda para depois.
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.__bitchagerInstalar = e;
        window.dispatchEvent(new Event('bitchager:instalavel'));
    });
    window.addEventListener('appinstalled', () => {
        window.__bitchagerInstalar = null;
        window.dispatchEvent(new Event('bitchager:instalado'));
    });

    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    // Primeira visita: não há SW controlando; o primeiro "controllerchange"
    // não é atualização e não deve recarregar a página.
    const jaTinhaVersao = !!navigator.serviceWorker.controller;
    let recarregando = false;

    function recarregarQuandoPuder() {
        if (recarregando) return;
        if (document.body.dataset.tela === 'jogo') {
            setTimeout(recarregarQuandoPuder, 5000);
            return;
        }
        recarregando = true;
        window.location.reload();
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (jaTinhaVersao) recarregarQuandoPuder();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            const procurar = () => reg.update().catch(() => {});
            setInterval(procurar, 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) procurar();
            });
        }).catch(() => {});
    });
}
