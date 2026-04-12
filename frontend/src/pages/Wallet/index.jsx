/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/index.jsx

   CORREÇÕES DESTA VERSÃO:
   → mostrarBoasVindas: detecta undefined E false (campo pode não
     existir no Firestore para usuários novos)
   → handleBonusResgatado: chama onUsuarioAtualizado para marcar
     bonusResgatado = true no estado global do App.jsx,
     evitando que o modal reapareça se o componente remontar
   → Demais funcionalidades mantidas intactas
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { getAuth, signOut }                 from 'firebase/auth';

import Header         from './Header';
import Tabs           from './Tabs';
import ListaMesas     from './ListaMesas';
import Ranking        from './Ranking';
import Loja           from './Loja';
import ModalCriarMesa from './ModalCriarMesa';
import ModalSenha     from './ModalSenha';
import ModalPerfil    from './ModalPerfil';

import WalletIndex    from '../Wallet/index';
import ModalBoasVindas from '../Wallet/BonasVindas';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const TABS = {
    CARTEIRA: 'carteira',
    MESAS:    'mesas',
    RANKING:  'ranking',
    LOJA:     'loja',
};

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

export default function Lobby({ usuario, socket, onEntrarMesa, onUsuarioAtualizado }) {

    const [tabAtiva,      setTabAtiva     ] = useState(TABS.CARTEIRA);
    const [filtroMesas,   setFiltroMesas  ] = useState(FILTRO_MESAS.PUBLICAS);
    const [mesasPublicas, setMesasPublicas] = useState([]);
    const [mesasPrivadas, setMesasPrivadas] = useState([]);
    const [ranking,       setRanking      ] = useState([]);
    const [modalCriar,    setModalCriar   ] = useState(false);
    const [modalSenha,    setModalSenha   ] = useState(null);
    const [modalPerfil,   setModalPerfil  ] = useState(false);
    const [carregando,    setCarregando   ] = useState(true);
    const [erro,          setErro         ] = useState(null);

    // ✅ CORREÇÃO: campo bonusResgatado pode ser undefined em contas novas
    // undefined = campo não existe no Firestore = bonus não foi resgatado ainda
    // false     = explicitamente não resgatado
    // true      = já resgatado
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
            setMesasPublicas(data.mesas.filter(m => !m.temSenha));
            setMesasPrivadas(data.mesas.filter(m =>  m.temSenha));
        } catch (e) {
            console.error('Erro ao buscar mesas:', e);
            setErro('Não foi possível carregar as mesas.');
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


    // ----------------------------------------------------------------
    // Handlers de mesa
    // ----------------------------------------------------------------
    function handleEntrarPublica(mesaId) {
        socket.emit('entrar_mesa', { mesaId });
        onEntrarMesa(mesaId);
    }

    function handleClicarPrivada(mesaId) {
        setModalSenha(mesaId);
    }

    function handleConfirmarSenha(senha) {
        if (!modalSenha) return;
        socket.emit('entrar_mesa', { mesaId: modalSenha, senha });
        onEntrarMesa(modalSenha);
        setModalSenha(null);
    }

    function handleMesaCriada(mesaId) {
        setModalCriar(false);
        onEntrarMesa(mesaId);
    }

    function handleLogout() {
        signOut(getAuth());
    }

    // ✅ CORREÇÃO: após resgatar bônus, atualiza o estado global no App.jsx
    // para que bonusResgatado = true e o modal não reapareça se remontar
    function handleBonusResgatado() {
        setMostrarBoasVindas(false);
        setTabAtiva(TABS.CARTEIRA);
        // Propaga para App.jsx para persistir no estado global
        onUsuarioAtualizado?.(prev => prev ? { ...prev, bonusResgatado: true } : prev);
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.pagina} className="lobby-pagina">

            <style>{`
                .lobby-pagina   { max-width: 480px; }
                .lobby-body     { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
                .lobby-esquerda { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
                .lobby-direita  { display: none; }
                .lobby-conteudo {
                    flex: 1; overflow-y: auto;
                    padding: 12px 14px 100px;
                    -webkit-overflow-scrolling: touch;
                }
                .lobby-rodape {
                    position: fixed; bottom: 0;
                    left: 50%; transform: translateX(-50%);
                    width: 100%; max-width: 480px;
                    padding: 10px 14px max(14px, env(safe-area-inset-bottom));
                    background: linear-gradient(to top, #0a0f1e 70%, transparent);
                    z-index: 100; box-sizing: border-box;
                }
                .sub-filtro-btn {
                    flex: 1; padding: 7px 4px;
                    border-radius: 7px; cursor: pointer;
                    font-size: 12px; font-family: inherit;
                    transition: all 0.15s;
                    -webkit-tap-highlight-color: transparent;
                }

                @media (min-width: 768px) {
                    .lobby-pagina   { max-width: 1200px !important; }
                    .lobby-body     { flex-direction: row; }
                    .lobby-esquerda { flex: 1; border-right: 1px solid rgba(255,255,255,0.06); min-width: 0; }
                    .lobby-direita  { display: flex; flex-direction: column; width: 320px; flex-shrink: 0; background: #0d1424; }
                    .lobby-conteudo { padding: 16px 20px 100px; }
                    .lobby-rodape   { max-width: 1200px; padding: 12px 20px max(16px, env(safe-area-inset-bottom)); }
                }
                @media (min-width: 1024px) {
                    .lobby-direita { width: 380px; }
                }
            `}</style>

            {/* ---- HEADER ---- */}
            <Header
                usuario={usuario}
                onAbrirLoja={     () => setTabAtiva(TABS.LOJA)}
                onAbrirCarteira={ () => setTabAtiva(TABS.CARTEIRA)}
                onAbrirPerfil={   () => setModalPerfil(true)}
                onLogout={handleLogout}
            />

            {/* ---- CORPO ---- */}
            <div className="lobby-body">

                <div className="lobby-esquerda">

                    <Tabs
                        tabAtiva={tabAtiva}
                        onMudar={setTabAtiva}
                        qtdPublicas={mesasPublicas.length}
                        qtdPrivadas={mesasPrivadas.length}
                    />

                    <div className="lobby-conteudo">

                        {erro && (
                            <div style={estilos.erro}>
                                <span>{erro}</span>
                                <button onClick={buscarMesas} style={estilos.btnTentar}>
                                    Tentar novamente
                                </button>
                            </div>
                        )}

                        {/* ---- ABA: CARTEIRA ---- */}
                        {tabAtiva === TABS.CARTEIRA && (
                            <WalletIndex
                                usuario={usuario}
                                socket={socket}
                            />
                        )}

                        {/* ---- ABA: MESAS ---- */}
                        {tabAtiva === TABS.MESAS && (
                            <>
                                <div style={estilos.subFiltro}>
                                    <button
                                        className="sub-filtro-btn"
                                        onClick={() => setFiltroMesas(FILTRO_MESAS.PUBLICAS)}
                                        style={{
                                            background: filtroMesas === FILTRO_MESAS.PUBLICAS
                                                ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                                            border: filtroMesas === FILTRO_MESAS.PUBLICAS
                                                ? '1px solid rgba(124,58,237,0.40)' : '1px solid rgba(255,255,255,0.07)',
                                            color: filtroMesas === FILTRO_MESAS.PUBLICAS
                                                ? '#A78BFA' : 'rgba(255,255,255,0.40)',
                                            fontWeight: filtroMesas === FILTRO_MESAS.PUBLICAS ? '600' : '400',
                                        }}
                                    >
                                        🌐 Públicas
                                        {mesasPublicas.length > 0 && (
                                            <span style={estilos.badge}>{mesasPublicas.length}</span>
                                        )}
                                    </button>

                                    <button
                                        className="sub-filtro-btn"
                                        onClick={() => setFiltroMesas(FILTRO_MESAS.PRIVADAS)}
                                        style={{
                                            background: filtroMesas === FILTRO_MESAS.PRIVADAS
                                                ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                                            border: filtroMesas === FILTRO_MESAS.PRIVADAS
                                                ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.07)',
                                            color: filtroMesas === FILTRO_MESAS.PRIVADAS
                                                ? '#F59E0B' : 'rgba(255,255,255,0.40)',
                                            fontWeight: filtroMesas === FILTRO_MESAS.PRIVADAS ? '600' : '400',
                                        }}
                                    >
                                        🔒 Privadas
                                        {mesasPrivadas.length > 0 && (
                                            <span style={{
                                                ...estilos.badge,
                                                background: 'rgba(245,158,11,0.20)',
                                                color: '#F59E0B',
                                            }}>
                                                {mesasPrivadas.length}
                                            </span>
                                        )}
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
                            </>
                        )}

                        {/* ---- ABA: RANKING (mobile) ---- */}
                        {tabAtiva === TABS.RANKING && (
                            <Ranking ranking={ranking} meuUid={usuario?.uid} />
                        )}

                        {/* ---- ABA: LOJA ---- */}
                        {tabAtiva === TABS.LOJA && (
                            <Loja usuario={usuario} socket={socket} />
                        )}

                    </div>
                </div>

                {/* Coluna direita: ranking fixo (desktop) */}
                <div className="lobby-direita">
                    <div style={estilos.direitaTitulo}>
                        <span style={estilos.direitaTituloTexto}>🏆 Ranking</span>
                    </div>
                    <div style={estilos.direitaConteudo}>
                        <Ranking ranking={ranking} meuUid={usuario?.uid} />
                    </div>
                </div>

            </div>

            {/* ---- BOTÃO CRIAR MESA ---- */}
            {tabAtiva === TABS.MESAS && (
                <div className="lobby-rodape">
                    <button
                        onClick={() => setModalCriar(true)}
                        style={estilos.btnCriar}
                    >
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>+</span>
                        Criar Mesa
                    </button>
                </div>
            )}

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
                    onFechar={() => setModalPerfil(false)}
                    onAtualizar={(novoUsuario) => {
                        onUsuarioAtualizado?.(novoUsuario);
                        setModalPerfil(false);
                    }}
                />
            )}

            {/* ✅ Modal de boas-vindas — undefined OU false = mostrar */}
            {mostrarBoasVindas && (
                <ModalBoasVindas
                    nomeJogador={usuario?.nome || 'Jogador'}
                    socket={socket}
                    onResgatado={handleBonusResgatado}
                />
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// ================================================================

const estilos = {

    pagina: {
        minHeight:     '100vh',
        background:    '#0a0f1e',
        color:         '#F8FAFC',
        display:       'flex',
        flexDirection: 'column',
        margin:        '0 auto',
        fontFamily:    'sans-serif',
        position:      'relative',
    },

    subFiltro: {
        display:      'flex',
        gap:          '8px',
        marginBottom: '14px',
    },

    badge: {
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        marginLeft:     '5px',
        minWidth:       '18px',
        height:         '18px',
        borderRadius:   '9px',
        fontSize:       '10px',
        fontWeight:     '700',
        background:     'rgba(124,58,237,0.20)',
        color:          '#A78BFA',
        padding:        '0 4px',
    },

    direitaTitulo: {
        padding:      '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink:   0,
    },

    direitaTituloTexto: {
        fontSize:   '14px',
        fontWeight: '600',
        color:      '#F8FAFC',
    },

    direitaConteudo: {
        flex:      1,
        overflowY: 'auto',
        padding:   '12px 16px',
        WebkitOverflowScrolling: 'touch',
    },

    btnCriar: {
        width:          '100%',
        padding:        '14px',
        background:     'linear-gradient(135deg, #7C3AED, #4F46E5)',
        border:         'none',
        borderRadius:   '12px',
        color:          'white',
        fontSize:       '16px',
        fontWeight:     '600',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        WebkitTapHighlightColor: 'transparent',
        transition:     'opacity 0.15s',
        fontFamily:     'sans-serif',
    },

    erro: {
        background:    'rgba(239,68,68,0.1)',
        border:        '1px solid rgba(239,68,68,0.3)',
        borderRadius:  '10px',
        padding:       '12px 14px',
        marginBottom:  '12px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        fontSize:      '13px',
        color:         '#FCA5A5',
    },

    btnTentar: {
        background:   'rgba(239,68,68,0.2)',
        border:       '1px solid rgba(239,68,68,0.4)',
        borderRadius: '6px',
        color:        '#FCA5A5',
        fontSize:     '12px',
        padding:      '6px 12px',
        cursor:       'pointer',
        alignSelf:    'flex-start',
        fontFamily:   'sans-serif',
    },
};
