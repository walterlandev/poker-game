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
        <div className="torneios">
            <div className="secao-cab">
                <div className="esq">
                    <h1 className="titulo-secao">Torneios</h1>
                </div>
                <button type="button" className="btn btn-principal btn-criar" onClick={() => setModalCriar(true)}>
                    <Icone nome="mais" tamanho={18} />Criar torneio
                </button>
            </div>

            {erro && (
                <button type="button" className="aviso-inline erro" onClick={() => setErro(null)}>
                    <span>{erro}</span>
                    <Icone nome="fechar" tamanho={16} />
                </button>
            )}

            {rebuyInfo && (
                <ModalRebuy
                    info={rebuyInfo}
                    usuario={usuario}
                    moeda={torneioAtual?.moeda}
                    enviando={rebuyEnviando}
                    onRebuy={handleRebuy}
                    onRecusar={() => setRebuyInfo(null)}
                />
            )}

            {torneioAtual && estouNoTorneio && (
                <EstadoTorneio
                    torneio={torneioAtual}
                    meuUid={meuUid}
                    souHost={souHost}
                    possoRebuy={possoRebuy}
                    rebuyEnviando={rebuyEnviando}
                    onIniciar={handleIniciar}
                    onRebuy={handleRebuy}
                />
            )}

            <section className="torneios-lista" aria-labelledby="torneios-abertos">
                <div className="cart-mov-cab">
                    <h2 id="torneios-abertos">Abertos para inscrição</h2>
                    <button type="button" className="cart-link" onClick={() => socket?.emit('listar_torneios')}>Atualizar</button>
                </div>

                {torneios.length === 0 ? (
                    <div className="lista-vazia">
                        <Icone nome="torneio" tamanho={32} />
                        <p className="titulo">Nenhum torneio aberto agora</p>
                        <p className="sub">Crie um e chame os amigos pelo código de convite.</p>
                    </div>
                ) : (
                    <ul className="torneios-itens">
                        {torneios.map(t => (
                            <li key={t.id}>
                                <CardTorneio
                                    torneio={t}
                                    jaEstou={torneioAtual?.id === t.id && !!estouNoTorneio}
                                    onEntrar={() => handleEntrar(t.id)}
                                    carregando={carregando}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </section>

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

const NOME_STATUS_TORNEIO = { aberto: 'Aberto', em_andamento: 'Em andamento', finalizado: 'Finalizado' };
const NOME_STATUS_JOGADOR = {
    vencedor: 'Campeão', eliminado: 'Eliminado', jogando: 'Jogando',
    rebuy_disponivel: 'Rebuy disponível', rebuy_pago: 'Rebuy pago', aguardando: 'Aguardando',
};

function EstadoTorneio({ torneio, meuUid, souHost, possoRebuy, rebuyEnviando, onIniciar, onRebuy }) {
    const [copiado, setCopiado] = useState(false);
    const totalJogadores = Object.keys(torneio.jogadores || {}).length;
    const minhaEntrada   = torneio.jogadores?.[meuUid];
    const moedaNome      = (torneio?.moeda ?? 'real') === 'bonus' ? 'bônus' : 'saldo real';

    function copiarLink() {
        const url = `${window.location.origin}${window.location.pathname}?torneio=${torneio.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        });
    }

    const situacao = {
        eliminado:        { txt: 'Você foi eliminado.', tom: 'perigo' },
        rebuy_disponivel: { txt: 'Rebuy disponível: você pode voltar na próxima rodada.', tom: 'aviso' },
        rebuy_pago:       { txt: 'Rebuy confirmado. Aguardando a próxima rodada.', tom: 'ok' },
        vencedor:         { txt: 'Você é o campeão.', tom: 'ok' },
        jogando:          { txt: 'Você está jogando.', tom: 'ok' },
    }[minhaEntrada?.status] || { txt: 'Inscrito. Aguardando o início.', tom: '' };

    return (
        <section className="torneio-atual" aria-labelledby="torneio-atual-nome">
            <div className="torneio-atual-cab">
                <div>
                    <p className="torneio-atual-rot">Seu torneio</p>
                    <h2 id="torneio-atual-nome">{torneio.nome}<EtiquetaMoeda moeda={torneio?.moeda} /></h2>
                </div>
                <span className={`torneio-status ${torneio.status}`}>{NOME_STATUS_TORNEIO[torneio.status] || torneio.status}</span>
            </div>

            {torneio.status === 'aberto' && (
                <div className="torneio-convite">
                    <div>
                        <span className="cart-campo-rot">Código de convite</span>
                        <b className="num" translate="no">{torneio.id}</b>
                    </div>
                    <button type="button" className="btn btn-neutro" onClick={copiarLink}>
                        <Icone nome={copiado ? 'check' : 'link'} tamanho={16} />{copiado ? 'Link copiado' : 'Copiar link'}
                    </button>
                </div>
            )}

            <dl className="torneio-stats">
                <Stat label="Jogadores" valor={`${totalJogadores}/${torneio.maxJogadores}`} />
                <Stat label={`Buy-in (${moedaNome})`} valor={`₿C ${fmt(torneio.buyIn)}`} />
                <Stat label="Fichas" valor={fmt(torneio.fichasIniciais)} />
                <Stat label="Por mesa" valor={torneio.jogadoresPorMesa} />
                {torneio.rodadaAtual > 0 && <Stat label="Rodada" valor={torneio.rodadaAtual + 1} />}
                {torneio.rebuyAtivo && <Stat label="Rebuy fecha em" valor={`${torneio.rebuyMinRestantes} min`} />}
            </dl>

            {minhaEntrada && (
                <p className={`torneio-situacao ${situacao.tom}`} role="status">
                    {situacao.txt}
                    {minhaEntrada.rebuys > 0 && <span className="num"> ({minhaEntrada.rebuys}× rebuy)</span>}
                </p>
            )}

            {possoRebuy && (
                <button type="button" className="btn btn-principal cart-btn-cheio" onClick={onRebuy} disabled={rebuyEnviando} aria-busy={rebuyEnviando || undefined}>
                    Fazer rebuy por ₿C {fmt(torneio.buyIn)} de {moedaNome} (+{fmt(torneio.fichasIniciais)} fichas)
                </button>
            )}

            {torneio.aguardandoRebuys && (
                <p className="cart-nota" role="status">Aguardando as decisões de rebuy (60 s) antes da próxima rodada…</p>
            )}

            {torneio.campeao && (
                <p className="torneio-campeao">
                    <Icone nome="torneio" tamanho={18} />
                    <span>
                        Campeão: <b>{torneio.jogadores?.[torneio.campeao]?.nome || torneio.campeao}</b>
                        {torneio.premioTotal > 0 && <> com prêmio de <b className="num">₿C {fmt(torneio.premioTotal)}</b> em {moedaNome}</>}
                    </span>
                </p>
            )}

            {souHost && torneio.status === 'aberto' && (
                <button type="button" className="btn btn-principal cart-btn-cheio" disabled={totalJogadores < 2} onClick={onIniciar}>
                    {totalJogadores < 2
                        ? `Aguardando jogadores (${totalJogadores}/2)`
                        : <><Icone nome="play" tamanho={18} />Iniciar torneio ({totalJogadores} jogadores)</>}
                </button>
            )}

            {totalJogadores > 0 && (
                <ul className="torneio-jogadores">
                    {Object.values(torneio.jogadores).map(j => (
                        <li key={j.uid}>
                            <span className="torneio-av" aria-hidden="true">
                                {j.avatar
                                    ? <img src={j.avatar} alt="" width={28} height={28} onError={e => { e.target.style.display = 'none'; }} />
                                    : (j.nome?.[0]?.toUpperCase() || '?')}
                            </span>
                            <span className="nm">
                                {j.nome}
                                {j.rebuys > 0 && <span className="num"> ({j.rebuys}R)</span>}
                            </span>
                            <span className={`torneio-jstatus ${j.status}`}>{NOME_STATUS_JOGADOR[j.status] || j.status?.replace('_', ' ')}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}


// ================================================================
// MODAL REBUY — aparece quando o jogador é eliminado
// ================================================================

function ModalRebuy({ info, usuario, moeda, enviando, onRebuy, onRecusar }) {
    const [seg, setSeg] = useState(60);
    const ehBonus = (moeda ?? 'real') === 'bonus';
    const saldo   = ehBonus ? (usuario?.saldoBonus || 0) : (usuario?.saldo || 0);

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
        <div className="dialogo-veu">
            <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="rebuy-titulo" aria-describedby="rebuy-texto">
                <h2 id="rebuy-titulo">Você foi eliminado</h2>
                <p id="rebuy-texto">Quer fazer rebuy e continuar no torneio? Você tem <b className="num">{seg} s</b> para decidir.</p>
                <dl className="torneio-stats">
                    <Stat label={`Custo (${ehBonus ? 'bônus' : 'saldo real'})`} valor={`₿C ${fmt(info.custo)}`} />
                    <Stat label="Fichas" valor={`+${fmt(info.fichasGanhas)}`} />
                    <Stat label={ehBonus ? 'Seu bônus' : 'Seu saldo real'} valor={`₿C ${fmt(saldo)}`} />
                    <Stat label="Janela restante" valor={`${info.periodoRestante} min`} />
                </dl>
                <div className="dialogo-acoes">
                    <button type="button" className="btn btn-neutro" onClick={onRecusar}>Não, obrigado</button>
                    <button type="button" className="btn btn-principal" onClick={onRebuy} disabled={enviando} aria-busy={enviando || undefined}>
                        Fazer rebuy
                    </button>
                </div>
            </div>
        </div>
    );
}


// ================================================================
// CARD DE TORNEIO
// ================================================================

function CardTorneio({ torneio, jaEstou, onEntrar, carregando }) {
    const cheio = torneio.totalJogadores >= torneio.maxJogadores;
    return (
        <div className="torneio-item">
            <div className="torneio-item-meio">
                <div className="nome">{torneio.nome}<EtiquetaMoeda moeda={torneio?.moeda} /></div>
                <div className="meta num">
                    <span>Buy-in <b className="cor-bc">₿C {fmt(torneio.buyIn)}</b></span>
                    <span>{fmt(torneio.fichasIniciais)} fichas</span>
                    <span>{torneio.jogadoresPorMesa} por mesa</span>
                    {torneio.maxRebuys > 0 && <span>rebuy {torneio.maxRebuys}×</span>}
                </div>
            </div>
            <div className="torneio-item-acao">
                <span className="num torneio-vagas">{torneio.totalJogadores}/{torneio.maxJogadores}</span>
                <button type="button" className="btn btn-neutro" disabled={carregando || jaEstou || cheio} aria-busy={carregando || undefined} onClick={onEntrar}>
                    {jaEstou ? 'Inscrito' : cheio ? 'Lotado' : 'Entrar'}
                </button>
            </div>
        </div>
    );
}

function Stat({ label, valor }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd className="num">{valor}</dd>
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


// Moeda do torneio ('real' | 'bonus'); servidor antigo sem o campo = real
function EtiquetaMoeda({ moeda }) {
    const m = moeda ?? 'real';
    return <span className={`etiqueta-moeda ${m}`}>{m === 'bonus' ? 'Bônus' : 'Real'}</span>;
}
