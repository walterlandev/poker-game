/* ================================================================
   ARQUIVO: frontend/src/pages/Game/CartasComunitarias.jsx
   MUDANÇA: + prop temaId — aplica cores do tema sem alterar tamanhos
================================================================ */

import { getTema } from '../../core/temas';

const SIMBOLO_NAIPE = { h: '♥', d: '♦', s: '♠', c: '♣' };
const NOME_NAIPE    = { h: 'Copas', d: 'Ouros', s: 'Espadas', c: 'Paus' };
const NOME_VALOR    = {
    A:'Ás', K:'Rei', Q:'Dama', J:'Valete', T:'10',
    '9':'9','8':'8','7':'7','6':'6','5':'5','4':'4','3':'3','2':'2',
};

const LABEL_POR_FASE = {
    FLOP:     '🂠 Flop',
    TURN:     '🂠 Turn',
    RIVER:    '🂠 River',
    SHOWDOWN: '🏆 Showdown',
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

function obterNovasCartas(fase) {
    switch (fase) {
        case 'FLOP':  return [0, 1, 2];
        case 'TURN':  return [3];
        case 'RIVER': return [4];
        default:      return [];
    }
}

export default function CartasComunitarias({
    cartas = [],
    fase   = '',
    temaId = 'classico',
}) {
    const tema        = getTema(temaId);
    const novasCartas = obterNovasCartas(fase);

    return (
        <div style={estilos.container}>
            {cartas.length > 0 && (
                <p style={estilos.labelFase}>{LABEL_POR_FASE[fase] || ''}</p>
            )}

            <div style={estilos.slots}>
                {Array.from({ length: 5 }).map((_, index) => {
                    const codigo  = cartas[index];
                    const carta   = parsearCarta(codigo, tema);
                    const eNova   = novasCartas.includes(index);
                    const temDiv  = index === 3 || index === 4;

                    return (
                        <div key={index} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                            {temDiv && <div style={estilos.divisor} />}
                            {carta
                                ? <CartaRevelada carta={carta} tema={tema} animada={eNova} indice={index} />
                                : <SlotVazio tema={tema} />
                            }
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CartaRevelada({ carta, tema, animada = false, indice = 0 }) {
    const delayMs = indice < 3 ? indice * 100 : 0;
    const ehNeon  = tema?.id === 'neon';
    const sombra  = ehNeon
        ? `drop-shadow(0 0 5px ${carta.cor})`
        : `drop-shadow(0 1px 2px ${carta.cor}30)`;

    return (
        <>
            <style>{`
                @keyframes virarCarta {
                    0%   { transform: rotateY(90deg) scale(0.8); opacity: 0; }
                    50%  { transform: rotateY(45deg) scale(0.9); opacity: 0.5; }
                    100% { transform: rotateY(0deg)  scale(1);   opacity: 1; }
                }
                .carta-revelada { animation: virarCarta 0.4s ease forwards; }
            `}</style>

            <div
                className={animada ? 'carta-revelada' : ''}
                style={{
                    /* ── Tamanhos originais ── */
                    width:          '44px',
                    height:         '62px',
                    /* ── Cores do tema ── */
                    background:     tema?.frente?.fundo || '#FFFFFF',
                    borderRadius:   (tema?.frente?.raio || 5) + 'px',
                    border:         `1px solid ${tema?.frente?.borda || '#E5E7EB'}`,
                    /* ── Layout ── */
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    position:       'relative',
                    flexShrink:     0,
                    boxShadow:      ehNeon
                        ? `0 0 12px ${carta.cor}40, 0 3px 10px rgba(0,0,0,0.4)`
                        : '0 3px 10px rgba(0,0,0,0.5)',
                    animationDelay: animada ? `${delayMs}ms` : '0ms',
                    overflow:       'hidden',
                }}
                aria-label={carta.nome}
                role="img"
            >
                {/* Canto superior esquerdo */}
                <div style={estilos.canto}>
                    <span style={{ ...estilos.cantoValor, color: carta.cor, filter: sombra }}>
                        {carta.valor}
                    </span>
                    <span style={{ ...estilos.cantoNaipe, color: carta.cor, filter: sombra }}>
                        {carta.simbolo}
                    </span>
                </div>

                {/* Naipe central */}
                <span style={{ fontSize:'20px', color: carta.cor, lineHeight:1, userSelect:'none', filter: sombra }}>
                    {carta.simbolo}
                </span>

                {/* Canto inferior direito */}
                <div style={{
                    ...estilos.canto,
                    top: 'auto', left: 'auto',
                    bottom: '4px', right: '4px',
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
                <div style={estilos.brilho} />
            </div>
        </>
    );
}

function SlotVazio({ tema }) {
    return (
        <div style={{
            /* ── Tamanhos originais ── */
            width:          '44px',
            height:         '62px',
            /* ── Cores do tema ── */
            background:     tema?.verso?.fundo || 'linear-gradient(135deg, #1a3a5c, #0f2540)',
            borderRadius:   (tema?.frente?.raio || 5) + 'px',
            border:         '1px solid rgba(255,255,255,0.08)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      'inset 0 2px 6px rgba(0,0,0,0.4)',
            flexShrink:     0,
        }}>
            <div style={{
                width:        '32px',
                height:       '48px',
                background:   tema?.verso?.detalhe || 'rgba(255,255,255,0.06)',
                borderRadius: Math.max(2, (tema?.frente?.raio || 5) - 2) + 'px',
                opacity:      0.35,
            }} />
        </div>
    );
}

const estilos = {
    container: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '6px',
    },
    labelFase: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.4)',
        margin:        0,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight:    '600',
    },
    slots: {
        display:    'flex',
        gap:        '4px',
        alignItems: 'center',
    },
    divisor: {
        width:        '1px',
        height:       '36px',
        background:   'rgba(255,255,255,0.1)',
        marginRight:  '2px',
        borderRadius: '1px',
    },
    canto: {
        position:      'absolute',
        top:           '4px',
        left:          '4px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '0px',
        lineHeight:    1,
    },
    cantoValor: {
        fontSize:   '12px',
        fontWeight: '800',
        lineHeight: 1,
        fontFamily: 'Georgia, serif',
    },
    cantoNaipe: {
        fontSize:   '10px',
        lineHeight: 1,
    },
    brilho: {
        position:      'absolute',
        top:           0,
        left:          0,
        right:         0,
        height:        '35%',
        background:    'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)',
        borderRadius:  '5px 5px 0 0',
        pointerEvents: 'none',
    },
};
