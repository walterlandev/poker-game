import Temporizador from './Temporizador';
import { getTema }  from '../../core/temas';
import { corPorValor } from '../../core/chipCores';
import ChipPoker    from '../../components/ChipPoker';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1);   // Unicode: '♥' '♦' '♠' '♣' — não aplicar toLowerCase
    const valor = codigo.slice(0, -1);
    return { codigo, valor, naipe };
}

export default function Jogador({
    jogador,
    souEu          = false,
    ehVez          = false,
    cartasPrivadas = [],
    ehDealer       = false,
    ehSB           = false,
    ehBB           = false,
    tempoMs        = 45000,
    avatarSz       = 58,     // escala responsiva vinda do Mesa.jsx
    tema           = 'classico',
}) {
    if (!jogador) return null;

    const foldado   = jogador.status === 'fold' || jogador.status === 'FOLD';
    const allIn     = jogador.status === 'all-in' || jogador.status === 'ALL-IN';
    const apostaVal = jogador.apostaRodada || jogador.aposta || 0;

    // Dimensões escaladas proporcionalmente ao avatarSz
    const cardW      = Math.round(avatarSz * 0.47);  // ex: 58→27px
    const cardH      = Math.round(cardW * 1.40);
    const cardFv     = Math.max(8,  Math.round(cardW * 0.36));
    const cardFn     = Math.max(10, Math.round(cardW * 0.50));
    const nomeFont   = Math.max(9,  Math.round(avatarSz * 0.18));
    const saldoFont  = Math.max(8,  Math.round(avatarSz * 0.16));
    const chipFont   = Math.max(8,  Math.round(avatarSz * 0.15));
    const badgeFont  = Math.max(6,  Math.round(avatarSz * 0.13));

    const cartas = souEu && cartasPrivadas.length > 0
        ? cartasPrivadas
        : (jogador.cartas || []);

    return (
        <div style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           Math.round(avatarSz * 0.07) + 'px',
            position:      'relative',
            opacity:        foldado ? 0.38 : 1,
        }}>

            {/* Chip de aposta flutuante acima do avatar */}
            {apostaVal > 0 && !foldado && (
                <div style={{
                    position:     'absolute',
                    top:          -(Math.round(avatarSz * 0.38)) + 'px',
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          '4px',
                    background:   'rgba(8,12,24,0.75)',
                    border:       '1px solid rgba(255,255,255,0.18)',
                    borderRadius: '20px',
                    padding:      '2px 8px 2px 4px',
                    whiteSpace:   'nowrap',
                    zIndex:       6,
                    boxShadow:    '0 2px 8px rgba(0,0,0,0.5)',
                }}>
                    <ChipPoker size={Math.max(14, Math.round(avatarSz * 0.28))} {...corPorValor(apostaVal)} />
                    <span style={{ fontSize: chipFont+'px', fontWeight:'800', color:'#fff', letterSpacing:'0.02em' }}>
                        ₿C {fmt(apostaVal)}
                    </span>
                </div>
            )}

            {/* Avatar + ring de turno */}
            <div style={{
                position:     'relative',
                width:        avatarSz + 'px',
                height:       avatarSz + 'px',
                borderRadius: '50%',
                flexShrink:   0,
                transition:   'box-shadow 0.3s',
                boxShadow: ehVez
                    ? `0 0 0 ${Math.round(avatarSz*0.05)}px #F59E0B, 0 0 20px rgba(245,158,11,0.55)`
                    : souEu
                        ? `0 0 0 ${Math.round(avatarSz*0.04)}px #7C3AED, 0 0 12px rgba(124,58,237,0.4)`
                        : `0 0 0 ${Math.round(avatarSz*0.03)}px rgba(255,255,255,0.12)`,
            }}>
                {/* Face do avatar */}
                <div style={{
                    width:          '100%',
                    height:         '100%',
                    borderRadius:   '50%',
                    background:     'linear-gradient(135deg,#1f2937,#111827)',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    overflow:       'hidden',
                    position:       'relative',
                    zIndex:         1,
                }}>
                    {jogador.avatar ? (
                        <img
                            src={jogador.avatar}
                            alt={jogador.nome}
                            style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }}
                            onError={e => { e.target.onerror=null; e.target.style.display='none'; }}
                        />
                    ) : (
                        <span style={{ fontSize: Math.round(avatarSz * 0.40) + 'px', lineHeight:1 }}>
                            {jogador.bot ? '🤖' : '🧑'}
                        </span>
                    )}
                </div>

                {/* Anel de tempo */}
                <Temporizador totalMs={tempoMs} ativo={ehVez} tamanho={avatarSz} />

                {/* Badges ALL-IN / FOLD */}
                {allIn && (
                    <div style={{
                        position:'absolute', bottom:'-4px', left:'50%',
                        transform:'translateX(-50%)',
                        background:'#EF4444', color:'#fff',
                        fontSize: badgeFont+'px', fontWeight:'900',
                        padding:`1px ${Math.round(badgeFont*0.6)}px`,
                        borderRadius:'4px', zIndex:5, whiteSpace:'nowrap',
                        letterSpacing:'0.05em',
                    }}>ALL-IN</div>
                )}
                {foldado && (
                    <div style={{
                        position:'absolute', bottom:'-4px', left:'50%',
                        transform:'translateX(-50%)',
                        background:'#6B7280', color:'#fff',
                        fontSize: badgeFont+'px', fontWeight:'900',
                        padding:`1px ${Math.round(badgeFont*0.6)}px`,
                        borderRadius:'4px', zIndex:5, whiteSpace:'nowrap',
                        letterSpacing:'0.05em',
                    }}>FOLD</div>
                )}
            </div>

            {/* Cartas mini */}
            {cartas.length > 0 && (
                <div style={{ display:'flex', gap: Math.round(cardW*0.12)+'px' }}>
                    {cartas.map((c, i) => {
                        const carta = parsearCarta(c);
                        return carta
                            ? <CartaMini key={i} carta={carta} w={cardW} h={cardH} fv={cardFv} fn={cardFn} tema={tema} />
                            : <CartaVerso key={i} w={cardW} h={cardH} tema={tema} />;
                    })}
                </div>
            )}

            {/* Painel nome + saldo */}
            <div style={{
                background:     'rgba(8,12,24,0.88)',
                border:         `1px solid ${ehVez ? 'rgba(245,158,11,0.4)' : souEu ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius:   '8px',
                padding:        `2px ${Math.round(avatarSz * 0.17)}px`,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            '1px',
                minWidth:       Math.round(avatarSz * 1.22) + 'px',
                backdropFilter: 'blur(6px)',
            }}>
                <span style={{
                    fontSize:     nomeFont+'px',
                    fontWeight:   700,
                    color:        souEu ? '#A78BFA' : '#F0F0F0',
                    maxWidth:     Math.round(avatarSz * 1.4) + 'px',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                    lineHeight:   1.2,
                }}>
                    {jogador.nome?.split(' ')[0] || 'Jogador'}
                </span>
                <span style={{ fontSize:saldoFont+'px', fontWeight:'600', color:'#38BDF8', lineHeight:1.2 }}>
                    ₿C {fmt(jogador.saldo)}
                </span>
            </div>

            {/* Badges D / SB / BB */}
            {(ehDealer || ehSB || ehBB) && (
                <div style={{ display:'flex', gap:'3px', flexWrap:'wrap', justifyContent:'center' }}>
                    {ehDealer && <BadgePos texto="D"  cor="#F59E0B" fs={badgeFont} />}
                    {ehSB     && <BadgePos texto="SB" cor="#3B82F6" fs={badgeFont} />}
                    {ehBB     && <BadgePos texto="BB" cor="#8B5CF6" fs={badgeFont} />}
                </div>
            )}

        </div>
    );
}

function BadgePos({ texto, cor, fs }) {
    return (
        <div style={{
            fontSize:     fs+'px',
            fontWeight:   800,
            color:        '#fff',
            padding:      `1px ${Math.round(fs*0.6)}px`,
            borderRadius: '4px',
            lineHeight:   '1.4',
            background:   cor,
            boxShadow:    `0 0 8px ${cor}80`,
            letterSpacing:'0.03em',
        }}>
            {texto}
        </div>
    );
}

function CartaMini({ carta, w, h, fv, fn, tema = 'classico' }) {
    const t       = getTema(tema);
    const cor     = t.naipes[carta.naipe]?.cor || '#111827';
    const fundo   = t.frente.fundo  || '#FFFFFF';
    const borda   = t.frente.borda  || '#D1D5DB';
    const premium = !!t.premium;
    const raio    = Math.max(t.frente.raio || 8, Math.round(w * 0.13));
    return (
        <div style={{
            width:          w+'px',
            height:         h+'px',
            background:     fundo,
            borderRadius:   raio+'px',
            border:         premium ? `2px solid ${borda}` : `1px solid ${borda}`,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      premium
                ? `0 2px 8px rgba(0,0,0,0.6), inset 0 0 0 1.5px ${fundo}, inset 0 0 0 2.5px ${borda}80`
                : '0 2px 8px rgba(0,0,0,0.6)',
            flexShrink:     0,
            gap:            '1px',
        }}>
            <span style={{ fontSize:fv+'px', fontWeight:'900', color:cor, lineHeight:1 }}>
                {carta.valor}
            </span>
            <span style={{ fontSize:fn+'px', color:cor, lineHeight:1 }}>
                {carta.naipe}
            </span>
        </div>
    );
}

function CartaVerso({ w, h, tema = 'classico' }) {
    const t       = getTema(tema);
    const fundo   = t.verso.fundo   || '#1E3A8A';
    const premium = !!t.premium;
    return (
        <div style={{
            width:        w+'px',
            height:       h+'px',
            background:   `linear-gradient(135deg, ${fundo}, ${t.verso.detalhe || fundo})`,
            borderRadius: Math.round(w*0.13)+'px',
            border:       premium ? `1.5px solid rgba(255,255,255,0.45)` : '1px solid rgba(255,255,255,0.25)',
            boxShadow:    premium
                ? `0 2px 8px rgba(0,0,0,0.6), inset 0 0 0 2px ${t.verso.detalhe || fundo}`
                : '0 2px 8px rgba(0,0,0,0.6)',
            flexShrink:   0,
        }} />
    );
}
