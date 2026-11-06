/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/index.jsx

   MUDANÇAS DESTA VERSÃO:
     → Tabs reorganizadas: Carteira | Mesas | Ranking | Loja
     → Carteira é a PRIMEIRA aba (WalletIndex)
     → Mesas públicas e privadas agrupadas em uma única tab "Mesas"
       com sub-filtro interno (público / privado)
     → ModalBoasVindas aparece automaticamente no 1º acesso
       (detectado via usuario.bonusResgatado === false)
     → onAbrirCarteira no Header agora abre a aba correta
     → ModalConfiguracoes adicionado (Alterar PIN + Sons)

   RESPONSIVIDADE:
   Mobile  → layout vertical, max-width 480px, uma coluna
   Desktop → layout de duas colunas:
               Esquerda: tabs + lista de mesas (flex: 1)
               Direita:  ranking fixo (320px)

   PROPS:
     usuario      → { uid, nome, avatar, saldo, saldoBonus,
                      rankPontos, tema, bonusResgatado }
     socket       → instância do Socket.io já conectada
     onEntrarMesa → função chamada quando entra em uma mesa
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { getAuth, signOut }                 from 'firebase/auth';

import Header              from './Header';
import Icone               from '../../components/Icone';
import Tabs                from './Tabs';
import ListaMesas          from './ListaMesas';
import Ranking             from './Ranking';
import Loja                from './Loja';
import Admin                from '../Admin/index';
import ModalCriarMesa      from './ModalCriarMesa';
import ModalSenha          from './ModalSenha';
import ModalPerfil         from './ModalPerfil';
import ModalConfiguracoes  from './ModalConfiguracoes';

// Wallet — primeira aba do menu do jogador
import WalletIndex    from '../Wallet/index';

// Bônus de boas-vindas — aparece automaticamente no 1º acesso
import ModalBoasVindas from '../Wallet/BonasVindas';

// Torneios (Campeonato)
import Campeonato from '../Campeonato/index';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const TABS = {
    CARTEIRA:   'carteira',    // 1ª aba — WalletIndex
    MESAS:      'mesas',       // agrupa públicas + privadas com sub-filtro
    CAMPEONATO: 'campeonato',  // torneios
    RANKING:    'ranking',
    LOJA:       'loja',
    ADMIN:      'admin',       // só aparece pra quem é admin (usuario.isAdmin)
};

// Sub-filtro dentro da aba Mesas
const FILTRO_MESAS = {
    PUBLICAS: 'publicas',
    PRIVADAS: 'privadas',
};

