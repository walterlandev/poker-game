/* ================================================================
   ARQUIVO: frontend/src/components/Icone.jsx

   Conjunto próprio de ícones SVG de traço (1,75px), no lugar dos
   emojis. Herdam a cor do texto (currentColor). Decorativos por
   padrão (aria-hidden); quem precisa de nome acessível coloca o
   texto/aria-label no botão.

   Uso: <Icone nome="mesas" />  |  <Icone nome="sair" tamanho={18} />
================================================================ */

const CAMINHOS = {
    mesas:    <><rect x="3" y="6" width="18" height="12" rx="6" /><rect x="7" y="9.5" width="10" height="5" rx="2.5" /></>,
    torneio:  <path d="M3 5h5v4H3M3 15h5v4H3M8 7h3v10H8M11 12h4M15 9h6v6h-6z" />,
    ranking:  <path d="M4 20V13h5v7M9 20V8h6v12M15 20v-5h5v5M3 20h18" />,
    loja:     <><path d="M3.5 12.5 11 5h8v8l-7.5 7.5a1.5 1.5 0 0 1-2.1 0L3.5 14.6a1.5 1.5 0 0 1 0-2.1z" /><circle cx="15.5" cy="8.5" r="1.3" /></>,
    carteira: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M15 13.5h2.5" /></>,
    admin:    <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9.5 12l2 2 3.5-4" /></>,
    sair:     <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l-4 4 4 4M10 12h10" />,
    cadeado:  <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    mais:     <path d="M12 5v14M5 12h14" />,
    desce:    <path d="m7 10 5 5 5-5" />,
    perfil:   <><circle cx="12" cy="9" r="3.5" /><path d="M5 19.5c1.2-3 4-4.5 7-4.5s5.8 1.5 7 4.5" /></>,
    config:   <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    link:     <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    check:    <path d="m5 12.5 4.5 4.5L19 7.5" />,
    play:     <path d="M8 5.5v13l10-6.5z" />,
    fechar:   <path d="M6 6l12 12M18 6 6 18" />,
    enviar:   <path d="M4 12h14M13 6l6 6-6 6" />,
    receber:  <path d="M20 12H6M11 6l-6 6 6 6" />,
    historico:<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
    copiar:   <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    olho:     <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
    usuarios: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2M15.5 6.2a3 3 0 0 1 0 5.6M17 14.9c1.7.5 3 1.8 3.5 4.1" /></>,
    robo:     <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5" /></>,
    menu:     <path d="M4 7h16M4 12h16M4 17h16" />,
    baixo:    <path d="M12 4v14M6 12l6 6 6-6M5 20h14" />,
    cima:     <path d="M12 20V6M6 12l6-6 6 6M5 4h14" />,
    presente: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z" /></>,
    escudo:   <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
    busca:    <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
    alerta:   <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
    info:     <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
    qr:       <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
    relogio:  <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
    cadeia:   <path d="M9 15l6-6M10 7l1.5-1.5a4 4 0 0 1 5.7 5.7L15.7 13M14 17l-1.5 1.5a4 4 0 0 1-5.7-5.7L8.3 11" />,
};

export default function Icone({ nome, tamanho = 20, className = '', titulo }) {
    const conteudo = CAMINHOS[nome];
    if (!conteudo) return null;
    return (
        <svg
            className={`icone ${className}`}
            width={tamanho}
            height={tamanho}
            viewBox="0 0 24 24"
            aria-hidden={titulo ? undefined : 'true'}
            role={titulo ? 'img' : undefined}
            focusable="false"
        >
            {titulo && <title>{titulo}</title>}
            {conteudo}
        </svg>
    );
}
