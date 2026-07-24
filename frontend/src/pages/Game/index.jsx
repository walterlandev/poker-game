import { useState, useEffect, useCallback, useRef } from 'react';
import InfoMesa   from './InfoMesa';
import Mesa       from './Mesa';
import ActionBar  from '../../components/ActionBar';
import HandStrength from '../../components/HandStrength';

export default function Game({ socket, usuario, mesaId, onSair }) {

    const [mesa,         setMesa        ] = useState(null);
    const [minhasCartas, setMinhasCartas] = useState([]);
    const [notificacao,  setNotificacao ] = useState(null);
    const [saldoReal,    setSaldoReal   ] = useState(usuario?.saldo || 0);
    const [notifGanho,   setNotifGanho  ] = useState(null);
    const [linkCopiado,  setLinkCopiado ] = useState(false);

    const timerRef   = useRef(null);
    const ganhoRef   = useRef(null);
    const mesaRef    = useRef(null);
    const usuarioRef = useRef(usuario);

    useEffect(() => { usuarioRef.current = usuario; }, [usuario]);

    void mesaId;

    useEffect(() => {
        if (!socket) return;

        const onEstado = (e) => {
            const mesaAnterior = mesaRef.current;
            mesaRef.current    = e;
            setMesa(e);

            const uid = usuarioRef.current?.uid;
            const cartasDoEstado = e.jogadores?.[uid]?.cartas;
            if (cartasDoEstado && cartasDoEstado.length > 0 && cartasDoEstado[0] !== 'XX') {
                setMinhasCartas(cartasDoEstado);
            }

            if (e.fase === 'SHOWDOWN' && mesaAnterior?.fase !== 'SHOWDOWN' && e.resultadoMao) {
                const res      = e.resultadoMao;
                const euGanhei = res.vencedores.some(v => v.uid === uid);
                setNotifGanho({ tipo: euGanhei ? 'ganho' : 'perda', resultado: res, meuUid: uid });
                if (ganhoRef.current) clearTimeout(ganhoRef.current);
                ganhoRef.current = setTimeout(() => setNotifGanho(null), 6000);
            }
        };

        const onCartas          = ({ cartas })   => setMinhasCartas(cartas || []);
        const onNotificacao     = ({ mensagem }) => {
            setNotificacao(mensagem);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setNotificacao(null), 4000);
        };
        const onSaldoAtualizado = ({ saldo }) => setSaldoReal(saldo || 0);
        const onErro            = ({ mensagem }) => {
            setNotificacao(mensagem);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setNotificacao(null), 4000);
        };

        socket.on('estado_mesa',             onEstado);
        socket.on('carta_privada',           onCartas);
        socket.on('notificacao',             onNotificacao);
        socket.on('wallet:saldo_atualizado', onSaldoAtualizado);
        socket.on('erro',                    onErro);
        socket.emit('pedir_estado');

        return () => {
            socket.off('estado_mesa',             onEstado);
            socket.off('carta_privada',           onCartas);
            socket.off('notificacao',             onNotificacao);
            socket.off('wallet:saldo_atualizado', onSaldoAtualizado);
            socket.off('erro',                    onErro);
            if (timerRef.current) clearTimeout(timerRef.current);
            if (ganhoRef.current) clearTimeout(ganhoRef.current);
        };
    }, [socket]);

    const handleAcao    = useCallback((a, v=0) => socket?.emit('acao', { acao: a, valor: v }), [socket]);
    const handleIniciar = useCallback(()       => socket?.emit('iniciar_rodada'), [socket]);
    const handleRebuy    = useCallback((valor) => socket?.emit('rebuy', { valor }), [socket]);
    const handleSair    = useCallback(()       => { socket?.emit('sair_mesa'); onSair?.(); }, [socket, onSair]);

    const handleCompartilhar = useCallback(() => {
        if (!mesaRef.current) return;
        const url = `${window.location.origin}${window.location.pathname}?mesa=${mesaRef.current.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setLinkCopiado(true);
            setTimeout(() => setLinkCopiado(false), 2500);
        });
    }, []);

    if (!mesa) return (
        <div style={css.loading}>
            <div style={css.spinner} />
            <p style={css.loadingTxt}>Entrando na mesa...</p>
        </div>
    );

    const meuUid         = usuario?.uid;
    const ehMinhaVez     = mesa.turno === meuUid;
    const euSou          = mesa.jogadores?.[meuUid];
    const souHost        = mesa.host === meuUid;
    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const foldado        = euSou?.status === 'fold' || euSou?.status === 'FOLD';
    const emAllIn        = euSou?.status === 'all-in' || euSou?.status === 'ALL-IN';
    const jogoAtivo      = mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN';
    const fichasMesa     = euSou?.saldo || 0;
    const temCartas      = minhasCartas.length === 2;

    return (
        <div style={css.pagina} className="game-pagina">

            {/* ── Header flutuante ───────────────────── */}
            <div style={css.header}>
                <button onClick={handleSair} style={css.btnSair}>← Sair</button>
                <InfoMesa mesa={mesa} />
                <div style={css.saldoBox}>
                    <span style={css.saldoLabel}>Saldo</span>
                    <span style={css.saldoValor}>₿C {saldoReal.toLocaleString('pt-BR')}</span>
                </div>
            </div>

            {/* ── Mesa (área principal) ──────────────── */}
            <div style={css.mesaArea}>
                <Mesa
                    mesa={mesa}
                    meuUid={meuUid}
                    minhasCartas={minhasCartas}
                    meuAvatar={usuario?.avatar || ''}
                    tema={usuario?.tema || 'classico'}
                />
            </div>

            {/* ── Painel inferior flutuante ─────────── */}
            <div style={css.painel}>

                {/* Sem fichas na mesa: oferece recompra com o saldo real */}
                {euSou && fichasMesa <= 0 && (
                    <div style={css.semFichas}>
                        <p style={css.semFichasTexto}>
                            Você ficou sem fichas nesta mesa.
                        </p>
                        <button
                            onClick={() => handleRebuy(mesa.valorBuyIn || 1000)}
                            disabled={saldoReal < (mesa.valorBuyIn || 1000)}
                            style={{
                                ...css.btnRebuy,
                                opacity: saldoReal < (mesa.valorBuyIn || 1000) ? 0.5 : 1,
                                cursor:  saldoReal < (mesa.valorBuyIn || 1000) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            💰 Comprar mais ₿C {(mesa.valorBuyIn || 1000).toLocaleString('pt-BR')} pra continuar
                        </button>
                        {saldoReal < (mesa.valorBuyIn || 1000) && (
                            <p style={css.semFichasAviso}>Saldo insuficiente pra recomprar.</p>
                        )}
                    </div>
                )}

                {/* Linha compacta: força da mão + fichas */}
                {jogoAtivo && euSou && (
                    <div style={css.infoRow}>
                        {!foldado && temCartas ? (
                            <HandStrength
                                cartasMao={minhasCartas}
                                cartasMesa={mesa.cartasComunitarias || []}
                                visivel={true}
                                nOponentes={Math.max(1, jogadoresArray.length - 1)}
                                compact={true}
                            />
                        ) : <span />}
                        <div style={css.fichasInfo}>
                            <span style={css.fichasLabel}>Fichas</span>
                            <span style={css.fichasVal}>₿C {fichasMesa.toLocaleString('pt-BR')}</span>
                        </div>
                    </div>
                )}

                {/* AGUARDANDO: botão iniciar (host) ou mensagem */}
                {mesa.fase === 'AGUARDANDO' && souHost && (
                    <button
                        onClick={handleIniciar}
                        disabled={jogadoresArray.length < 2}
                        style={{
                            ...css.btnIniciar,
                            opacity: jogadoresArray.length < 2 ? 0.5 : 1,
                            cursor:  jogadoresArray.length < 2 ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {jogadoresArray.length < 2
                            ? `Aguardando jogadores (${jogadoresArray.length}/2)`
                            : `▶ Iniciar Jogo  (${jogadoresArray.length} jogadores)`}
                    </button>
                )}

                {mesa.fase === 'AGUARDANDO' && !souHost && (
                    <div style={css.aguardando}>
                        <span style={css.pulseDot} />
                        Aguardando o host iniciar a partida...
                    </div>
                )}

                {mesa.fase === 'AGUARDANDO' && (
                    <button onClick={handleCompartilhar} style={css.btnCompartilhar}>
                        {linkCopiado ? '✓ Link copiado!' : '🔗 Convidar amigos pra mesa'}
                    </button>
                )}

                {/* ActionBar — some quando não há mais decisão a tomar
                    (já desistiu ou já está all-in nesta mão) */}
                {jogoAtivo && euSou && !foldado && !emAllIn && (
                    <ActionBar
                        ehMinhaVez={ehMinhaVez}
                        saldoAtual={fichasMesa}
                        apostaRodada={euSou.apostaRodada || 0}
                        maiorAposta={mesa.maiorAposta || 0}
                        bigBlind={mesa.bigBlind || 20}
                        pote={mesa.pote || 0}
                        onAcao={handleAcao}
                    />
                )}

                {/* Aguardando o showdown enquanto all-in/fold */}
                {jogoAtivo && euSou && (foldado || emAllIn) && (
                    <div style={css.aguardando}>
                        <span style={css.pulseDot} />
                        {emAllIn ? 'Você está All-in — aguardando o resultado da mão...' : 'Você desistiu desta mão.'}
                    </div>
                )}

                {/* SHOWDOWN */}
                {mesa.fase === 'SHOWDOWN' && mesa.resultadoMao && (
                    <ResultadoRodada resultado={mesa.resultadoMao} meuUid={meuUid} />
                )}

            </div>

            {/* ── Notificações ──────────────────────── */}
            {notificacao && (
                <div style={css.notif}>{notificacao}</div>
            )}

            {notifGanho && (
                <NotifResultado notif={notifGanho} />
            )}

        </div>
    );
}

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

// ── Painel de resultado da rodada (dentro do painel inferior) ──────
function ResultadoRodada({ resultado, meuUid }) {
    const isWin = resultado.vencedores.some(v => v.uid === meuUid);

    return (
        <div style={cssRes.container}>
            {/* Rótulo da fase */}
            <div style={cssRes.label}>
                {isWin ? '— Você ganhou esta rodada —' : '— Fim da rodada —'}
            </div>

            {/* Lista de vencedores */}
            {resultado.vencedores.map(v => (
                <div key={v.uid} style={{
                    ...cssRes.vencedor,
                    borderColor: v.uid === meuUid
                        ? 'rgba(245,158,11,0.5)'
                        : 'rgba(255,255,255,0.08)',
                }}>
                    {/* Nome */}
                    <span style={{
                        ...cssRes.nome,
                        color: v.uid === meuUid ? '#F59E0B' : '#E2E8F0',
                    }}>
                        {v.uid === meuUid ? 'Você' : v.nome}
                    </span>

                    {/* Mão (só no showdown) */}
                    {v.mao && (
                        <span style={cssRes.mao}>{v.mao}</span>
                    )}

                    {/* Prêmio */}
                    <span style={cssRes.premio}>
                        +₿C {fmt(v.premio)}
                    </span>
                </div>
            ))}

            {/* Tipo de vitória */}
            {resultado.tipo === 'wo' && (
                <p style={cssRes.detalhe}>Todos os adversários desistiram</p>
            )}
        </div>
    );
}

const cssRes = {
    container: {
        padding:        '10px 12px 6px',
        display:        'flex',
        flexDirection:  'column',
        gap:            '6px',
        borderTop:      '1px solid rgba(255,255,255,0.06)',
    },
    label: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.30)',
        textAlign:     'center',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight:    500,
    },
    vencedor: {
        display:        'flex',
        alignItems:     'center',
        gap:            '8px',
        background:     'rgba(255,255,255,0.03)',
        border:         '1px solid',
        borderRadius:   '10px',
        padding:        '7px 12px',
    },
    nome: {
        fontWeight:   700,
        fontSize:     '14px',
        flex:         1,
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
    },
    mao: {
        fontSize:      '11px',
        color:         'rgba(167,139,250,0.85)',
        background:    'rgba(124,58,237,0.12)',
        border:        '1px solid rgba(124,58,237,0.25)',
        borderRadius:  '6px',
        padding:       '2px 7px',
        whiteSpace:    'nowrap',
        flexShrink:    0,
    },
    premio: {
        fontSize:   '14px',
        fontWeight: 700,
        color:      '#22C55E',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    detalhe: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.25)',
        textAlign: 'center',
        margin:    0,
        fontStyle: 'italic',
    },
};

// ── Notificação flutuante de vitória/derrota ───────────────────────
function NotifResultado({ notif }) {
    const isWin   = notif.tipo === 'ganho';
    const res     = notif.resultado;
    const meuUid  = notif.meuUid;
    const minha   = res?.vencedores?.find(v => v.uid === meuUid);

    return (
        <div style={{
            position:       'fixed',
            top:            '72px',
            left:           '50%',
            transform:      'translateX(-50%)',
            background:     isWin ? 'rgba(15,60,30,0.92)' : 'rgba(60,15,15,0.92)',
            border:         isWin ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(239,68,68,0.35)',
            borderRadius:   '16px',
            padding:        '14px 20px',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            '5px',
            zIndex:         201,
            maxWidth:       '300px',
            width:          'calc(100% - 48px)',
            backdropFilter: 'blur(16px)',
            boxShadow:      isWin
                ? '0 8px 32px rgba(34,197,94,0.25)'
                : '0 8px 32px rgba(239,68,68,0.18)',
            animation: isWin
                ? 'winIn 0.4s ease, winGlow 2s ease-in-out infinite'
                : 'winIn 0.4s ease',
        }}>
            <span style={{ fontSize:'28px', lineHeight:1 }}>
                {isWin ? '🏆' : '💸'}
            </span>

            <div style={{
                fontSize:   '17px',
                fontWeight: 800,
                color:      isWin ? '#4ADE80' : '#FCA5A5',
                textAlign:  'center',
            }}>
                {isWin ? 'Você ganhou!' : 'Boa sorte na próxima!'}
            </div>

            {minha?.mao && (
                <div style={{
                    fontSize:     '12px',
                    color:        'rgba(167,139,250,0.9)',
                    background:   'rgba(124,58,237,0.15)',
                    border:       '1px solid rgba(124,58,237,0.30)',
                    borderRadius: '8px',
                    padding:      '3px 10px',
                }}>
                    {minha.mao}
                </div>
            )}

            {minha?.premio > 0 && (
                <div style={{
                    fontSize:   '15px',
                    fontWeight: 700,
                    color:      '#22C55E',
                }}>
                    +₿C {fmt(minha.premio)}
                </div>
            )}

            {!isWin && res?.vencedores?.[0] && (
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.38)', textAlign:'center' }}>
                    {res.vencedores[0].nome}
                    {res.vencedores[0].mao ? ` — ${res.vencedores[0].mao}` : ''}
                </div>
            )}
        </div>
    );
}

const css = {
    pagina: {
        height:        '100dvh',
        background:    'radial-gradient(ellipse at 50% 30%, #0e1a2e 0%, #080d1a 60%, #050810 100%)',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
        overflow:      'hidden',
        position:      'relative',
    },
    loading: {
        height:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'#080d1a', gap:'16px',
    },
    spinner: {
        width:'36px', height:'36px',
        border:'3px solid rgba(255,255,255,0.08)',
        borderTop:'3px solid #7C3AED',
        borderRadius:'50%', animation:'spin 0.8s linear infinite',
    },
    loadingTxt: { color:'rgba(255,255,255,0.4)', fontSize:'14px', margin:0 },

    // Header: linha fina no topo
    header: {
        display:       'flex',
        alignItems:    'center',
        background:    'rgba(8,13,26,0.80)',
        borderBottom:  '1px solid rgba(255,255,255,0.06)',
        backdropFilter:'blur(8px)',
        flexShrink:    0,
        zIndex:        10,
    },
    btnSair: {
        background:   'transparent',
        border:       'none',
        borderRight:  '1px solid rgba(255,255,255,0.06)',
        color:        'rgba(255,255,255,0.45)',
        fontSize:     '13px',
        padding:      '10px 14px',
        cursor:       'pointer',
        fontFamily:   'inherit',
        flexShrink:   0,
        whiteSpace:   'nowrap',
    },
    saldoBox: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        justifyContent:'center',
        padding:       '6px 12px',
        borderLeft:    '1px solid rgba(255,255,255,0.06)',
        flexShrink:    0,
        gap:           '1px',
    },
    saldoLabel: {
        fontSize:'9px', color:'rgba(245,158,11,0.55)',
        textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:'600',
    },
    saldoValor: { fontSize:'13px', fontWeight:'700', color:'#F59E0B' },

    // Mesa: ocupa todo o espaço disponível; overflow:visible para que
    // os jogadores na borda da oval não sejam cortados
    mesaArea: {
        flex:           1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        overflow:       'visible',
        padding:        '52px 12px',
        minHeight:      0,
    },

    // Painel de ações na base
    painel: {
        flexShrink:    0,
        background:    'rgba(8,13,26,0.90)',
        borderTop:     '1px solid rgba(255,255,255,0.06)',
        backdropFilter:'blur(10px)',
        display:       'flex',
        flexDirection: 'column',
        gap:           '4px',
        paddingBottom: 'env(safe-area-inset-bottom)',
    },

    // Linha compacta: hand strength + fichas
    infoRow: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '5px 12px 2px',
        gap:            '8px',
        minHeight:      '32px',
    },
    fichasInfo: {
        display:       'flex',
        alignItems:    'center',
        gap:           '5px',
        flexShrink:    0,
    },
    fichasLabel: {
        fontSize:'10px', color:'rgba(167,139,250,0.55)',
        textTransform:'uppercase', letterSpacing:'0.05em',
    },
    fichasVal: {
        fontSize:'13px', fontWeight:'700', color:'#A78BFA',
    },

    btnIniciar: {
        margin:       '8px 12px',
        padding:      '14px',
        background:   'linear-gradient(135deg,#22C55E,#16A34A)',
        border:       'none',
        borderRadius: '12px',
        color:        '#fff',
        fontSize:     '15px',
        fontWeight:   '700',
        fontFamily:   'inherit',
        letterSpacing:'0.02em',
        boxShadow:    '0 4px 20px rgba(34,197,94,0.35)',
    },
    aguardando: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        fontSize:       '13px',
        color:          'rgba(255,255,255,0.38)',
        padding:        '14px 0',
    },
    pulseDot: {
        display:'inline-block', width:'7px', height:'7px',
        borderRadius:'50%', background:'#F59E0B',
        animation:'pulse 1.4s ease-in-out infinite', flexShrink:0,
    },
    semFichas: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        padding:        '14px 12px',
    },
    semFichasTexto: {
        fontSize: '13px',
        color:    'rgba(255,255,255,0.55)',
        margin:   0,
    },
    semFichasAviso: {
        fontSize: '11px',
        color:    '#F87171',
        margin:   0,
    },
    btnRebuy: {
        width:        '100%',
        padding:      '14px',
        background:   'linear-gradient(135deg,#F59E0B,#D97706)',
        border:       'none',
        borderRadius: '12px',
        color:        '#fff',
        fontSize:     '14px',
        fontWeight:   '700',
        fontFamily:   'inherit',
        boxShadow:    '0 4px 20px rgba(245,158,11,0.35)',
        WebkitTapHighlightColor: 'transparent',
    },
    btnCompartilhar: {
        margin:       '0 12px 8px',
        padding:      '10px',
        background:   'rgba(124,58,237,0.15)',
        border:       '1px solid rgba(124,58,237,0.35)',
        borderRadius: '10px',
        color:        '#A78BFA',
        fontSize:     '13px',
        fontWeight:   '600',
        fontFamily:   'inherit',
        cursor:       'pointer',
        WebkitTapHighlightColor: 'transparent',
    },
    notif: {
        position:     'fixed',
        top:          '64px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   'rgba(21,128,61,0.18)',
        border:       '1px solid rgba(34,197,94,0.45)',
        borderRadius: '12px',
        padding:      '10px 22px',
        color:        '#4ADE80',
        fontSize:     '13px',
        fontWeight:   '600',
        zIndex:       200,
        textAlign:    'center',
        maxWidth:     '320px',
        animation:    'slideUp 0.3s ease',
        whiteSpace:   'nowrap',
        backdropFilter: 'blur(8px)',
    },
};
