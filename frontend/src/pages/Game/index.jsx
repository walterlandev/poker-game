import { useState, useEffect, useCallback, useRef } from 'react';
import InfoMesa   from './InfoMesa';
import Mesa       from './Mesa';
import ActionBar  from '../../components/ActionBar';
import HandStrength from '../../components/HandStrength';
import Icone        from '../../components/Icone';
import { CartaFace, CartaVerso } from '../../components/Carta';
import { parsearCarta } from '../../core/temas';

export default function Game({ socket, usuario, mesaId, onSair }) {

    const [mesa,         setMesa        ] = useState(null);
    const [minhasCartas, setMinhasCartas] = useState([]);
    const [notificacao,  setNotificacao ] = useState(null);
    const [saldoReal,    setSaldoReal   ] = useState(usuario?.saldo      || 0);
    const [saldoBonus,   setSaldoBonus  ] = useState(usuario?.saldoBonus || 0);
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
        const onSaldoAtualizado = ({ saldo, saldoBonus: bonus }) => {
            setSaldoReal(saldo || 0);
            if (bonus !== undefined) setSaldoBonus(bonus || 0);
        };
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
        <div className="jogo-carregando" role="status">
            <div className="roda" />
            <p>Entrando na mesa…</p>
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
    // Status "all-in" de quem fica sem saldo não é limpo entre mãos — sem
    // cartas na mão, não tem mão ativa esperando resultado de verdade,
    // mesmo que o status ainda esteja "preso" em all-in.
    const aguardandoResultado = jogoAtivo && (foldado || emAllIn) && (euSou?.cartas?.length > 0);
    const buyInMesa          = mesa.valorBuyIn || 1000;
    const temSaldoParaRebuy  = (saldoReal + saldoBonus) >= buyInMesa;

    // Só exibição
    const nomeDaVez    = mesa.turno && !ehMinhaVez ? (mesa.jogadores?.[mesa.turno]?.nome?.split(' ')[0] || '') : '';
    const minhasParse  = minhasCartas.map(parsearCarta);
    const temaMinhas   = euSou?.tema || usuario?.tema || 'classico';
    const mostrarMao   = jogoAtivo && euSou;

    return (
        <div className="jogo">

            {/* ── Topo ───────────────────────────────── */}
            <header className="jogo-topo">
                <button type="button" onClick={handleSair} className="btn-sair-mesa">
                    <Icone nome="sair" />
                    Sair
                </button>
                <InfoMesa mesa={mesa} />
                <div className="saldo">
                    <span>Carteira</span>
                    <b className="num">₿C {saldoReal.toLocaleString('pt-BR')}</b>
                </div>
            </header>

            {/* ── Mesa (área principal) ──────────────── */}
            <main className="jogo-mesa-area">
                <Mesa
                    mesa={mesa}
                    meuUid={meuUid}
                    minhasCartas={minhasCartas}
                    meuAvatar={usuario?.avatar || ''}
                    tema={usuario?.tema || 'classico'}
                />
            </main>

            <div className="jogo-rodape">

                {/* ── Sua mão: cartas grandes (celular) + força da mão ── */}
                {mostrarMao && (
                    <div className="jogo-mao-desk">
                        <div className="jogo-mao">
                            {minhasParse.length > 0 && (
                                <div className="cartas">
                                    {minhasParse.map((c, i) => c
                                        ? <CartaFace key={i} carta={c} largura={54} tema={temaMinhas} indice />
                                        : <CartaVerso key={i} largura={54} tema={temaMinhas} />)}
                                </div>
                            )}
                            <div className="dados">
                                <div className="linha1">
                                    <b>{foldado ? 'Você desistiu' : 'Você'}</b>
                                    <span className="num">₿C {fichasMesa.toLocaleString('pt-BR')}</span>
                                </div>
                                {!foldado && temCartas && (
                                    <HandStrength
                                        cartasMao={minhasCartas}
                                        cartasMesa={mesa.cartasComunitarias || []}
                                        visivel={true}
                                        nOponentes={Math.max(1, jogadoresArray.length - 1)}
                                        compact={true}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Painel de ações ─────────────────────── */}
                <section className="jogo-painel" aria-label="Ações">

                    {/* Sem fichas na mesa: recompra (se tiver saldo real+bônus) ou sair.
                        Não mostra enquanto ainda está esperando o resultado de uma
                        mão ativa (all-in com cartas na mesa) — só entre mãos. */}
                    {euSou && fichasMesa <= 0 && !aguardandoResultado && (
                        <div className="jogo-semfichas">
                            <p>
                                Sem fichas nesta mesa
                                {!temSaldoParaRebuy && ' — saldo insuficiente pra recomprar'}.
                            </p>
                            <div className="linha">
                                {temSaldoParaRebuy && (
                                    <button type="button" onClick={() => handleRebuy(buyInMesa)} className="btn btn-principal">
                                        Comprar ₿C {buyInMesa.toLocaleString('pt-BR')}
                                    </button>
                                )}
                                <button type="button" onClick={handleSair} className="btn btn-neutro">
                                    <Icone nome="sair" tamanho={18} />
                                    Sair da mesa
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AGUARDANDO: botão iniciar (host) ou mensagem */}
                    {mesa.fase === 'AGUARDANDO' && (
                        <div className="jogo-painel-acoes">
                            {souHost ? (
                                <button
                                    type="button"
                                    onClick={handleIniciar}
                                    disabled={jogadoresArray.length < 2}
                                    className="btn btn-principal"
                                    style={{ minHeight: '52px', fontSize: 'var(--t-16)' }}
                                >
                                    {jogadoresArray.length < 2
                                        ? `Aguardando jogadores (${jogadoresArray.length}/2)`
                                        : <><Icone nome="play" tamanho={18} />Iniciar jogo ({jogadoresArray.length} jogadores)</>}
                                </button>
                            ) : (
                                <div className="jogo-painel-msg">
                                    <span className="ponto-pulsante" />
                                    Aguardando o host iniciar a partida…
                                </div>
                            )}
                            <button type="button" onClick={handleCompartilhar} className="btn btn-neutro" style={{ minHeight: '44px' }}>
                                <Icone nome={linkCopiado ? 'check' : 'link'} tamanho={18} />
                                {linkCopiado ? 'Link copiado' : 'Convidar amigos pra mesa'}
                            </button>
                        </div>
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
                            expiraEm={mesa.turnoExpiraEm || null}
                            nomeDaVez={nomeDaVez}
                            onAcao={handleAcao}
                        />
                    )}

                    {/* Aguardando o showdown enquanto all-in/fold — só com mão ativa */}
                    {aguardandoResultado && (
                        <div className="jogo-painel-msg">
                            <span className="ponto-pulsante" />
                            {emAllIn ? 'Você está all-in — aguardando o resultado da mão…' : 'Você desistiu desta mão.'}
                        </div>
                    )}

                    {/* SHOWDOWN */}
                    {mesa.fase === 'SHOWDOWN' && mesa.resultadoMao && (
                        <ResultadoRodada resultado={mesa.resultadoMao} meuUid={meuUid} />
                    )}
                </section>
            </div>

            {/* ── Notificações ──────────────────────── */}
            <div aria-live="polite">
                {notificacao && <div className="jogo-aviso">{notificacao}</div>}
            </div>
            {notifGanho && <NotifResultado notif={notifGanho} />}
        </div>
    );
}

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

// ── Painel de resultado da rodada (dentro do painel inferior) ──────
function ResultadoRodada({ resultado, meuUid }) {
    const isWin = resultado.vencedores.some(v => v.uid === meuUid);
    return (
        <div className="resultado">
            <div className="resultado-titulo">
                {isWin ? 'Você ganhou esta rodada' : 'Fim da rodada'}
            </div>
            {resultado.vencedores.map(v => (
                <div key={v.uid} className={`resultado-linha${v.uid === meuUid ? ' eu' : ''}`}>
                    <span className="nm">{v.uid === meuUid ? 'Você' : v.nome}</span>
                    {v.mao && <span className="mao">{v.mao}</span>}
                    <span className="premio num">+₿C {fmt(v.premio)}</span>
                </div>
            ))}
            {resultado.tipo === 'wo' && (
                <p className="resultado-detalhe">Todos os adversários desistiram</p>
            )}
        </div>
    );
}

// ── Notificação flutuante de vitória/derrota ───────────────────────
function NotifResultado({ notif }) {
    const isWin  = notif.tipo === 'ganho';
    const res    = notif.resultado;
    const meuUid = notif.meuUid;
    const minha  = res?.vencedores?.find(v => v.uid === meuUid);

    return (
        <div className={`jogo-resultado${isWin ? ' ganho' : ''}`} role="status">
            <div className="titulo">{isWin ? 'Você ganhou' : 'Não foi desta vez'}</div>
            {minha?.mao && <div className="mao">{minha.mao}</div>}
            {minha?.premio > 0 && <div className="premio num">+₿C {fmt(minha.premio)}</div>}
            {!isWin && res?.vencedores?.[0] && (
                <div className="quem">
                    {res.vencedores[0].nome}
                    {res.vencedores[0].mao ? ` — ${res.vencedores[0].mao}` : ''}
                </div>
            )}
        </div>
    );
}
