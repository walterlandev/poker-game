/* ================================================================
   ARQUIVO: frontend/src/pages/Game/index.jsx

   MUDANÇAS DESTA VERSÃO:
   → Escuta 'wallet:saldo_atualizado' → atualiza saldo real na tela
   → Exibe notificação de ganho/perda ao fim de cada rodada
   → Mostra saldo real do Firestore (não só fichas da mesa)
   → Badge "Suas fichas" vs "Saldo real" distintos
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import InfoMesa           from './InfoMesa';
import Mesa               from './Mesa';
import CartasJogador      from './CartasJogador';
import CartasComunitarias from './CartasComunitarias';
import ActionBar          from '../../components/ActionBar';

export default function Game({ socket, usuario, mesaId, onSair }) {

    const [mesa,          setMesa         ] = useState(null);
    const [minhasCartas,  setMinhasCartas ] = useState([]);
    const [notificacao,   setNotificacao  ] = useState(null);
    const [saldoReal,     setSaldoReal    ] = useState(usuario?.saldo || 0);
    const [notifGanho,    setNotifGanho   ] = useState(null);  // animação de ganho/perda
    const timerRef  = useRef(null);
    const ganhoRef  = useRef(null);

    void mesaId;

    useEffect(() => {
        if (!socket) return;

        const onEstado = (e) => {
            const mesaAnterior = mesa;

            setMesa(e);

            // Detecta fim de rodada para animar ganho/perda
            if (
                e.fase === 'SHOWDOWN' &&
                mesaAnterior?.fase !== 'SHOWDOWN' &&
                e.mensagemVitoria
            ) {
                const meuUid  = usuario?.uid;
                const euGanhei = e.mensagemVitoria.includes(meuUid)
                    || (e.jogadores?.[meuUid] && e.mensagemVitoria.includes(
                        e.jogadores[meuUid]?.nome
                    ));

                setNotifGanho({
                    tipo:  euGanhei ? 'ganho' : 'perda',
                    texto: e.mensagemVitoria,
                });
                if (ganhoRef.current) clearTimeout(ganhoRef.current);
                ganhoRef.current = setTimeout(() => setNotifGanho(null), 5000);
            }
        };

        const onCartas      = ({ cartas })   => setMinhasCartas(cartas || []);
        const onNotificacao = ({ mensagem }) => {
            setNotificacao(mensagem);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setNotificacao(null), 4000);
        };

        // Saldo real atualizado pelo backend (após ganhar/perder/sair)
        const onSaldoAtualizado = ({ saldo }) => {
            setSaldoReal(saldo || 0);
        };

        socket.on('estado_mesa',          onEstado);
        socket.on('carta_privada',        onCartas);
        socket.on('notificacao',          onNotificacao);
        socket.on('wallet:saldo_atualizado', onSaldoAtualizado);
        socket.emit('pedir_estado');

        return () => {
            socket.off('estado_mesa',          onEstado);
            socket.off('carta_privada',        onCartas);
            socket.off('notificacao',          onNotificacao);
            socket.off('wallet:saldo_atualizado', onSaldoAtualizado);
            if (timerRef.current)  clearTimeout(timerRef.current);
            if (ganhoRef.current)  clearTimeout(ganhoRef.current);
        };
    }, [socket, mesa, usuario]);

    const handleAcao    = useCallback((a, v=0) => socket?.emit('acao', { acao: a, valor: v }), [socket]);
    const handleIniciar = useCallback(()       => socket?.emit('iniciar_rodada'), [socket]);
    const handleSair    = useCallback(()       => {
        socket?.emit('sair_mesa');
        onSair?.();
    }, [socket, onSair]);

    // ── Carregando ──────────────────────────────────────────────
    if (!mesa) return (
        <div style={estilos.carregando}>
            <style>{`@keyframes girar { to { transform:rotate(360deg); } }`}</style>
            <div style={estilos.spinner} />
            <p style={estilos.carregandoTexto}>Entrando na mesa...</p>
        </div>
    );

    // ── Dados derivados ─────────────────────────────────────────
    const meuUid         = usuario?.uid;
    const temaId         = usuario?.tema || 'classico';
    const ehMinhaVez     = mesa.turno === meuUid;
    const euSou          = mesa.jogadores?.[meuUid];
    const souHost        = mesa.host === meuUid;
    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const foldado        = euSou?.status === 'fold';
    const jogoAtivo      = mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN';

    // Fichas na mesa (temporárias) vs saldo real (Firestore)
    const fichasMesa = euSou?.saldo || 0;

    return (
        <div style={estilos.pagina} className="game-pagina">

            <style>{`
                @keyframes girar    { to { transform:rotate(360deg); } }
                @keyframes pulsar   { 0%,100%{opacity:1} 50%{opacity:0.4} }
                @keyframes fadeDown {
                    from { opacity:0; transform:translateX(-50%) translateY(-12px); }
                    to   { opacity:1; transform:translateX(-50%) translateY(0); }
                }
                @keyframes ganhoIn {
                    from { opacity:0; transform:translateY(16px) scale(0.9); }
                    to   { opacity:1; transform:translateY(0)    scale(1);   }
                }

                .game-pagina  { max-width:480px; }
                .game-corpo   {
                    display:flex; flex-direction:column;
                    flex:1; overflow:hidden; min-height:0;
                }
                .game-mesa-area {
                    flex:1; display:flex;
                    align-items:center; justify-content:center;
                    padding:4px; min-height:0; overflow:hidden;
                }
                .game-painel {
                    flex-shrink:0; display:flex; flex-direction:column;
                    align-items:center; gap:4px;
                    padding:4px 8px 8px; background:#0a0f1e;
                }

                @media (min-width: 768px) {
                    .game-pagina  { max-width:1200px !important; }
                    .game-corpo   { flex-direction:column; }
                    .game-mesa-area { flex:1; padding:16px 24px 8px; align-items:center; }
                    .game-painel {
                        padding:8px 24px 16px;
                        border-top:1px solid rgba(255,255,255,0.06);
                        background:#0d1424;
                        flex-direction:row; align-items:center; gap:16px;
                    }
                    .game-painel-cartas {
                        display:flex; flex-direction:column;
                        align-items:center; gap:6px; flex-shrink:0;
                    }
                    .game-painel-acoes { flex:1; min-width:0; }
                }
            `}</style>

            {/* ── Header ─────────────────────────────────────────── */}
            <div style={estilos.headerWrapper}>
                <button onClick={handleSair} style={estilos.btnSair}>← Sair</button>

                <div style={{ flex:1, minWidth:0 }}>
                    <InfoMesa mesa={mesa} />
                </div>

                {/* Saldo real sempre visível no header */}
                <div style={estilos.saldoHeader}>
                    <span style={estilos.saldoHeaderLabel}>Saldo</span>
                    <span style={estilos.saldoHeaderValor}>
                        ₿C {saldoReal.toLocaleString('pt-BR')}
                    </span>
                </div>
            </div>

            {/* ── Corpo ──────────────────────────────────────────── */}
            <div className="game-corpo" style={{ flex:1, overflow:'hidden' }}>

                {/* Mesa central */}
                <div className="game-mesa-area">
                    <Mesa mesa={mesa} meuUid={meuUid} minhasCartas={minhasCartas} />
                </div>

                {/* Painel inferior: cartas + ações */}
                <div className="game-painel">

                    <div className="game-painel-cartas">
                        {mesa.fase !== 'AGUARDANDO' && (
                            <CartasComunitarias
                                cartas={mesa.cartasComunitarias || []}
                                fase={mesa.fase}
                                temaId={temaId}
                            />
                        )}
                        <CartasJogador
                            cartas={minhasCartas}
                            foldado={foldado}
                            fase={mesa.fase}
                            temaId={temaId}
                        />
                        {/* Fichas na mesa (durante o jogo) */}
                        {jogoAtivo && euSou && (
                            <div style={estilos.fichasMesa}>
                                <span style={estilos.fichasLabel}>Fichas na mesa</span>
                                <span style={estilos.fichasValor}>
                                    ₿C {fichasMesa.toLocaleString('pt-BR')}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="game-painel-acoes">

                        {/* Botão iniciar (host) */}
                        {mesa.fase === 'AGUARDANDO' && souHost && (
                            <button
                                onClick={handleIniciar}
                                disabled={jogadoresArray.length < 2}
                                style={{
                                    ...estilos.btnIniciar,
                                    opacity: jogadoresArray.length < 2 ? 0.5 : 1,
                                    cursor:  jogadoresArray.length < 2 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {jogadoresArray.length < 2
                                    ? `Aguardando (${jogadoresArray.length}/2)`
                                    : `▶ Iniciar (${jogadoresArray.length} jogadores)`}
                            </button>
                        )}

                        {/* Aguardando host */}
                        {mesa.fase === 'AGUARDANDO' && !souHost && (
                            <div style={estilos.aguardando}>
                                <span style={estilos.ponto} />
                                Aguardando o host iniciar...
                            </div>
                        )}

                        {/* ActionBar */}
                        {jogoAtivo && euSou && (
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

                        {/* Showdown */}
                        {mesa.fase === 'SHOWDOWN' && (
                            <div style={estilos.showdown}>
                                <span style={{ fontSize:'20px' }}>🏆</span>
                                <span>{mesa.mensagemVitoria || 'Fim da rodada!'}</span>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* ── Notificação de sistema (fold automático, etc.) ── */}
            {notificacao && (
                <div style={estilos.notificacao}>{notificacao}</div>
            )}

            {/* ── Notificação de ganho / perda da rodada ────────── */}
            {notifGanho && (
                <div style={{
                    ...estilos.notifGanho,
                    background: notifGanho.tipo === 'ganho'
                        ? 'rgba(34,197,94,0.18)'
                        : 'rgba(239,68,68,0.18)',
                    border: notifGanho.tipo === 'ganho'
                        ? '1px solid rgba(34,197,94,0.50)'
                        : '1px solid rgba(239,68,68,0.40)',
                    color: notifGanho.tipo === 'ganho' ? '#4ADE80' : '#FCA5A5',
                }}>
                    <span style={{ fontSize:'22px' }}>
                        {notifGanho.tipo === 'ganho' ? '🏆' : '💸'}
                    </span>
                    <div>
                        <div style={{ fontWeight:'700', fontSize:'14px' }}>
                            {notifGanho.tipo === 'ganho' ? 'Você ganhou!' : 'Melhor sorte!'}
                        </div>
                        <div style={{ fontSize:'12px', opacity:0.8, marginTop:'2px' }}>
                            {notifGanho.texto}
                        </div>
                        {notifGanho.tipo === 'ganho' && (
                            <div style={{ fontSize:'11px', opacity:0.6, marginTop:'4px' }}>
                                ₿C creditados no seu saldo →
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {
    pagina: {
        height:        '100dvh',
        background:    '#0a0f1e',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
        overflow:      'hidden',
        margin:        '0 auto',
        position:      'relative',
    },

    carregando: {
        height:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'#0a0f1e', gap:'16px',
    },
    spinner: {
        width:'32px', height:'32px',
        border:'3px solid rgba(255,255,255,0.1)',
        borderTop:'3px solid #7C3AED',
        borderRadius:'50%', animation:'girar 0.8s linear infinite',
    },
    carregandoTexto: { color:'rgba(255,255,255,0.5)', fontSize:'14px', margin:0 },

    // Header
    headerWrapper: {
        display:'flex', alignItems:'stretch', background:'#0d1424',
        borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0,
    },
    btnSair: {
        background:'transparent', border:'none',
        borderRight:'1px solid rgba(255,255,255,0.06)',
        color:'rgba(255,255,255,0.5)', fontSize:'13px',
        padding:'0 12px', cursor:'pointer',
        fontFamily:'sans-serif', flexShrink:0, whiteSpace:'nowrap',
    },

    // Saldo real no header
    saldoHeader: {
        display:'flex', flexDirection:'column', alignItems:'flex-end',
        justifyContent:'center', padding:'6px 12px', gap:'1px',
        borderLeft:'1px solid rgba(255,255,255,0.06)',
        flexShrink:0,
    },
    saldoHeaderLabel: {
        fontSize:'9px', color:'rgba(245,158,11,0.6)',
        textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:'600',
    },
    saldoHeaderValor: {
        fontSize:'13px', fontWeight:'700', color:'#F59E0B',
    },

    // Fichas na mesa (temporárias)
    fichasMesa: {
        display:'flex', alignItems:'center', gap:'6px',
        padding:'4px 10px', borderRadius:'6px',
        background:'rgba(124,58,237,0.10)',
        border:'1px solid rgba(124,58,237,0.20)',
        marginTop:'4px',
    },
    fichasLabel: {
        fontSize:'10px', color:'rgba(167,139,250,0.7)',
        textTransform:'uppercase', letterSpacing:'0.05em',
    },
    fichasValor: {
        fontSize:'13px', fontWeight:'700', color:'#A78BFA',
    },

    // Ações
    btnIniciar: {
        width:'100%', padding:'12px',
        background:'linear-gradient(135deg,#22C55E,#16A34A)',
        border:'none', borderRadius:'10px', color:'white',
        fontSize:'14px', fontWeight:'600', fontFamily:'sans-serif',
    },
    aguardando: {
        display:'flex', alignItems:'center', gap:'8px',
        fontSize:'13px', color:'rgba(255,255,255,0.4)',
        padding:'8px 0', justifyContent:'center',
    },
    ponto: {
        display:'inline-block', width:'6px', height:'6px',
        borderRadius:'50%', background:'#F59E0B',
        animation:'pulsar 1.5s ease-in-out infinite', flexShrink:0,
    },
    showdown: {
        display:'flex', alignItems:'center', justifyContent:'center',
        gap:'8px', fontSize:'14px', fontWeight:'600',
        color:'#F59E0B', padding:'12px', textAlign:'center',
    },

    // Notificação de sistema
    notificacao: {
        position:'fixed', top:'70px', left:'50%',
        transform:'translateX(-50%)',
        background:'rgba(34,197,94,0.15)',
        border:'1px solid rgba(34,197,94,0.4)',
        borderRadius:'10px', padding:'10px 20px',
        color:'#4ADE80', fontSize:'14px', fontWeight:'600',
        zIndex:999, textAlign:'center', maxWidth:'320px',
        animation:'fadeDown 0.3s ease', whiteSpace:'nowrap',
    },

    // Notificação de ganho/perda
    notifGanho: {
        position:'fixed', bottom:'120px', left:'50%',
        transform:'translateX(-50%)',
        borderRadius:'12px', padding:'14px 20px',
        display:'flex', alignItems:'center', gap:'12px',
        zIndex:998, maxWidth:'340px', width:'calc(100% - 48px)',
        animation:'ganhoIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        backdropFilter:'blur(12px)',
    },
};
