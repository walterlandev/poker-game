/* ================================================================
   ARQUIVO: frontend/src/pages/Campeonato/index.jsx

   Lobby de torneios — inclui:
     • Link de convite compartilhável via URL ?torneio=ID
     • Fichas iniciais separadas da taxa de buy-in
     • Rebuy (re-entrada) durante o período configurado
================================================================ */

import { useState, useEffect } from 'react';
import Icone from '../../components/Icone';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

export default function Campeonato({ usuario, socket, onEntrarMesa, conviteTorneio }) {

    const [torneios,     setTorneios    ] = useState([]);
    const [torneioAtual, setTorneioAtual] = useState(null);
    const [modalCriar,   setModalCriar  ] = useState(false);
    const [carregando,   setCarregando  ] = useState(false);
    const [rebuyEnviando, setRebuyEnviando] = useState(false);
    const [erro,         setErro        ] = useState(null);
    const [rebuyInfo,    setRebuyInfo   ] = useState(null);  // modal rebuy


    // ----------------------------------------------------------------
    // Socket
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        const onLista    = (lista) => setTorneios(lista || []);
        const onAtualiza = (lista) => setTorneios(lista || []);

        const onEstado = (estado) => {
            setTorneioAtual(estado);

            if (estado.rodadaInfo && estado.status === 'em_andamento') {
                const meuUid = usuario?.uid;
                const minhasMesas = estado.rodadaInfo.mesas?.filter(m =>
                    m.jogadores?.includes(meuUid) && !m.vencedor
                ) || [];
                if (minhasMesas.length > 0) onEntrarMesa?.(minhasMesas[0].mesaId);
            }
        };

        const onRebuyDisponivel = (dados) => {
            if (dados.elegiveisUids?.includes(usuario?.uid)) setRebuyInfo(dados);
        };

        const onRebuyConfirmado = () => { setRebuyInfo(null); setRebuyEnviando(false); };
        // Torneio cancelado por falta de jogadores: volta para a lista de torneios
        // (a mensagem é mostrada pelo App, em qualquer tela)
        const onCancelado = () => { setTorneioAtual(null); setRebuyInfo(null); };

        const onCriado = ({ torneioId }) => {
            socket.emit('pedir_estado_torneio', { torneioId });
        };
        const onEntrou = ({ torneioId }) => {
            socket.emit('pedir_estado_torneio', { torneioId });
        };

        socket.on('torneios_lista',           onLista);
        socket.on('torneios_atualizados',     onAtualiza);
        socket.on('torneio:estado',           onEstado);
        socket.on('torneio:rebuy_disponivel', onRebuyDisponivel);
        socket.on('torneio:rebuy_confirmado', onRebuyConfirmado);
        socket.on('torneio:criado',           onCriado);
        socket.on('torneio:entrou',           onEntrou);
        socket.on('torneio:cancelado_sem_jogadores', onCancelado);

        socket.emit('listar_torneios');

        return () => {
            socket.off('torneios_lista',           onLista);
            socket.off('torneios_atualizados',     onAtualiza);
            socket.off('torneio:estado',           onEstado);
            socket.off('torneio:rebuy_disponivel', onRebuyDisponivel);
            socket.off('torneio:rebuy_confirmado', onRebuyConfirmado);
            socket.off('torneio:criado',           onCriado);
            socket.off('torneio:entrou',           onEntrou);
            socket.off('torneio:cancelado_sem_jogadores', onCancelado);
        };
    }, [socket, usuario, onEntrarMesa]);

    // Auto-entrar se veio por link de convite
    useEffect(() => {
        if (!conviteTorneio || !socket) return;
        // Pequeno delay para socket estar autenticado
        const t = setTimeout(() => handleEntrar(conviteTorneio), 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conviteTorneio, socket]);


    // ----------------------------------------------------------------
    // Handlers
    // ----------------------------------------------------------------
    function handleEntrar(torneioId) {
        if (!socket || carregando) return;
        setErro(null);
        setCarregando(true);
        socket.emit('entrar_torneio', { torneioId });

        function onErro({ mensagem }) { setErro(mensagem); cleanup(); }
        function cleanup() { setCarregando(false); socket.off('erro', onErro); }
        socket.once('erro', onErro);
        setTimeout(cleanup, 8000);
    }

    function handleIniciar() {
        if (!torneioAtual) return;
        socket.emit('iniciar_torneio', { torneioId: torneioAtual.id });
    }

    function handleRebuy() {
        if (!rebuyInfo || !socket || rebuyEnviando) return;
        setRebuyEnviando(true);
        setTimeout(() => setRebuyEnviando(false), 8000);
        socket.emit('torneio_rebuy', { torneioId: rebuyInfo.torneioId });
    }

    const meuUid         = usuario?.uid;
    const estouNoTorneio = torneioAtual && torneioAtual.jogadores?.[meuUid];
    const souHost        = torneioAtual?.host === meuUid;
    const meuStatus      = torneioAtual?.jogadores?.[meuUid]?.status;
    const meusRebuys     = torneioAtual?.jogadores?.[meuUid]?.rebuys || 0;

    const possoRebuy = torneioAtual?.rebuyAtivo
        && (meuStatus === 'rebuy_disponivel' || meuStatus === 'eliminado')
        && meusRebuys < (torneioAtual?.maxRebuys || 0);


    // ================================================================
    // RENDER
    // ================================================================

    return (
        <div style={css.container}>

            {erro && (
                <div style={css.erro} onClick={() => setErro(null)}>{erro}</div>
            )}

            {/* Modal de rebuy */}
            {rebuyInfo && (
                <ModalRebuy
                    info={rebuyInfo}
                    usuario={usuario}
                    onRebuy={handleRebuy}
                    onRecusar={() => setRebuyInfo(null)}
                />
            )}

            {/* Torneio atual do jogador */}
            {torneioAtual && estouNoTorneio && (
                <EstadoTorneio
                    torneio={torneioAtual}
                    meuUid={meuUid}
                    souHost={souHost}
                    possoRebuy={possoRebuy}
                    onIniciar={handleIniciar}
                    onRebuy={handleRebuy}
                />
            )}

            {/* Lista de torneios abertos */}
            <div style={css.secao}>
                <div style={css.secaoHeader}>
                    <span style={css.secaoTitulo}>Torneios Abertos</span>
                    <button style={css.btnAtualizar} onClick={() => socket?.emit('listar_torneios')}>
                        Atualizar
                    </button>
                </div>

                {torneios.length === 0 ? (
                    <div style={css.vazio}>
                        <span style={{ fontSize:'32px' }}>🏆</span>
                        <p style={css.vazioTxt}>Nenhum torneio aberto no momento.</p>
                        <p style={css.vazioSub}>Crie o primeiro!</p>
                    </div>
                ) : (
                    <div style={css.lista}>
                        {torneios.map(t => (
                            <CardTorneio
                                key={t.id}
                                torneio={t}
                                meuUid={meuUid}
                                jaEstou={torneioAtual?.id === t.id && !!estouNoTorneio}
                                onEntrar={() => handleEntrar(t.id)}
                                carregando={carregando}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Botão criar */}
            <div style={css.rodape}>
                <button style={css.btnCriar} onClick={() => setModalCriar(true)}>
                    <span style={{ fontSize:'20px', lineHeight:1 }}>+</span>
                    Criar Torneio
                </button>
            </div>

            {modalCriar && (
                <ModalCriarTorneio
                    socket={socket}
                    usuario={usuario}
                    onFechar={() => setModalCriar(false)}
                />
            )}

        </div>
    );
}


// ================================================================
// ESTADO DO TORNEIO ATUAL
// ================================================================

function EstadoTorneio({ torneio, meuUid, souHost, possoRebuy, onIniciar, onRebuy }) {
    const [copiado, setCopiado] = useState(false);

    const totalJogadores = Object.keys(torneio.jogadores || {}).length;
    const minhaEntrada   = torneio.jogadores?.[meuUid];

    const statusCor = {
        aberto:       'var(--cor-destaque-texto)',
        em_andamento: 'var(--cor-positivo-texto)',
        finalizado:   'var(--cor-destaque-texto)',
    }[torneio.status] || '#fff';

    const statusLabel = {
        aberto:       'Aberto',
        em_andamento: 'Em Andamento',
        finalizado:   'Finalizado',
    }[torneio.status] || torneio.status;

    function copiarLink() {
        const url = `${window.location.origin}${window.location.pathname}?torneio=${torneio.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        });
    }

    return (
        <div style={css.torneioAtual}>
            <div style={css.torneioAtualHeader}>
                <span style={{ fontSize:'18px' }}>🏆</span>
                <span style={css.torneioNome}>{torneio.nome}<EtiquetaMoeda moeda={torneio?.moeda} /></span>
                <span style={{ ...css.statusBadge, color: statusCor, borderColor: statusCor }}>
                    {statusLabel}
                </span>
            </div>

            {/* Link de convite — só enquanto torneio está aberto */}
            {torneio.status === 'aberto' && (
                <div style={css.conviteRow}>
                    <div style={{ flex:1 }}>
                        <span style={{ fontSize:'10px', color:'var(--cor-texto-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                            Código de convite
                        </span>
                        <div style={{ fontSize:'14px', fontFamily:'monospace', color:'var(--cor-destaque-texto)', fontWeight:700 }}>
                            {torneio.id}
                        </div>
                    </div>
                    <button
                        style={{
                            ...css.btnCompartilhar,
                            background: copiado ? 'var(--cor-positivo-suave)' : 'var(--cor-destaque-suave)',
                            borderColor: copiado ? 'var(--cor-positivo)' : 'var(--cor-destaque-linha)',
                            color: copiado ? 'var(--cor-positivo-texto)' : 'var(--cor-destaque-texto)',
                        }}
                        onClick={copiarLink}
                    >
                        {copiado ? '✓ Copiado!' : '🔗 Compartilhar'}
                    </button>
                </div>
            )}

            <div style={css.torneioStats}>
                <Stat label="Jogadores" valor={`${totalJogadores}/${torneio.maxJogadores}`} />
                <Stat label="Buy-In"    valor={`₿C ${fmt(torneio.buyIn)}`} />
                <Stat label="Fichas"    valor={fmt(torneio.fichasIniciais)} corValor="var(--cor-positivo-texto)" />
                <Stat label="Por Mesa"  valor={torneio.jogadoresPorMesa} />
                {torneio.rodadaAtual > 0 && <Stat label="Rodada" valor={torneio.rodadaAtual + 1} />}
                {torneio.rebuyAtivo && (
                    <Stat label="Rebuy" valor={`${torneio.rebuyMinRestantes}min`} corValor="var(--cor-perigo-texto)" />
                )}
            </div>

            {/* Minha situação */}
            {minhaEntrada && (
                <div style={{
                    ...css.minhaSituacao,
                    background:  minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel'
                        ? 'var(--cor-perigo-suave)' : 'var(--cor-positivo-suave)',
                    borderColor: minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel'
                        ? 'var(--cor-perigo-linha)' : 'var(--cor-positivo-suave)',
                }}>
                    <span style={{
                        fontSize:'11px', fontWeight:600, flex:1,
                        color: (minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel')
                            ? 'var(--cor-perigo-texto)' : 'var(--cor-positivo-texto)',
                    }}>
                        {minhaEntrada.status === 'eliminado'         ? '❌ Você foi eliminado'
                         : minhaEntrada.status === 'rebuy_disponivel' ? '⚡ Rebuy disponível!'
                         : minhaEntrada.status === 'rebuy_pago'       ? '✅ Rebuy confirmado — aguardando próxima rodada'
                         : minhaEntrada.status === 'vencedor'         ? '🏆 Você é o campeão!'
                         : minhaEntrada.status === 'jogando'          ? '🃏 Você está jogando'
                         : '⏳ Aguardando início'}
                    </span>
                    {minhaEntrada.rebuys > 0 && (
                        <span style={{ fontSize:'10px', color:'var(--cor-texto-3)' }}>
                            {minhaEntrada.rebuys}× rebuy
                        </span>
                    )}
                </div>
            )}

            {/* Botão rebuy via lobby */}
            {possoRebuy && (
                <button style={css.btnRebuy} onClick={onRebuy}>
                    🔄 Fazer Rebuy — custo ₿C {fmt(torneio.buyIn)} → +{fmt(torneio.fichasIniciais)} fichas
                </button>
            )}

            {/* Aviso de janela de rebuy aberta */}
            {torneio.aguardandoRebuys && (
                <div style={css.avisoRebuy}>
                    ⏳ Aguardando decisões de rebuy (60s) antes de iniciar a próxima rodada...
                </div>
            )}

            {torneio.campeao && (
                <div style={css.campeao}>
                    🏆 Campeão: <strong>{torneio.jogadores?.[torneio.campeao]?.nome || torneio.campeao}</strong>
                    {torneio.premioTotal > 0 && (
                        <span> — levou o prêmio de <strong>₿C {fmt(torneio.premioTotal)}</strong></span>
                    )}
                </div>
            )}

            {/* Botão iniciar (host) */}
            {souHost && torneio.status === 'aberto' && (
                <button
                    style={{ ...css.btnIniciar, opacity: totalJogadores < 2 ? 0.5 : 1 }}
                    disabled={totalJogadores < 2}
                    onClick={onIniciar}
                >
                    {totalJogadores < 2
                        ? `Aguardando jogadores (${totalJogadores}/2)`
                        : `▶ Iniciar Torneio  (${totalJogadores} jogadores)`}
                </button>
            )}

            {/* Lista de jogadores */}
            {totalJogadores > 0 && (
                <div style={css.jogadoresList}>
                    {Object.values(torneio.jogadores).map(j => (
                        <div key={j.uid} style={css.jogadorItem}>
                            {j.avatar
                                ? <img src={j.avatar} alt={j.nome} style={{ width:'22px', height:'22px', borderRadius:'50%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                                : <span style={{ fontSize:'18px' }}>{j.uid?.startsWith('bot_') ? '🤖' : '🧑'}</span>
                            }
                            <span style={{
                                fontSize:   '12px',
                                color:      j.uid === meuUid ? 'var(--cor-destaque-texto)' : 'var(--cor-texto)',
                                fontWeight: j.uid === meuUid ? 700 : 400,
                                flex:       1,
                            }}>
                                {j.nome}
                                {j.rebuys > 0 && (
                                    <span style={{ fontSize:'9px', color:'var(--cor-perigo-texto)', marginLeft:'4px' }}>
                                        ({j.rebuys}R)
                                    </span>
                                )}
                            </span>
                            <span style={{
                                fontSize:'10px',
                                color: {
                                    vencedor:          'var(--cor-destaque-texto)',
                                    eliminado:         'var(--cor-perigo-texto)',
                                    jogando:           'var(--cor-positivo-texto)',
                                    rebuy_disponivel:  'var(--cor-perigo-texto)',
                                    rebuy_pago:        '#6EE7B7',
                                    aguardando:        'var(--cor-texto-3)',
                                }[j.status] || 'var(--cor-texto-3)',
                            }}>
                                {j.status?.replace('_', ' ')}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


// ================================================================
// MODAL REBUY — popup automático quando jogador é eliminado
// ================================================================

function ModalRebuy({ info, usuario, onRebuy, onRecusar }) {
    const [seg, setSeg] = useState(60);

    useEffect(() => {
        const t = setInterval(() => {
            setSeg(s => {
                if (s <= 1) { clearInterval(t); onRecusar(); return 0; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [onRecusar]);

    return (
        <div style={cssModal.overlay}>
            <div style={{ ...cssModal.caixa, border:'1px solid var(--cor-perigo-linha)' }}>
                <div style={{ textAlign:'center', fontSize:'32px' }}>💥</div>
                <p style={{ margin:0, fontWeight:700, fontSize:'16px', textAlign:'center', color:'var(--cor-texto)' }}>
                    Você foi eliminado!
                </p>
                <p style={{ margin:0, fontSize:'13px', color:'var(--cor-texto-2)', textAlign:'center' }}>
                    Quer fazer rebuy e continuar no torneio?
                </p>

                <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
                    <StatRebuy label="Custo"  valor={`₿C ${fmt(info.custo)}`} />
                    <StatRebuy label="Fichas" valor={`+${fmt(info.fichasGanhas)}`} />
                    <StatRebuy label="Saldo"  valor={`₿C ${fmt(usuario?.saldo)}`} />
                    <StatRebuy label="Período restante" valor={`${info.periodoRestante}min`} />
                </div>

                <div style={{ textAlign:'center', fontSize:'12px', color:'var(--cor-texto-3)' }}>
                    Tempo para decidir: <b style={{ color:'var(--cor-perigo-texto)' }}>{seg}s</b>
                </div>

                <div style={{ display:'flex', gap:'10px' }}>
                    <button style={cssModal.btnRebuyConfirmar} onClick={onRebuy}>
                        🔄 Fazer Rebuy
                    </button>
                    <button style={cssModal.btnRebuyRecusar} onClick={onRecusar}>
                        Não, obrigado
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatRebuy({ label, valor }) {
    return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', background:'var(--cor-superficie)', borderRadius:'8px', padding:'8px 14px', gap:'2px' }}>
            <span style={{ fontSize:'10px', color:'var(--cor-texto-3)', textTransform:'uppercase' }}>{label}</span>
            <span style={{ fontSize:'14px', fontWeight:700, color:'var(--cor-texto)' }}>{valor}</span>
        </div>
    );
}


// ================================================================
// CARD DE TORNEIO
// ================================================================

function CardTorneio({ torneio, jaEstou, onEntrar, carregando }) {
    const cheio = torneio.totalJogadores >= torneio.maxJogadores;

    return (
        <div style={css.card}>
            <div style={css.cardHeader}>
                <span style={{ fontSize:'16px' }}>🏆</span>
                <span style={css.cardNome}>{torneio.nome}<EtiquetaMoeda moeda={torneio?.moeda} /></span>
                <span style={{ ...css.statusBadge, color:'var(--cor-destaque-texto)', borderColor:'var(--cor-destaque-texto)', fontSize:'9px' }}>
                    {torneio.totalJogadores}/{torneio.maxJogadores}
                </span>
            </div>

            <div style={css.cardStats}>
                <span style={css.cardStat}>Buy-In: <b style={{ color:'var(--cor-destaque-texto)' }}>₿C {fmt(torneio.buyIn)}</b></span>
                <span style={css.cardStat}>Fichas: <b style={{ color:'var(--cor-positivo-texto)' }}>{fmt(torneio.fichasIniciais)}</b></span>
                <span style={css.cardStat}>Por mesa: <b style={{ color:'var(--cor-destaque-texto)' }}>{torneio.jogadoresPorMesa}</b></span>
                {torneio.maxRebuys > 0 && (
                    <span style={css.cardStat}>Rebuy: <b style={{ color:'var(--cor-perigo-texto)' }}>{torneio.maxRebuys}×</b></span>
                )}
            </div>

            <button
                style={{
                    ...css.btnEntrar,
                    opacity:    (carregando || jaEstou || cheio) ? 0.6 : 1,
                    cursor:     (carregando || jaEstou || cheio) ? 'not-allowed' : 'pointer',
                    background: jaEstou ? 'var(--cor-positivo-suave)' : 'var(--cor-destaque)',
                    border:     jaEstou ? '1px solid var(--cor-positivo)' : 'none',
                    color:      jaEstou ? 'var(--cor-positivo-texto)' : '#fff',
                }}
                disabled={carregando || jaEstou || cheio}
                onClick={onEntrar}
            >
                {jaEstou ? '✓ Inscrito' : cheio ? 'Lotado' : 'Entrar'}
            </button>
        </div>
    );
}

function Stat({ label, valor, corValor }) {
    return (
        <div style={css.stat}>
            <span style={css.statLabel}>{label}</span>
            <span style={{ ...css.statValor, color: corValor || 'var(--cor-texto)' }}>{valor}</span>
        </div>
    );
}


// ================================================================
// MODAL CRIAR TORNEIO
// ================================================================

function ModalCriarTorneio({ socket, usuario, onFechar }) {
    const [nome,             setNome            ] = useState(`Torneio de ${usuario?.nome?.split(' ')[0] || 'Jogador'}`);
    const [buyIn,            setBuyIn           ] = useState(500);
    const [fichasIniciais,   setFichasIniciais  ] = useState(10000);
    const [maxJogadores,     setMaxJogadores    ] = useState(16);
    const [jogadoresPorMesa, setJogadoresPorMesa] = useState(4);
    const [maxRebuys,        setMaxRebuys       ] = useState(1);
    const [rebuyPeriod,      setRebuyPeriod     ] = useState(30);
    const [enviando,         setEnviando        ] = useState(false);
    const [erro,             setErro            ] = useState(null);
    // Moeda do torneio: 'real' (padrão) ou 'bonus'
    const [moeda,            setMoeda           ] = useState('real');

    function handleBuyIn(v) {
        setBuyIn(v);
        setFichasIniciais(v * 20);
    }

    function handleCriar() {
        if (!socket) return;
        if (!nome.trim()) { setErro('Informe um nome para o torneio.'); return; }
        setEnviando(true);
        setErro(null);

        socket.emit('criar_torneio', {
            nome: nome.trim(),
            buyIn,
            fichasIniciais,
            maxJogadores,
            jogadoresPorMesa,
            maxRebuys,
            rebuyPeriod,
            moeda,
        });

        function onCriado() { cleanup(); onFechar(); }
        function onErro({ mensagem }) { setErro(mensagem); cleanup(); }
        function cleanup() {
            setEnviando(false);
            socket.off('torneio:criado', onCriado);
            socket.off('erro',           onErro);
        }
        socket.once('torneio:criado', onCriado);
        socket.once('erro',           onErro);
        setTimeout(cleanup, 10000);
    }

    const ehBonus    = moeda === 'bonus';
    const saldoMoeda = ehBonus ? (usuario?.saldoBonus || 0) : (usuario?.saldo || 0);
    const semSaldo   = saldoMoeda < buyIn;   // só visual; o servidor decide

    return (
        <>
            <div className="modal-veu" onClick={() => !enviando && onFechar()} />
            <div className="modal modal-largo" role="dialog" aria-modal="true" aria-labelledby="ct-titulo">
                <div className="modal-cab">
                    <div className="esq"><h2 id="ct-titulo">Criar torneio</h2></div>
                    <button type="button" onClick={onFechar} className="modal-icone-btn" aria-label="Fechar" disabled={enviando}>
                        <Icone nome="fechar" />
                    </button>
                </div>

                <div className="modal-corpo cm">
                    <fieldset className="cm-grupo">
                        <legend className="cart-campo-rot">Moeda do torneio</legend>
                        <div className="cm-moedas" role="radiogroup" aria-label="Moeda do torneio">
                            <button type="button" role="radio" aria-checked={!ehBonus} className="cm-moeda" onClick={() => setMoeda('real')}>
                                <span className="t">Real</span>
                                <span className="s">Buy-in, rebuy e prêmio em saldo real</span>
                                <span className="v num">Você tem ₿C {fmt(usuario?.saldo || 0)}</span>
                            </button>
                            <button type="button" role="radio" aria-checked={ehBonus} className="cm-moeda" onClick={() => setMoeda('bonus')}>
                                <span className="t">Bônus</span>
                                <span className="s">Buy-in, rebuy e prêmio em bônus</span>
                                <span className="v num">Você tem ₿C {fmt(usuario?.saldoBonus || 0)}</span>
                            </button>
                        </div>
                    </fieldset>

                    <label className="cart-campo-rot" htmlFor="ct-nome">Nome do torneio</label>
                    <div className="cart-campo">
                        <input id="ct-nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={40} placeholder="Ex.: Torneio de sexta…" autoComplete="off" />
                    </div>

                    <span className="cart-campo-rot">Buy-in em ₿C de {ehBonus ? 'bônus' : 'saldo real'}</span>
                    <div className="cart-atalhos" role="group" aria-label="Buy-in">
                        {[200, 500, 1000, 2000, 5000].map(v => (
                            <button key={v} type="button" className="cart-chip num" aria-pressed={buyIn === v} onClick={() => handleBuyIn(v)}>
                                ₿C {fmt(v)}
                            </button>
                        ))}
                    </div>

                    <FaixaTorneio id="ct-fichas" rotulo="Fichas por jogador" valor={fmt(fichasIniciais)} min={1000} max={200000} step={1000}
                        atual={fichasIniciais} onChange={setFichasIniciais} esq="1.000" dir="200.000" />
                    <p className="cart-nota">O mesmo stack para todos ao iniciar.</p>
                    <FaixaTorneio id="ct-max" rotulo="Máximo de jogadores" valor={maxJogadores} min={4} max={64} step={4}
                        atual={maxJogadores} onChange={setMaxJogadores} esq="4" dir="64" />
                    <FaixaTorneio id="ct-mesa" rotulo="Jogadores por mesa" valor={jogadoresPorMesa} min={2} max={9} step={1}
                        atual={jogadoresPorMesa} onChange={setJogadoresPorMesa} esq="2" dir="9" />
                    <FaixaTorneio id="ct-rebuys" rotulo="Rebuys por jogador" valor={maxRebuys === 0 ? 'desativado' : `${maxRebuys}×`} min={0} max={5} step={1}
                        atual={maxRebuys} onChange={setMaxRebuys} esq="0" dir="5" />
                    {maxRebuys > 0 && (
                        <FaixaTorneio id="ct-periodo" rotulo="Janela de rebuy" valor={`${rebuyPeriod} min`} min={10} max={120} step={10}
                            atual={rebuyPeriod} onChange={setRebuyPeriod} esq="10 min" dir="2 h" />
                    )}
                    <p className="cart-nota">O rebuy deixa quem foi eliminado pagar o buy-in de novo e voltar na rodada seguinte.</p>

                    <dl className="cart-resumo">
                        <div className="cart-resumo-linha"><dt>Seu {ehBonus ? 'bônus' : 'saldo real'}</dt><dd className="num">₿C {fmt(saldoMoeda)}</dd></div>
                        <div className="cart-resumo-linha"><dt>Buy-in</dt><dd className="num">₿C {fmt(buyIn)}</dd></div>
                        <div className="cart-resumo-linha"><dt>Fichas por jogador</dt><dd className="num">{fmt(fichasIniciais)}</dd></div>
                    </dl>

                    {erro && <p className="cart-erro" role="alert">{erro}</p>}
                </div>

                <div className="modal-rodape">
                    <button type="button" className="btn btn-principal cart-btn-cheio" disabled={enviando || semSaldo} aria-busy={enviando || undefined} onClick={handleCriar}>
                        {enviando ? 'Criando torneio…' : semSaldo ? `Falta ${ehBonus ? 'bônus' : 'saldo real'} para o buy-in` : `Criar torneio de ${ehBonus ? 'bônus' : 'saldo real'}`}
                    </button>
                </div>
            </div>
        </>
    );
}

function FaixaTorneio({ id, rotulo, valor, min, max, step, atual, onChange, esq, dir }) {
    return (
        <>
            <label className="cart-campo-rot" htmlFor={id}>{rotulo} <span className="cm-dica num">{valor}</span></label>
            <div className="cm-slider">
                <span className="num">{esq}</span>
                <input id={id} type="range" min={min} max={max} step={step} value={atual} onChange={e => onChange(Number(e.target.value))} />
                <span className="num">{dir}</span>
            </div>
        </>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const css = {
    container: { display:'flex', flexDirection:'column', gap:'16px', paddingBottom:'80px' },
    erro: {
        background:'var(--cor-perigo-suave)', border:'1px solid var(--cor-perigo-linha)',
        borderRadius:'10px', padding:'10px 14px', fontSize:'13px', color:'var(--cor-perigo-texto)', cursor:'pointer',
    },
    secao:       { display:'flex', flexDirection:'column', gap:'10px' },
    secaoHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
    secaoTitulo: { fontSize:'14px', fontWeight:600, color:'var(--cor-texto)' },
    btnAtualizar: {
        background:'transparent', border:'1px solid var(--cor-linha)',
        borderRadius:'6px', color:'var(--cor-texto-3)',
        fontSize:'11px', padding:'4px 10px', cursor:'pointer', fontFamily:'inherit',
    },
    lista: { display:'flex', flexDirection:'column', gap:'8px' },
    vazio: {
        display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
        padding:'32px 16px',
        background:'var(--cor-hover-linha)', border:'1px dashed var(--cor-linha)', borderRadius:'12px',
    },
    vazioTxt: { color:'var(--cor-texto-3)', margin:0, fontSize:'13px' },
    vazioSub: { color:'var(--cor-linha-forte)', margin:0, fontSize:'11px' },
    rodape: {
        position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:'480px',
        padding:'10px 14px max(14px, env(safe-area-inset-bottom))',
        background:'var(--cor-superficie)', zIndex:100, boxSizing:'border-box',
    },
    btnCriar: {
        width:'100%', padding:'14px',
        background:'var(--cor-destaque)',
        border:'none', borderRadius:'12px', color:'var(--cor-texto-inverso)', fontSize:'16px', fontWeight:600,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent',
    },
    card: {
        background:'var(--cor-superficie)', border:'1px solid var(--cor-linha)',
        borderRadius:'12px', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px',
    },
    cardHeader: { display:'flex', alignItems:'center', gap:'8px' },
    cardNome: {
        fontSize:'13px', fontWeight:600, color:'var(--cor-texto)', flex:1,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
    },
    cardStats: { display:'flex', gap:'10px', flexWrap:'wrap' },
    cardStat:  { fontSize:'11px', color:'var(--cor-texto-3)' },
    statusBadge: {
        fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'10px',
        border:'1px solid', whiteSpace:'nowrap', flexShrink:0,
    },
    btnEntrar: {
        padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:600,
        fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent', alignSelf:'flex-start',
    },
    torneioAtual: {
        background:'var(--cor-destaque-suave)', border:'1px solid var(--cor-destaque-suave)',
        borderRadius:'14px', padding:'14px', display:'flex', flexDirection:'column', gap:'10px',
    },
    torneioAtualHeader: { display:'flex', alignItems:'center', gap:'8px' },
    torneioNome: { fontSize:'14px', fontWeight:700, color:'var(--cor-texto)', flex:1 },
    torneioStats: { display:'flex', gap:'8px', flexWrap:'wrap' },
    stat: {
        display:'flex', flexDirection:'column', alignItems:'center',
        background:'var(--cor-superficie)', border:'1px solid var(--cor-superficie)',
        borderRadius:'8px', padding:'5px 10px', minWidth:'56px',
    },
    statLabel: { fontSize:'9px', color:'var(--cor-texto-3)', textTransform:'uppercase', letterSpacing:'0.06em' },
    statValor: { fontSize:'13px', fontWeight:700 },
    minhaSituacao: {
        padding:'7px 12px', borderRadius:'8px', border:'1px solid', display:'flex', alignItems:'center', gap:'8px',
    },
    campeao: {
        background:'var(--cor-destaque-suave)', border:'1px solid var(--cor-destaque-linha)',
        borderRadius:'8px', padding:'7px 12px', fontSize:'13px', color:'#FDE68A', textAlign:'center',
    },
    btnIniciar: {
        padding:'12px', background:'var(--cor-positivo)',
        border:'none', borderRadius:'10px', color:'var(--cor-sobre-positivo)', fontSize:'14px', fontWeight:700,
        cursor:'pointer', fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent',
    },
    btnRebuy: {
        padding:'12px', background:'var(--cor-perigo)',
        border:'none', borderRadius:'10px', color:'var(--cor-sobre-positivo)', fontSize:'13px', fontWeight:700,
        cursor:'pointer', fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent',
    },
    avisoRebuy: {
        background:'var(--cor-perigo-suave)', border:'1px solid var(--cor-perigo-linha)',
        borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'var(--cor-perigo-texto)', textAlign:'center',
    },
    jogadoresList: { display:'flex', flexDirection:'column', gap:'4px', maxHeight:'200px', overflowY:'auto' },
    jogadorItem: {
        display:'flex', alignItems:'center', gap:'8px',
        padding:'4px 0', borderBottom:'1px solid var(--cor-superficie)',
    },
    conviteRow: {
        display:'flex', alignItems:'center', gap:'10px',
        background:'var(--cor-superficie)', border:'1px solid var(--cor-linha)',
        borderRadius:'10px', padding:'10px 14px',
    },
    btnCompartilhar: {
        border:'1px solid', borderRadius:'8px', padding:'6px 12px',
        fontSize:'12px', fontWeight:700, cursor:'pointer',
        fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent', whiteSpace:'nowrap',
    },
};

const cssModal = {
    overlay: {
        position:'fixed', inset:0, background:'rgba(5,8,16,0.80)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        zIndex:500, backdropFilter:'blur(4px)',
    },
    caixa: {
        background:'var(--cor-superficie)', border:'1px solid var(--cor-destaque-suave)',
        borderRadius:'20px 20px 0 0',
        padding:'20px 16px max(20px, env(safe-area-inset-bottom))',
        width:'100%', maxWidth:'480px', display:'flex', flexDirection:'column', gap:'14px',
        maxHeight:'90vh', overflowY:'auto', fontFamily:'var(--fonte)', color:'var(--cor-texto)',
    },
    header: { display:'flex', alignItems:'center', justifyContent:'space-between' },
    titulo: { fontSize:'16px', fontWeight:700, color:'var(--cor-texto)' },
    btnFechar: {
        background:'transparent', border:'none', color:'var(--cor-texto-3)',
        fontSize:'18px', cursor:'pointer', padding:'4px 8px', fontFamily:'inherit',
    },
    erro: {
        background:'var(--cor-perigo-suave)', border:'1px solid var(--cor-perigo-linha)',
        borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'var(--cor-perigo-texto)',
    },
    campo: { display:'flex', flexDirection:'column', gap:'6px' },
    label: {
        fontSize:'12px', fontWeight:600, color:'var(--cor-texto-2)',
        textTransform:'uppercase', letterSpacing:'0.05em',
    },
    input: {
        background:'var(--cor-superficie)', border:'1px solid var(--cor-linha)',
        borderRadius:'8px', padding:'10px 12px', color:'var(--cor-texto)',
        fontSize:'14px', fontFamily:'var(--fonte)', outline:'none',
    },
    opcoes: { display:'flex', gap:'6px', flexWrap:'wrap' },
    btnOpcao: {
        flex:'1 1 50px', padding:'8px 4px', borderRadius:'8px', border:'1px solid',
        fontSize:'12px', fontWeight:600, cursor:'pointer',
        fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent',
    },
    hint: { fontSize:'10px', color:'var(--cor-texto-3)', margin:0 },
    slider: { width:'100%', cursor:'pointer' },
    sliderLabels: { display:'flex', justifyContent:'space-between', fontSize:'10px', color:'var(--cor-texto-3)' },
    resumo: {
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'6px',
        background:'var(--cor-superficie)', border:'1px solid var(--cor-superficie)',
        borderRadius:'8px', padding:'10px 12px', fontSize:'13px', color:'var(--cor-texto)',
    },
    btnCriar: {
        padding:'14px', background:'var(--cor-destaque)',
        border:'none', borderRadius:'12px', color:'var(--cor-texto-inverso)', fontSize:'15px', fontWeight:700,
        cursor:'pointer', fontFamily:'var(--fonte)', WebkitTapHighlightColor:'transparent',
    },
    secaoRebuy: {
        display:'flex', flexDirection:'column', gap:'10px',
        background:'var(--cor-perigo-suave)', border:'1px solid var(--cor-perigo-suave)',
        borderRadius:'10px', padding:'12px',
    },
    btnRebuyConfirmar: {
        flex:1, padding:'12px', background:'var(--cor-perigo)',
        border:'none', borderRadius:'10px', color:'var(--cor-sobre-perigo)', fontSize:'14px', fontWeight:700,
        cursor:'pointer', fontFamily:'var(--fonte)',
    },
    btnRebuyRecusar: {
        flex:1, padding:'12px',
        background:'var(--cor-superficie)', border:'1px solid var(--cor-linha)',
        borderRadius:'10px', color:'var(--cor-texto-2)',
        fontSize:'13px', cursor:'pointer', fontFamily:'var(--fonte)',
    },
};


// Moeda do torneio ('real' | 'bonus'); servidor antigo sem o campo = real
function EtiquetaMoeda({ moeda }) {
    const m = moeda ?? 'real';
    return <span className={`etiqueta-moeda ${m}`}>{m === 'bonus' ? 'Bônus' : 'Real'}</span>;
}
