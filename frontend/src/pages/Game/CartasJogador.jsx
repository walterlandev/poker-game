/* ================================================================
   ARQUIVO: frontend/src/pages/Game/CartasJogador.jsx
   MUDANÇA: + prop temaId — aplica cores do tema sem alterar tamanhos
================================================================ */

import { getTema } from '../../core/temas';

const SIMBOLO_NAIPE = { h: '♥', d: '♦', s: '♠', c: '♣' };
const NOME_NAIPE    = { h: 'Copas', d: 'Ouros', s: 'Espadas', c: 'Paus' };
const NOME_VALOR    = {
    A:'Ás', K:'Rei', Q:'Dama', J:'Valete', T:'10',
    '9':'9','8':'8','7':'7','6':'6','5':'5','4':'4','3':'3','2':'2',
};

function parsearCarta(codigo, tema) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);
    return {
        codigo,
        valor:   valor === 'T' ? '10' : valor,
        naipe,
        simbolo: SIMBOLO_NAIPE[naipe] || naipe,
        cor:     tema?.naipes?.[naipe]?.cor || (naipe==='h'||naipe==='d' ? '#DC2626' : '#111827'),
        nome:    `${NOME_VALOR[valor] || valor} de ${NOME_NAIPE[naipe] || naipe}`,
    };
}

export default function CartasJogador({
    cartas  = [],
    foldado = false,
    fase    = '',
    temaId  = 'classico',
}) {
    const tema = getTema(temaId);

    if (!cartas || cartas.length === 0) {
        if (fase === 'AGUARDANDO' || !fase) return null;
        return (
            <div style={estilos.container}>
                <SlotVazio tema={tema} />
                <SlotVazio tema={tema} />
            </div>
        );
    }

    const carta1 = parsearCarta(cartas[0], tema);
    const carta2 = parsearCarta(cartas[1], tema);

    return (
        <div style={estilos.container}>
            {foldado && <div style={estilos.badgeFold}>FOLD</div>}

            <div style={{
                ...estilos.cartasWrapper,
                transform:  foldado ? 'rotate(-5deg)' : 'none',
                opacity:    foldado ? 0.4 : 1,
                filter:     foldado ? 'grayscale(60%)' : 'none',
                transition: 'all 0.3s ease',
            }}>
                {carta1 && <CartaVisual carta={carta1} tema={tema} rotacao={foldado ? -8 : -4} zIndex={1} />}
                {carta2 && <CartaVisual carta={carta2} tema={tema} rotacao={foldado ?  8 :  4} zIndex={2} />}
            </div>

            {!foldado && <p style={estilos.label}>Suas cartas</p>}
        </div>
    );
}

function CartaVisual({ carta, tema, rotacao = 0, zIndex = 1 }) {
    const ehNeon = tema?.id === 'neon';
    const sombra = ehNeon
        ? `drop-shadow(0 0 6px ${carta.cor})`
        : `drop-shadow(0 1px 2px ${carta.cor}40)`;

    return (
        <div
            style={{
                /* ── Tamanhos originais ── */
                width:          '64px',
                height:         '90px',
                /* ── Cores do tema ── */
                background:     tema?.frente?.fundo || '#FFFFFF',
                borderRadius:   (tema?.frente?.raio || 8) + 'px',
                border:         `1px solid ${tema?.frente?.borda || '#D1D5DB'}`,
                /* ── Layout ── */
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                position:       'relative',
                flexShrink:     0,
                boxShadow:      '0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
                transform:      `rotate(${rotacao}deg)`,
                transition:     'transform 0.2s ease',
                overflow:       'hidden',
                zIndex,
            }}
            aria-label={carta.nome}
            role="img"
        >
            {/* Canto superior esquerdo */}
            <div style={estilos.cantoSuperior}>
                <span style={{ ...estilos.cantoValor, color: carta.cor, filter: sombra }}>
                    {carta.valor}
                </span>
                <span style={{ ...estilos.cantoNaipe, color: carta.cor, filter: sombra }}>
                    {carta.simbolo}
                </span>
            </div>

            {/* Naipe central grande */}
            <span style={{ ...estilos.naipeCentral, color: carta.cor, filter: sombra }}>
                {carta.simbolo}
            </span>

            {/* Canto inferior direito */}
            <div style={{
                ...estilos.cantoSuperior,
                top: 'auto', left: 'auto',
                bottom: '6px', right: '6px',
                transform: 'rotate(180deg)',
            }}>
                <span style={{ ...estilos.cantoValor, color: carta.cor, filter: sombra }}>
                    {carta.valor}
                </span>
                <span style={{ ...estilos.cantoNaipe, color: carta.cor, filter: sombra }}>
                    {carta.simbolo}
                </span>
            </div>

            {/* Brilho */}
            <div style={{
                ...estilos.brilho,
                borderRadius: `${tema?.frente?.raio || 8}px ${tema?.frente?.raio || 8}px 0 0`,
            }} />
        </div>
    );
}

function SlotVazio({ tema }) {
    return (
        <div style={{
            width:          '64px',
            height:         '90px',
            background:     tema?.verso?.fundo  || 'rgba(255,255,255,0.04)',
            borderRadius:   (tema?.frente?.raio || 8) + 'px',
            border:         '1px dashed rgba(255,255,255,0.15)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
        }}>
            <div style={{
                width:        '48px',
                height:       '70px',
                background:   tema?.verso?.detalhe || 'rgba(255,255,255,0.04)',
                borderRadius: Math.max(2, (tema?.frente?.raio || 8) - 4) + 'px',
                opacity:      0.25,
            }} />
        </div>
    );
}

const estilos = {
    container: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '6px',
        position:       'relative',
        padding:        '8px 0',
    },
    badgeFold: {
        position:      'absolute',
        top:           '-8px',
        left:          '50%',
        transform:     'translateX(-50%)',
        background:    '#EF4444',
        color:         'white',
        fontSize:      '10px',
        fontWeight:    '700',
        padding:       '2px 8px',
        borderRadius:  '4px',
        letterSpacing: '0.08em',
        zIndex:        10,
    },
    cartasWrapper: {
        display:  'flex',
        gap:      '6px',
        position: 'relative',
    },
    cantoSuperior: {
        position:      'absolute',
        top:           '6px',
        left:          '6px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        lineHeight:    1,
        gap:           '1px',
    },
    cantoValor: {
        fontSize:   '16px',
        fontWeight: '800',
        lineHeight: 1,
        fontFamily: 'Georgia, serif',
    },
    cantoNaipe: {
        fontSize:   '12px',
        lineHeight: 1,
    },
    naipeCentral: {
        fontSize:   '32px',
        lineHeight: 1,
        userSelect: 'none',
    },
    brilho: {
        position:      'absolute',
        top:           0,
        left:          0,
        right:         0,
        height:        '40%',
        background:    'linear-gradient(to bottom, rgba(255,255,255,0.15), transparent)',
        pointerEvents: 'none',
    },
    label: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.35)',
        margin:        0,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight:    '500',
    },
};
