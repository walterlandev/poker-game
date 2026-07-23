/* ================================================================
   ARQUIVO: frontend/src/pages/Campeonato/index.jsx

   Lobby de torneios — inclui:
     • Link de convite compartilhável via URL ?torneio=ID
     • Fichas iniciais separadas da taxa de buy-in
     • Rebuy (re-entrada) durante o período configurado
================================================================ */

import { useState, useEffect } from 'react';

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

export default function Campeonato({ usuario, socket, onEntrarMesa, conviteTorneio }) {

    const [torneios,     setTorneios    ] = useState([]);
    const [torneioAtual, setTorneioAtual] = useState(null);
    const [modalCriar,   setModalCriar  ] = useState(false);
    const [carregando,   setCarregando  ] = useState(false);
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

        const onRebuyConfirmado = () => setRebuyInfo(null);

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

        socket.emit('listar_torneios');

        return () => {
            socket.off('torneios_lista',           onLista);
            socket.off('torneios_atualizados',     onAtualiza);
            socket.off('torneio:estado',           onEstado);
            socket.off('torneio:rebuy_disponivel', onRebuyDisponivel);
            socket.off('torneio:rebuy_confirmado', onRebuyConfirmado);
            socket.off('torneio:criado',           onCriado);
            socket.off('torneio:entrou',           onEntrou);
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
        if (!socket) return;
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
        if (!rebuyInfo || !socket) return;
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
        aberto:       '#F59E0B',
        em_andamento: '#22C55E',
        finalizado:   '#A78BFA',
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
                <span style={css.torneioNome}>{torneio.nome}</span>
                <span style={{ ...css.statusBadge, color: statusCor, borderColor: statusCor }}>
                    {statusLabel}
                </span>
            </div>

            {/* Link de convite — só enquanto torneio está aberto */}
            {torneio.status === 'aberto' && (
                <div style={css.conviteRow}>
                    <div style={{ flex:1 }}>
                        <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                            Código de convite
                        </span>
                        <div style={{ fontSize:'14px', fontFamily:'monospace', color:'#F59E0B', fontWeight:700 }}>
                            {torneio.id}
                        </div>
                    </div>
                    <button
                        style={{
                            ...css.btnCompartilhar,
                            background: copiado ? 'rgba(34,197,94,0.18)' : 'rgba(124,58,237,0.18)',
                            borderColor: copiado ? 'rgba(34,197,94,0.40)' : 'rgba(124,58,237,0.35)',
                            color: copiado ? '#86EFAC' : '#A78BFA',
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
                <Stat label="Fichas"    valor={fmt(torneio.fichasIniciais)} corValor="#22C55E" />
                <Stat label="Por Mesa"  valor={torneio.jogadoresPorMesa} />
                {torneio.rodadaAtual > 0 && <Stat label="Rodada" valor={torneio.rodadaAtual + 1} />}
                {torneio.rebuyAtivo && (
                    <Stat label="Rebuy" valor={`${torneio.rebuyMinRestantes}min`} corValor="#F87171" />
                )}
            </div>

            {/* Minha situação */}
            {minhaEntrada && (
                <div style={{
                    ...css.minhaSituacao,
                    background:  minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel'
                        ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.08)',
                    borderColor: minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel'
                        ? 'rgba(239,68,68,0.30)' : 'rgba(34,197,94,0.25)',
                }}>
                    <span style={{
                        fontSize:'11px', fontWeight:600, flex:1,
                        color: (minhaEntrada.status === 'eliminado' || minhaEntrada.status === 'rebuy_disponivel')
                            ? '#FCA5A5' : '#86EFAC',
                    }}>
                        {minhaEntrada.status === 'eliminado'         ? '❌ Você foi eliminado'
                         : minhaEntrada.status === 'rebuy_disponivel' ? '⚡ Rebuy disponível!'
                         : minhaEntrada.status === 'rebuy_pago'       ? '✅ Rebuy confirmado — aguardando próxima rodada'
                         : minhaEntrada.status === 'vencedor'         ? '🏆 Você é o campeão!'
                         : minhaEntrada.status === 'jogando'          ? '🃏 Você está jogando'
                         : '⏳ Aguardando início'}
                    </span>
                    {minhaEntrada.rebuys > 0 && (
                        <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)' }}>
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
                                color:      j.uid === meuUid ? '#A78BFA' : '#E2E8F0',
                                fontWeight: j.uid === meuUid ? 700 : 400,
                                flex:       1,
                            }}>
                                {j.nome}
                                {j.rebuys > 0 && (
                                    <span style={{ fontSize:'9px', color:'#F87171', marginLeft:'4px' }}>
                                        ({j.rebuys}R)
                                    </span>
                                )}
                            </span>
                            <span style={{
                                fontSize:'10px',
                                color: {
                                    vencedor:          '#F59E0B',
                                    eliminado:         '#EF4444',
                                    jogando:           '#22C55E',
                                    rebuy_disponivel:  '#F87171',
                                    rebuy_pago:        '#6EE7B7',
                                    aguardando:        'rgba(255,255,255,0.35)',
                                }[j.status] || 'rgba(255,255,255,0.35)',
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
            <div style={{ ...cssModal.caixa, border:'1px solid rgba(248,113,113,0.40)' }}>
                <div style={{ textAlign:'center', fontSize:'32px' }}>💥</div>
                <p style={{ margin:0, fontWeight:700, fontSize:'16px', textAlign:'center', color:'#F8FAFC' }}>
                    Você foi eliminado!
                </p>
                <p style={{ margin:0, fontSize:'13px', color:'rgba(255,255,255,0.55)', textAlign:'center' }}>
                    Quer fazer rebuy e continuar no torneio?
                </p>

                <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
                    <StatRebuy label="Custo"  valor={`₿C ${fmt(info.custo)}`} />
                    <StatRebuy label="Fichas" valor={`+${fmt(info.fichasGanhas)}`} />
                    <StatRebuy label="Saldo"  valor={`₿C ${fmt(usuario?.saldo)}`} />
                    <StatRebuy label="Período restante" valor={`${info.periodoRestante}min`} />
                </div>

                <div style={{ textAlign:'center', fontSize:'12px', color:'rgba(255,255,255,0.40)' }}>
                    Tempo para decidir: <b style={{ color:'#F87171' }}>{seg}s</b>
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
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', background:'rgba(255,255,255,0.05)', borderRadius:'8px', padding:'8px 14px', gap:'2px' }}>
            <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', textTransform:'uppercase' }}>{label}</span>
            <span style={{ fontSize:'14px', fontWeight:700, color:'#F8FAFC' }}>{valor}</span>
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
                <span style={css.cardNome}>{torneio.nome}</span>
                <span style={{ ...css.statusBadge, color:'#F59E0B', borderColor:'#F59E0B', fontSize:'9px' }}>
                    {torneio.totalJogadores}/{torneio.maxJogadores}
                </span>
            </div>

            <div style={css.cardStats}>
                <span style={css.cardStat}>Buy-In: <b style={{ color:'#F59E0B' }}>₿C {fmt(torneio.buyIn)}</b></span>
                <span style={css.cardStat}>Fichas: <b style={{ color:'#22C55E' }}>{fmt(torneio.fichasIniciais)}</b></span>
                <span style={css.cardStat}>Por mesa: <b style={{ color:'#A78BFA' }}>{torneio.jogadoresPorMesa}</b></span>
                {torneio.maxRebuys > 0 && (
                    <span style={css.cardStat}>Rebuy: <b style={{ color:'#F87171' }}>{torneio.maxRebuys}×</b></span>
                )}
            </div>

            <button
                style={{
                    ...css.btnEntrar,
                    opacity:    (carregando || jaEstou || cheio) ? 0.6 : 1,
                    cursor:     (carregando || jaEstou || cheio) ? 'not-allowed' : 'pointer',
                    background: jaEstou ? 'rgba(34,197,94,0.12)' : 'linear-gradient(135deg,#7C3AED,#4F46E5)',
                    border:     jaEstou ? '1px solid rgba(34,197,94,0.35)' : 'none',
                    color:      jaEstou ? '#86EFAC' : '#fff',
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
            <span style={{ ...css.statValor, color: corValor || '#F8FAFC' }}>{valor}</span>
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

    return (
        <div style={cssModal.overlay} onClick={onFechar}>
            <div style={cssModal.caixa} onClick={e => e.stopPropagation()}>

                <div style={cssModal.header}>
                    <span style={cssModal.titulo}>Criar Torneio</span>
                    <button style={cssModal.btnFechar} onClick={onFechar}>✕</button>
                </div>

                {erro && <div style={cssModal.erro}>{erro}</div>}

                <div style={cssModal.campo}>
                    <label style={cssModal.label}>Nome do Torneio</label>
                    <input
                        style={cssModal.input}
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        maxLength={40}
                        placeholder="Ex: Grand Slam Weekly"
                    />
                </div>

                <div style={cssModal.campo}>
                    <label style={cssModal.label}>Buy-In — taxa de entrada (₿C)</label>
                    <div style={cssModal.opcoes}>
                        {[200, 500, 1000, 2000, 5000].map(v => (
                            <button
                                key={v}
                                style={{
                                    ...cssModal.btnOpcao,
                                    background:  buyIn === v ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)',
                                    borderColor: buyIn === v ? 'rgba(245,158,11,0.50)' : 'rgba(255,255,255,0.08)',
                                    color:       buyIn === v ? '#F59E0B' : 'rgba(255,255,255,0.55)',
                                }}
                                onClick={() => handleBuyIn(v)}
                            >
                                {fmt(v)}
                            </button>
                        ))}
                    </div>
                    <p style={cssModal.hint}>Saldo atual: ₿C {fmt(usuario?.saldo)}</p>
                </div>

                <div style={cssModal.campo}>
                    <label style={cssModal.label}>Fichas por jogador: {fmt(fichasIniciais)}</label>
                    <input
                        type="range" min={1000} max={200000} step={1000}
                        value={fichasIniciais}
                        onChange={e => setFichasIniciais(Number(e.target.value))}
                        style={cssModal.slider}
                    />
                    <div style={cssModal.sliderLabels}><span>1.000</span><span>200.000</span></div>
                    <p style={cssModal.hint}>Stack distribuído igualmente a todos ao iniciar</p>
                </div>

                <div style={cssModal.campo}>
                    <label style={cssModal.label}>Máximo de Jogadores: {maxJogadores}</label>
                    <input
                        type="range" min={4} max={64} step={4}
                        value={maxJogadores}
                        onChange={e => setMaxJogadores(Number(e.target.value))}
                        style={cssModal.slider}
                    />
                    <div style={cssModal.sliderLabels}><span>4</span><span>64</span></div>
                </div>

                <div style={cssModal.campo}>
                    <label style={cssModal.label}>Jogadores por Mesa: {jogadoresPorMesa}</label>
                    <input
                        type="range" min={2} max={9} step={1}
                        value={jogadoresPorMesa}
                        onChange={e => setJogadoresPorMesa(Number(e.target.value))}
                        style={cssModal.slider}
                    />
                    <div style={cssModal.sliderLabels}><span>2</span><span>9</span></div>
                </div>

                {/* Rebuy */}
                <div style={cssModal.secaoRebuy}>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#F87171' }}>Regras de Rebuy</span>
                    <p style={cssModal.hint}>Permite que jogadores eliminados paguem o buy-in novamente e re-entrem na próxima rodada</p>

                    <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                        <div style={{ ...cssModal.campo, flex:1 }}>
                            <label style={cssModal.label}>
                                Rebuys máx: {maxRebuys === 0 ? 'Desativado' : maxRebuys}
                            </label>
                            <input
                                type="range" min={0} max={5} step={1}
                                value={maxRebuys}
                                onChange={e => setMaxRebuys(Number(e.target.value))}
                                style={cssModal.slider}
                            />
                            <div style={cssModal.sliderLabels}><span>Off</span><span>5×</span></div>
                        </div>

                        {maxRebuys > 0 && (
                            <div style={{ ...cssModal.campo, flex:1 }}>
                                <label style={cssModal.label}>Período: {rebuyPeriod}min</label>
                                <input
                                    type="range" min={10} max={120} step={10}
                                    value={rebuyPeriod}
                                    onChange={e => setRebuyPeriod(Number(e.target.value))}
                                    style={cssModal.slider}
                                />
                                <div style={cssModal.sliderLabels}><span>10m</span><span>2h</span></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Resumo */}
                <div style={cssModal.resumo}>
                    <span>Buy-In: <b style={{ color:'#F59E0B' }}>₿C {fmt(buyIn)}</b></span>
                    <span>Fichas: <b style={{ color:'#22C55E' }}>{fmt(fichasIniciais)}</b></span>
                    {maxRebuys > 0 && (
                        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.50)' }}>
                            Rebuy: {maxRebuys}× / {rebuyPeriod}min
                        </span>
                    )}
                </div>

                <button
                    style={{ ...cssModal.btnCriar, opacity: enviando ? 0.6 : 1 }}
                    disabled={enviando}
                    onClick={handleCriar}
                >
                    {enviando ? 'Criando...' : 'Criar Torneio'}
                </button>

            </div>
        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const css = {
    container: { display:'flex', flexDirection:'column', gap:'16px', paddingBottom:'80px' },
    erro: {
        background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.35)',
        borderRadius:'10px', padding:'10px 14px', fontSize:'13px', color:'#FCA5A5', cursor:'pointer',
    },
    secao:       { display:'flex', flexDirection:'column', gap:'10px' },
    secaoHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
    secaoTitulo: { fontSize:'14px', fontWeight:600, color:'#F8FAFC' },
    btnAtualizar: {
        background:'transparent', border:'1px solid rgba(255,255,255,0.12)',
        borderRadius:'6px', color:'rgba(255,255,255,0.40)',
        fontSize:'11px', padding:'4px 10px', cursor:'pointer', fontFamily:'inherit',
    },
    lista: { display:'flex', flexDirection:'column', gap:'8px' },
    vazio: {
        display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
        padding:'32px 16px',
        background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.08)', borderRadius:'12px',
    },
    vazioTxt: { color:'rgba(255,255,255,0.38)', margin:0, fontSize:'13px' },
    vazioSub: { color:'rgba(255,255,255,0.20)', margin:0, fontSize:'11px' },
    rodape: {
        position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:'480px',
        padding:'10px 14px max(14px, env(safe-area-inset-bottom))',
        background:'linear-gradient(to top, #0a0f1e 70%, transparent)', zIndex:100, boxSizing:'border-box',
    },
    btnCriar: {
        width:'100%', padding:'14px',
        background:'linear-gradient(135deg, #F59E0B, #D97706)',
        border:'none', borderRadius:'12px', color:'#fff', fontSize:'16px', fontWeight:600,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent',
    },
    card: {
        background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
        borderRadius:'12px', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px',
    },
    cardHeader: { display:'flex', alignItems:'center', gap:'8px' },
    cardNome: {
        fontSize:'13px', fontWeight:600, color:'#F8FAFC', flex:1,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
    },
    cardStats: { display:'flex', gap:'10px', flexWrap:'wrap' },
    cardStat:  { fontSize:'11px', color:'rgba(255,255,255,0.40)' },
    statusBadge: {
        fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'10px',
        border:'1px solid', whiteSpace:'nowrap', flexShrink:0,
    },
    btnEntrar: {
        padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:600,
        fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent', alignSelf:'flex-start',
    },
    torneioAtual: {
        background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.18)',
        borderRadius:'14px', padding:'14px', display:'flex', flexDirection:'column', gap:'10px',
    },
    torneioAtualHeader: { display:'flex', alignItems:'center', gap:'8px' },
    torneioNome: { fontSize:'14px', fontWeight:700, color:'#F8FAFC', flex:1 },
    torneioStats: { display:'flex', gap:'8px', flexWrap:'wrap' },
    stat: {
        display:'flex', flexDirection:'column', alignItems:'center',
        background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
        borderRadius:'8px', padding:'5px 10px', minWidth:'56px',
    },
    statLabel: { fontSize:'9px', color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.06em' },
    statValor: { fontSize:'13px', fontWeight:700 },
    minhaSituacao: {
        padding:'7px 12px', borderRadius:'8px', border:'1px solid', display:'flex', alignItems:'center', gap:'8px',
    },
    campeao: {
        background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.35)',
        borderRadius:'8px', padding:'7px 12px', fontSize:'13px', color:'#FDE68A', textAlign:'center',
    },
    btnIniciar: {
        padding:'12px', background:'linear-gradient(135deg,#22C55E,#16A34A)',
        border:'none', borderRadius:'10px', color:'#fff', fontSize:'14px', fontWeight:700,
        cursor:'pointer', fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent',
    },
    btnRebuy: {
        padding:'12px', background:'linear-gradient(135deg,#EF4444,#B91C1C)',
        border:'none', borderRadius:'10px', color:'#fff', fontSize:'13px', fontWeight:700,
        cursor:'pointer', fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent',
    },
    avisoRebuy: {
        background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)',
        borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#FCA5A5', textAlign:'center',
    },
    jogadoresList: { display:'flex', flexDirection:'column', gap:'4px', maxHeight:'200px', overflowY:'auto' },
    jogadorItem: {
        display:'flex', alignItems:'center', gap:'8px',
        padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
    },
    conviteRow: {
        display:'flex', alignItems:'center', gap:'10px',
        background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)',
        borderRadius:'10px', padding:'10px 14px',
    },
    btnCompartilhar: {
        border:'1px solid', borderRadius:'8px', padding:'6px 12px',
        fontSize:'12px', fontWeight:700, cursor:'pointer',
        fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent', whiteSpace:'nowrap',
    },
};

const cssModal = {
    overlay: {
        position:'fixed', inset:0, background:'rgba(5,8,16,0.80)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        zIndex:500, backdropFilter:'blur(4px)',
    },
    caixa: {
        background:'#0d1424', border:'1px solid rgba(245,158,11,0.20)',
        borderRadius:'20px 20px 0 0',
        padding:'20px 16px max(20px, env(safe-area-inset-bottom))',
        width:'100%', maxWidth:'480px', display:'flex', flexDirection:'column', gap:'14px',
        maxHeight:'90vh', overflowY:'auto', fontFamily:'sans-serif', color:'#F8FAFC',
    },
    header: { display:'flex', alignItems:'center', justifyContent:'space-between' },
    titulo: { fontSize:'16px', fontWeight:700, color:'#F8FAFC' },
    btnFechar: {
        background:'transparent', border:'none', color:'rgba(255,255,255,0.40)',
        fontSize:'18px', cursor:'pointer', padding:'4px 8px', fontFamily:'inherit',
    },
    erro: {
        background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.35)',
        borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#FCA5A5',
    },
    campo: { display:'flex', flexDirection:'column', gap:'6px' },
    label: {
        fontSize:'12px', fontWeight:600, color:'rgba(255,255,255,0.55)',
        textTransform:'uppercase', letterSpacing:'0.05em',
    },
    input: {
        background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.10)',
        borderRadius:'8px', padding:'10px 12px', color:'#F8FAFC',
        fontSize:'14px', fontFamily:'sans-serif', outline:'none',
    },
    opcoes: { display:'flex', gap:'6px', flexWrap:'wrap' },
    btnOpcao: {
        flex:'1 1 50px', padding:'8px 4px', borderRadius:'8px', border:'1px solid',
        fontSize:'12px', fontWeight:600, cursor:'pointer',
        fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent',
    },
    hint: { fontSize:'10px', color:'rgba(255,255,255,0.25)', margin:0 },
    slider: { width:'100%', cursor:'pointer' },
    sliderLabels: { display:'flex', justifyContent:'space-between', fontSize:'10px', color:'rgba(255,255,255,0.25)' },
    resumo: {
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'6px',
        background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
        borderRadius:'8px', padding:'10px 12px', fontSize:'13px', color:'#F8FAFC',
    },
    btnCriar: {
        padding:'14px', background:'linear-gradient(135deg, #F59E0B, #D97706)',
        border:'none', borderRadius:'12px', color:'#fff', fontSize:'15px', fontWeight:700,
        cursor:'pointer', fontFamily:'sans-serif', WebkitTapHighlightColor:'transparent',
    },
    secaoRebuy: {
        display:'flex', flexDirection:'column', gap:'10px',
        background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.15)',
        borderRadius:'10px', padding:'12px',
    },
    btnRebuyConfirmar: {
        flex:1, padding:'12px', background:'linear-gradient(135deg,#EF4444,#B91C1C)',
        border:'none', borderRadius:'10px', color:'#fff', fontSize:'14px', fontWeight:700,
        cursor:'pointer', fontFamily:'sans-serif',
    },
    btnRebuyRecusar: {
        flex:1, padding:'12px',
        background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)',
        borderRadius:'10px', color:'rgba(255,255,255,0.55)',
        fontSize:'13px', cursor:'pointer', fontFamily:'sans-serif',
    },
};