const SERVER_URL        = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const INTERVALO_MESAS   = 10000;
const INTERVALO_RANKING = 60000;


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Lobby({ usuario, socket, onEntrarMesa, conviteTorneio, conviteMesa }) {

    const [tabAtiva,      setTabAtiva     ] = useState(() =>
        conviteTorneio ? TABS.CAMPEONATO : TABS.MESAS
    );
    const [filtroMesas,   setFiltroMesas  ] = useState(FILTRO_MESAS.PUBLICAS);
    const [mesasPublicas, setMesasPublicas] = useState([]);
    const [mesasPrivadas, setMesasPrivadas] = useState([]);
    const [ranking,       setRanking      ] = useState([]);
    const [qtdTorneios,   setQtdTorneios  ] = useState(0);
    const [modalCriar,    setModalCriar   ] = useState(false);
    const [modalSenha,    setModalSenha   ] = useState(null);
    const [modalPerfil,   setModalPerfil  ] = useState(false);
    const [modalConfiguracoes, setModalConfiguracoes] = useState(false);
    const [carregando,    setCarregando   ] = useState(true);
    const [erro,          setErro         ] = useState(null);
    const [backendOnline, setBackendOnline] = useState(true);
    const [erroEntrada,   setErroEntrada  ] = useState(null);
    const [entrando,      setEntrando     ] = useState(false);

    // Controla o modal de boas-vindas:
    // Abre automaticamente se o jogador ainda não resgatou o bônus
    const [mostrarBoasVindas, setMostrarBoasVindas] = useState(
        usuario?.bonusResgatado !== true
    );


    // ----------------------------------------------------------------
    // Busca mesas
    // ----------------------------------------------------------------
    const buscarMesas = useCallback(async () => {
        try {
            setErro(null);
            const res  = await fetch(`${SERVER_URL}/mesas`);
            if (!res.ok) throw new Error(`Servidor retornou ${res.status}`);
            const data = await res.json();
            setBackendOnline(true);
            setMesasPublicas(data.mesas.filter(m => !m.temSenha));
            setMesasPrivadas(data.mesas.filter(m =>  m.temSenha));
        } catch {
            setBackendOnline(false);
            setErro('Servidor offline. Verifique se o backend está rodando.');
        } finally {
            setCarregando(false);
        }
    }, []);


    // ----------------------------------------------------------------
    // Busca ranking
    // ----------------------------------------------------------------
    const buscarRankingAPI = useCallback(async () => {
        try {
            const res = await fetch(`${SERVER_URL}/ranking?top=20`);
            if (!res.ok) return;
            const data = await res.json();
            setRanking(data.ranking || []);
        } catch (e) {
            console.error('Erro ao buscar ranking:', e);
        }
    }, []);


    // Polling de mesas
    useEffect(() => {
        buscarMesas();
        const intervalo = setInterval(buscarMesas, INTERVALO_MESAS);
        return () => clearInterval(intervalo);
    }, [buscarMesas]);

    // Polling de ranking
    useEffect(() => {
        buscarRankingAPI();
        const intervalo = setInterval(buscarRankingAPI, INTERVALO_RANKING);
        return () => clearInterval(intervalo);
    }, [buscarRankingAPI]);

    // Socket: mesas em tempo real
    useEffect(() => {
        if (!socket) return;
        socket.on('mesas_atualizadas', buscarMesas);
        return () => socket.off('mesas_atualizadas', buscarMesas);
    }, [socket, buscarMesas]);

    // Socket: torneios em tempo real
    useEffect(() => {
        if (!socket) return;
        const onTorneios = (lista) => setQtdTorneios((lista || []).length);
        socket.on('torneios_atualizados', onTorneios);
        socket.on('torneios_lista',       onTorneios);
        // Solicita lista inicial para ter o badge correto
        socket.emit('listar_torneios');
        return () => {
            socket.off('torneios_atualizados', onTorneios);
            socket.off('torneios_lista',       onTorneios);
        };
    }, [socket]);


    // Auto-entrar se veio por link de convite de mesa (?mesa=ID)
    useEffect(() => {
        if (!conviteMesa || !socket) return;
        const t = setTimeout(() => handleEntrarPublica(conviteMesa), 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conviteMesa, socket]);


    // ----------------------------------------------------------------
    // Handlers de mesa
    // ----------------------------------------------------------------
    function _emitirEntrarMesa(mesaId, senha) {
        setEntrando(true);
        setErroEntrada(null);

        socket.emit('entrar_mesa', { mesaId, senha });

        // Aguarda confirmação do servidor antes de trocar de tela
        function onEntrou({ mesaId: id }) {
            cleanup();
            onEntrarMesa(id);
        }
        function onErro({ mensagem }) {
            cleanup();
            setErroEntrada(mensagem);
        }
        function cleanup() {
            setEntrando(false);
            socket.off('entrou_mesa', onEntrou);
            socket.off('erro',        onErro);
        }

        socket.once('entrou_mesa', onEntrou);
        socket.once('erro',        onErro);

        // Timeout de segurança: 8 s
        setTimeout(() => {
            cleanup();
            setErroEntrada('Tempo esgotado. Tente novamente.');
        }, 8000);
    }

    function handleEntrarPublica(mesaId) {
        _emitirEntrarMesa(mesaId, undefined);
    }

    function handleClicarPrivada(mesaId) {
        setModalSenha(mesaId);
    }

    function handleConfirmarSenha(senha) {
        if (!modalSenha) return;
        const mesaId = modalSenha;
        setModalSenha(null);
        _emitirEntrarMesa(mesaId, senha);
    }

    function handleMesaCriada(mesaId) {
        // Para criador: servidor já adicionou o jogador antes de emitir mesa_criada
        setModalCriar(false);
        onEntrarMesa(mesaId);
    }

    function handleLogout() {
        signOut(getAuth());
    }

    // Após resgatar bônus: fecha o modal e vai para a carteira
    function handleBonusResgatado() {
        setMostrarBoasVindas(false);
        setTabAtiva(TABS.CARTEIRA);
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div className="lobby">

            {/* ---- HEADER (com a navegação: no celular ela vira barra embaixo) ---- */}
            <Header
                usuario={usuario}
                navegacao={
                    <Tabs
                        tabAtiva={tabAtiva}
                        onMudar={setTabAtiva}
                        qtdPublicas={mesasPublicas.length}
                        qtdPrivadas={mesasPrivadas.length}
                        qtdTorneios={qtdTorneios}
                        isAdmin={!!usuario?.isAdmin}
                    />
                }
                onAbrirLoja={          () => setTabAtiva(TABS.LOJA)}
                onAbrirCarteira={      () => setTabAtiva(TABS.CARTEIRA)}
                onAbrirPerfil={        () => setModalPerfil(true)}
                onAbrirConfiguracoes={ () => setModalConfiguracoes(true)}
                onLogout={handleLogout}
            />

            {/* ---- Banner servidor offline ---- */}
            {!backendOnline && (
                <div className="faixa-aviso erro" role="alert">
                    Servidor offline. Inicie o backend com <code>cd backend && npm run dev</code>
                </div>
            )}

            {/* ---- CORPO ---- */}
            <div className="lobby-corpo">

                <main className="lobby-principal">

                    {erro && (
                        <div className="aviso-inline erro" role="alert">
                            <span>{erro}</span>
                            <button type="button" onClick={buscarMesas} className="btn btn-neutro">
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {erroEntrada && (
                        <button type="button" className="aviso-inline erro" onClick={() => setErroEntrada(null)}>
                            <span>{erroEntrada}</span>
                            <Icone nome="fechar" tamanho={16} />
                        </button>
                    )}

                    {/* ---- ABA: CARTEIRA ---- */}
                    {tabAtiva === TABS.CARTEIRA && (
                        <WalletIndex
                            usuario={usuario}
                            socket={socket}
                        />
                    )}

                    {/* ---- ABA: MESAS (públicas + privadas com sub-filtro) ---- */}
                    {tabAtiva === TABS.MESAS && (
                        <section aria-labelledby="titulo-mesas">
                            <div className="secao-cab">
                                <div className="esq">
                                    <h1 id="titulo-mesas" className="titulo-secao">Mesas</h1>
                                    <div className="segmento" role="group" aria-label="Tipo de mesa">
                                        <button
                                            type="button"
                                            aria-pressed={filtroMesas === FILTRO_MESAS.PUBLICAS}
                                            onClick={() => setFiltroMesas(FILTRO_MESAS.PUBLICAS)}
                                        >
                                            Públicas <span className="cont num">{mesasPublicas.length}</span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={filtroMesas === FILTRO_MESAS.PRIVADAS}
                                            onClick={() => setFiltroMesas(FILTRO_MESAS.PRIVADAS)}
                                        >
                                            <Icone nome="cadeado" tamanho={15} />
                                            Privadas <span className="cont num">{mesasPrivadas.length}</span>
                                        </button>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setModalCriar(true)} className="btn btn-principal btn-criar">
                                    <Icone nome="mais" tamanho={18} />
                                    Criar mesa
                                </button>
                            </div>

                            {filtroMesas === FILTRO_MESAS.PUBLICAS && (
                                <ListaMesas
                                    mesas={mesasPublicas}
                                    carregando={carregando}
                                    privadas={false}
                                    onEntrar={handleEntrarPublica}
                                />
                            )}
                            {filtroMesas === FILTRO_MESAS.PRIVADAS && (
                                <ListaMesas
                                    mesas={mesasPrivadas}
                                    carregando={carregando}
                                    privadas={true}
                                    onEntrar={handleClicarPrivada}
                                />
                            )}
                        </section>
                    )}

                    {/* ---- ABA: CAMPEONATO ---- */}
                    {tabAtiva === TABS.CAMPEONATO && (
                        <Campeonato
                            usuario={usuario}
                            socket={socket}
                            onEntrarMesa={onEntrarMesa}
                            conviteTorneio={conviteTorneio}
                        />
                    )}

                    {/* ---- ABA: RANKING ---- */}
                    {tabAtiva === TABS.RANKING && (
                        <Ranking ranking={ranking} meuUid={usuario?.uid} />
                    )}

                    {/* ---- ABA: LOJA ---- */}
                    {tabAtiva === TABS.LOJA && (
                        <Loja usuario={usuario} socket={socket} />
                    )}

                    {/* ---- ABA: ADMIN (só quem é admin vê a tab) ---- */}
                    {tabAtiva === TABS.ADMIN && usuario?.isAdmin && (
                        <Admin socket={socket} />
                    )}
                </main>

                {/* Coluna direita: ranking fixo (desktop) */}
                <aside className="lobby-lado" aria-labelledby="titulo-ranking-lado">
                    <h2 id="titulo-ranking-lado" className="lado-titulo">Ranking</h2>
                    <p className="lado-sub">Atualiza a cada minuto</p>
                    <Ranking ranking={ranking} meuUid={usuario?.uid} />
                </aside>

            </div>

            {/* ---- MODAIS ---- */}
            {modalCriar && (
                <ModalCriarMesa
                    usuario={usuario}
                    socket={socket}
                    onMesaCriada={handleMesaCriada}
                    onFechar={() => setModalCriar(false)}
                />
            )}

            {modalSenha && (
                <ModalSenha
                    onConfirmar={handleConfirmarSenha}
                    onFechar={() => setModalSenha(null)}
                />
            )}

            {modalPerfil && (
                <ModalPerfil
                    usuario={usuario}
                    socket={socket}
                    onFechar={() => setModalPerfil(false)}
                    onAtualizar={(novoUsuario) => {
                        console.log('Perfil atualizado:', novoUsuario);
                        setModalPerfil(false);
                    }}
                />
            )}

            {modalConfiguracoes && (
                <ModalConfiguracoes
                    usuario={usuario}
                    socket={socket}
                    onFechar={() => setModalConfiguracoes(false)}
                />
            )}

            {/* Modal de boas-vindas — 1º acesso, bônus ainda não resgatado */}
            {mostrarBoasVindas && (
                <ModalBoasVindas
                    nomeJogador={usuario?.nome || 'Jogador'}
                    socket={socket}
                    onResgatado={handleBonusResgatado}
                />
            )}

            {/* Overlay de "entrando na mesa" */}
            {entrando && (
                <div className="tela-espera" role="status">
                    <div className="roda" />
                    <span>Entrando na mesa…</span>
                </div>
            )}

        </div>
    );
}
