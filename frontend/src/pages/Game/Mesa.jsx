import { useRef, useEffect, useState } from 'react';
import Jogador   from './Jogador';
import { getTema } from '../../core/temas';
import { PilhaFichas } from '../../components/ChipPoker';

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1);   // Unicode — não aplicar toLowerCase
    const valor = codigo.slice(0, -1);
    return { codigo, valor, naipe };
}

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function tempoDoJogador(uid) {
    return uid?.startsWith('bot_') ? 10000 : 45000;
}

export default function Mesa({ mesa, meuUid, minhasCartas = [], meuAvatar = '', tema = 'classico' }) {
    const ovalRef = useRef(null);
    const [dims, setDims] = useState({ w: 400, h: 242 });

    // Mede a oval em pixels reais — atualiza quando a janela redimensiona
    useEffect(() => {
        const el = ovalRef.current;
        if (!el) return;
        const obs = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0) setDims({ w: width, h: height });
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    if (!mesa) return null;

    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const cartasCom      = (mesa.cartasComunitarias || []).map(parsearCarta);
    const temaObj        = getTema(tema);
    const total          = jogadoresArray.length;
    const meuIndex       = jogadoresArray.findIndex(([uid]) => uid === meuUid);
    const offset         = meuIndex >= 0 ? meuIndex : 0;

    // ── Semi-eixos: posiciona os jogadores NA BORDA da oval ──────────
    // 88% → centro do avatar fica sobre a borda do trilho
    // (metade dentro do feltro, metade fora — visual de "sentado na mesa")
    const sx = (dims.w / 2) * 0.88;
    const sy = (dims.h / 2) * 0.88;

    // ── Posições dos jogadores em % da oval ────────────────────────
    // +90° → indiceRel=0 (jogador local) fica na BASE (ângulo 90° = baixo)
    const posicoes = jogadoresArray.map(([uid, jogador], index) => {
        const indiceRel = (index - offset + total) % total;
        const angulo    = (indiceRel / total) * 360 + 90;
        const rad       = (angulo * Math.PI) / 180;

        return {
            uid, jogador,
            esquerda: 50 + ((sx * Math.cos(rad)) / dims.w) * 100,
            topo:     50 + ((sy * Math.sin(rad)) / dims.h) * 100,
            souEu:    uid === meuUid,
        };
    });

    // ── Tamanho do avatar escala com a largura da oval ─────────────
    // clamp: mínimo 44px, máximo 72px
    const avatarSz = Math.max(44, Math.min(72, Math.round(dims.w * 0.13)));

    // ── Tamanho das cartas comunitárias escala com a oval ──────────
    const cardW = Math.max(32, Math.min(56, Math.round(dims.w * 0.09)));
    const cardH = Math.round(cardW * 1.42);
    const cardFont = Math.max(8, Math.round(cardW * 0.22));
    const cardNaipe = Math.max(14, Math.round(cardW * 0.50));

    const potFont   = Math.max(11, Math.min(15, Math.round(dims.w * 0.033)));
    const faseFont  = Math.max(8,  Math.min(11, Math.round(dims.w * 0.024)));

    return (
        <div style={css.container}>
            {/* Oval de referência — medida pelo ResizeObserver */}
            <div ref={ovalRef} className="mesa-oval" style={css.oval}>

                {/* Trilho escuro (borda almofadada da mesa) */}
                <div style={css.trilho}>

                    {/* Feltro verde */}
                    <div style={css.feltro}>

                        {/* Centro: fase + pot + cartas */}
                        <div style={css.centro}>
                            {mesa.fase && mesa.fase !== 'AGUARDANDO' && (
                                <span style={{ ...css.faseBadge, fontSize: faseFont + 'px' }}>
                                    {mesa.fase.replace('-', ' ')}
                                </span>
                            )}

                            {mesa.pote > 0 && (
                                <div style={css.pot}>
                                    <PilhaFichas size={Math.max(14, Math.round(potFont * 1.1))} valor={mesa.pote} />
                                    <span style={{ fontSize: potFont + 'px', fontWeight: 700, color: '#F59E0B' }}>
                                        Pot ₿C {fmt(mesa.pote)}
                                    </span>
                                </div>
                            )}

                            {/* Cartas comunitárias */}
                            <div style={css.cartasRow}>
                                {mesa.fase === 'AGUARDANDO' ? (
                                    <p style={{ ...css.textoVazio, fontSize: faseFont + 'px' }}>
                                        Aguardando jogadores...
                                    </p>
                                ) : cartasCom.length > 0 ? (
                                    Array.from({ length: 5 }).map((_, i) => {
                                        const carta = cartasCom[i];
                                        return carta
                                            ? <CartaCom key={i} carta={carta} w={cardW} h={cardH} fv={cardFont} fn={cardNaipe} temaObj={temaObj} />
                                            : <CartaComVazia key={i} w={cardW} h={cardH} />;
                                    })
                                ) : (
                                    <p style={{ ...css.textoVazio, fontSize: faseFont + 'px' }}>
                                        Distribuindo...
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Jogadores posicionados na borda do feltro */}
                        {posicoes.map(({ uid, jogador, esquerda, topo, souEu }) => (
                            <div key={uid} style={{
                                position:  'absolute',
                                left:      `${esquerda}%`,
                                top:       `${topo}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex:    4,
                            }}>
                                <Jogador
                                    jogador={souEu && meuAvatar
                                        ? { ...jogador, avatar: meuAvatar }
                                        : jogador}
                                    souEu={souEu}
                                    ehVez={mesa.turno === uid}
                                    cartasPrivadas={souEu ? minhasCartas : []}
                                    ehDealer={mesa.dealer === uid}
                                    ehSB={mesa.sbId === uid}
                                    ehBB={mesa.bbId === uid}
                                    tempoMs={tempoDoJogador(uid)}
                                    avatarSz={avatarSz}
                                    tema={tema}
                                />
                            </div>
                        ))}

                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Carta comunitária com dimensões dinâmicas ──────────────────────
function CartaCom({ carta, w, h, fv, fn, temaObj }) {
    const t       = temaObj || { naipes: {}, frente: { fundo:'#FFFFFF', borda:'#D1D5DB', raio:8 } };
    const cor     = t.naipes[carta.naipe]?.cor || '#111827';
    const fundo   = t.frente.fundo || '#FFFFFF';
    const borda   = t.frente.borda || '#D1D5DB';
    const premium = !!t.premium;
    const raio    = Math.round(w * 0.1);
    return (
        <div style={{
            width:          w + 'px',
            height:         h + 'px',
            background:     fundo,
            borderRadius:   raio + 'px',
            border:         premium ? `2px solid ${borda}` : `1px solid ${borda}`,
            boxShadow:      premium
                ? `0 3px 10px rgba(0,0,0,0.6), inset 0 0 0 2px ${fundo}, inset 0 0 0 3px ${borda}80`
                : '0 3px 10px rgba(0,0,0,0.6)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            position:       'relative',
            flexShrink:     0,
        }}>
            {premium && [
                { top: '2px', left: '2px' }, { top: '2px', right: '2px' },
                { bottom: '2px', left: '2px' }, { bottom: '2px', right: '2px' },
            ].map((pos, i) => (
                <span key={i} style={{ position: 'absolute', ...pos, fontSize: Math.round(fn * 0.4) + 'px', color: borda, opacity: 0.7, lineHeight: 1 }}>✦</span>
            ))}
            <span style={{
                position: 'absolute', top: '3px', left: '3px',
                fontSize: fv + 'px', fontWeight: 900, lineHeight: 1,
                color: cor, fontFamily: 'Georgia, serif',
            }}>
                {carta.valor}{carta.naipe}
            </span>
            <span style={{ fontSize: fn + 'px', color: cor, lineHeight: 1 }}>
                {carta.naipe}
            </span>
            <span style={{
                position: 'absolute', bottom: '3px', right: '3px',
                fontSize: fv + 'px', fontWeight: 900, lineHeight: 1,
                color: cor, transform: 'rotate(180deg)',
                fontFamily: 'Georgia, serif',
            }}>
                {carta.valor}{carta.naipe}
            </span>
        </div>
    );
}

function CartaComVazia({ w, h }) {
    return (
        <div style={{
            width:        w + 'px',
            height:       h + 'px',
            background:   'rgba(255,255,255,0.04)',
            border:       '1px dashed rgba(255,255,255,0.12)',
            borderRadius: Math.round(w * 0.1) + 'px',
            flexShrink:   0,
        }} />
    );
}

const css = {
    container: {
        width:          '100%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },
    // Oval: preenche a largura disponível, altura definida pelo aspect-ratio
    oval: {
        width:        '100%',
        aspectRatio:  '1.75 / 1',
        position:     'relative',
        borderRadius: '50%',
    },
    trilho: {
        position:     'absolute',
        inset:        0,
        borderRadius: '50%',
        background:   'linear-gradient(160deg,#2c2c2c 0%,#111 60%,#1a1a1a 100%)',
        boxShadow:    [
            '0 0 0 3px #3a3a3a',
            '0 0 0 6px #111',
            '0 16px 60px rgba(0,0,0,0.85)',
            'inset 0 4px 12px rgba(255,255,255,0.05)',
        ].join(', '),
        padding:      '14px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },
    feltro: {
        width:        '100%',
        height:       '100%',
        borderRadius: '50%',
        background:   'radial-gradient(ellipse at 50% 40%, #2d7a47 0%, #1d5e34 45%, #133d21 80%, #0c2d17 100%)',
        boxShadow:    'inset 0 0 60px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3)',
        border:       '1px solid rgba(255,255,255,0.04)',
        position:     'relative',
        overflow:     'visible',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },
    centro: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '5px',
        zIndex:         2,
        padding:        '4px',
        pointerEvents:  'none',
    },
    faseBadge: {
        color:         'rgba(255,255,255,0.38)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontWeight:    600,
    },
    pot: {
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
        background:   'rgba(0,0,0,0.45)',
        border:       '1px solid rgba(245,158,11,0.30)',
        borderRadius: '20px',
        padding:      '2px 12px 2px 8px',
    },
    cartasRow: {
        display:        'flex',
        gap:            '4px',
        alignItems:     'center',
        justifyContent: 'center',
        flexWrap:       'nowrap',
    },
    textoVazio: {
        color:     'rgba(255,255,255,0.28)',
        margin:    0,
        textAlign: 'center',
        fontStyle: 'italic',
    },
};
