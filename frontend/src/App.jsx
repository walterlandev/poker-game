/* ================================================================
   ARQUIVO: frontend/src/App.jsx

   MUDANÇAS DESTA VERSÃO:
   → Escuta 'tema:ativado'  → atualiza usuario.tema em tempo real
   → Escuta 'tema:comprado' → atualiza temasComprados + saldo
   → Escuta 'wallet:saldo_atualizado' → mantém saldo sincronizado
   → Passa setUsuario para Lobby para atualizações locais
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged }               from 'firebase/auth';
import { doc, getDoc }                      from 'firebase/firestore';
import { io }                               from 'socket.io-client';
import { auth, db }                         from './services/firebase-config';
import Auth                                 from './pages/Auth/index';
import Lobby                                from './pages/Lobby/index';
import Game                                 from './pages/Game/index';

import { SERVER_URL } from './services/servidor';

const socket = io(SERVER_URL, {
    autoConnect:         false,
    reconnection:        true,
    reconnectionDelay:   1000,
    reconnectionAttempts: 5,
});

const TELAS = {
    CARREGANDO: 'carregando',
    AUTH:       'auth',
    LOBBY:      'lobby',
    JOGO:       'jogo',
};

export default function App() {
    const [tela,      setTela     ] = useState(TELAS.CARREGANDO);
    const [usuario,   setUsuario  ] = useState(null);
    const [mesaAtual, setMesaAtual] = useState(null);
    const [erroGlobal, setErroGlobal] = useState(null);

    // Convite de torneio via URL: ?torneio=TABCD
    const [conviteTorneio] = useState(() => {
        const p = new URLSearchParams(window.location.search);
        return p.get('torneio') || null;
    });

    // Convite de mesa via URL: ?mesa=ABCD
    const [conviteMesa] = useState(() => {
        const p = new URLSearchParams(window.location.search);
        return p.get('mesa') || null;
    });

    // ----------------------------------------------------------------
    // Conecta o socket e autentica no servidor
    // ----------------------------------------------------------------
    const perfilSocket = useRef(null);
    const handlersOk   = useRef(false);

    const autenticarSocket = useCallback(async () => {
        const perfil = perfilSocket.current;
        if (!perfil) return;
        // Avatar base64 pode ter centenas de KB — enviamos apenas URLs
        const avatarSocket = perfil.avatar?.startsWith('data:') ? '' : (perfil.avatar || '');
        // idToken: prova real de identidade, verificada no servidor
        // (admin.auth().verifyIdToken). O uid sozinho não basta — é
        // público (aparece pra outros jogadores na mesma mesa), então
        // sem o token qualquer um podia se autenticar como outra pessoa.
        const idToken = await auth.currentUser?.getIdToken();
        socket.emit('autenticar', {
            uid:    perfil.uid,
            nome:   perfil.nome,
            avatar: avatarSocket,
            idToken,
        });
    }, []);

    const conectarSocket = useCallback((perfil) => {
        perfilSocket.current = perfil;
        // Listeners registrados UMA vez só (antes eram empilhados a cada
        // chamada, e nunca registrados se o socket já estivesse conectado —
        // o que acontece quando o CriarPin conecta o socket durante o cadastro).
        if (!handlersOk.current) {
            handlersOk.current = true;
            // .on (não .once): precisa reautenticar em TODA reconexão, não só
            // na primeira. Depois de uma queda de WebSocket o Socket.io
            // reconecta sozinho, mas o servidor vê isso como uma conexão nova
            // (perde socket.data e a sala da mesa) — sem reautenticar de novo
            // aqui, o jogador virava "fantasma": parava de receber atualização
            // de estado e os cliques de ação (fold/call/raise) não faziam nada.
            socket.on('connect',    autenticarSocket);
            socket.on('disconnect', (m) => console.warn('Desconectado:', m));
            socket.on('erro',       ({ mensagem }) => console.error('Erro servidor:', mensagem));
        }
        if (socket.connected) autenticarSocket();
        else socket.connect();
    }, [autenticarSocket]);

    // ----------------------------------------------------------------
    // Monitora sessão Firebase e carrega perfil do Firestore
    // ----------------------------------------------------------------
    useEffect(() => {
        const cancelar = onAuthStateChanged(auth, async (userFirebase) => {
            if (userFirebase) {
                try {
                    const snap = await getDoc(doc(db, 'jogadores', userFirebase.uid));
                    if (snap.exists()) {
                        const d = snap.data();
                        const perfil = {
                            uid:            userFirebase.uid,
                            nome:           d.nome            || '',
                            avatar:         d.avatar          || '',
                            saldo:          d.saldo           ?? 0,
                            saldoBonus:     d.saldoBonus      ?? 0,
                            sacadoHoje:     d.sacadoHoje      ?? 0,
                            bonusResgatado: d.bonusResgatado  ?? false,
                            rankPontos:     d.rankPontos      ?? 0,
                            tema:           d.tema            || 'classico',
                            temasComprados: d.temasComprados  || [],
                            // Nunca guardamos o hash em si — só se existe ou não,
                            // pra saber se mostra "criar PIN" ou "alterar PIN".
                            temPin:         !!d.pinHash,
                            dadosBancarios: d.dadosBancarios  || {},
                            // Só pra decidir se mostra a aba Admin na tela —
                            // a proteção de verdade é no servidor (socket.data.isAdmin
                            // em server.js/autenticar, lido com o Admin SDK).
                            isAdmin:        !!d.isAdmin,
                        };
                        setUsuario(perfil);
                        conectarSocket(perfil);
                        setTela(TELAS.LOBBY);
                    } else {
                        setTela(TELAS.AUTH);
                    }
                } catch (e) {
                    console.error('Erro ao carregar perfil:', e);
                    // "permission-denied" pode ser regra do Firestore ou ad-blocker bloqueando a requisição
                    const bloqueado = e?.code === 'permission-denied'
                        || e?.message?.toLowerCase().includes('permission')
                        || e?.message?.toLowerCase().includes('blocked');
                    if (bloqueado) {
                        setErroGlobal(
                            'Não foi possível carregar seu perfil. Se tiver um bloqueador de anúncios ativo, desative-o para este site e recarregue a página.'
                        );
                    }
                    setTela(TELAS.AUTH);
                }
            } else {
                setUsuario(null);
                socket.disconnect();
                setTela(TELAS.AUTH);
            }
        });
        return () => cancelar();
    }, [conectarSocket]);

    // ----------------------------------------------------------------
    // uid como string primitiva — dependência segura para o useEffect
    // Os handlers usam setUsuario(prev => ...) então não precisam
    // de `usuario` no closure, evitando re-registros desnecessários.
    // ----------------------------------------------------------------
    const uid = usuario?.uid ?? null;

    useEffect(() => {
        if (!uid) return;

        // Tema ativado com sucesso → atualiza em tempo real na UI
        const onTemaAtivado = ({ temaId }) => {
            setUsuario(prev => prev ? { ...prev, tema: temaId } : prev);
        };

        // Tema comprado → adiciona à lista de comprados + atualiza saldo
        const onTemaComprado = ({ temaId, novoSaldo, novoBonus }) => {
            setUsuario(prev => {
                if (!prev) return prev;
                const jaTemTema = prev.temasComprados.includes(temaId);
                return {
                    ...prev,
                    saldo:          novoSaldo  ?? prev.saldo,
                    saldoBonus:     novoBonus  ?? prev.saldoBonus,
                    temasComprados: jaTemTema
                        ? prev.temasComprados
                        : [...prev.temasComprados, temaId],
                };
            });
        };

        // Saldo atualizado (depósito, saque, prêmio de mesa...)
        const onSaldoAtualizado = ({ saldo, saldoBonus, sacadoHoje }) => {
            setUsuario(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    saldo:      saldo      ?? prev.saldo,
                    saldoBonus: saldoBonus ?? prev.saldoBonus,
                    sacadoHoje: sacadoHoje ?? prev.sacadoHoje,
                };
            });
        };

        // Erro de tema (saldo insuficiente, já comprado, etc.)
        const onTemaErro = ({ mensagem }) => {
            console.warn('tema:erro →', mensagem);
            // O componente TemasCartas exibe o erro via onFeedback
            // Aqui apenas logamos para debugging
        };

        // PIN criado pela primeira vez → libera depósito/saque sem precisar recarregar
        const onPinCriado = () => {
            setUsuario(prev => prev ? { ...prev, temPin: true } : prev);
        };

        socket.on('tema:ativado',          onTemaAtivado);
        socket.on('tema:comprado',         onTemaComprado);
        socket.on('wallet:saldo_atualizado', onSaldoAtualizado);
        socket.on('tema:erro',             onTemaErro);
        socket.on('wallet:pin_criado',     onPinCriado);

        return () => {
            socket.off('tema:ativado',           onTemaAtivado);
            socket.off('tema:comprado',          onTemaComprado);
            socket.off('wallet:saldo_atualizado', onSaldoAtualizado);
            socket.off('tema:erro',              onTemaErro);
            socket.off('wallet:pin_criado',      onPinCriado);
        };
    }, [uid]); // uid é string primitiva — comparação segura

    // ----------------------------------------------------------------
    // Handlers de navegação
    // ----------------------------------------------------------------
    const handleAutenticado = useCallback((perfil) => {
        // Perfis vindos do Login/Cadastro são dados crus do Firestore: sem
        // o campo temPin. Normaliza (nunca guarda o hash em si no estado).
        const { pinHash, ...resto } = perfil;
        setUsuario({ ...resto, temPin: perfil.temPin ?? !!pinHash });
        conectarSocket(perfil);
        setTela(TELAS.LOBBY);
    }, [conectarSocket]);

    const handleEntrarMesa = useCallback((mesaId) => {
        setMesaAtual(mesaId);
        setTela(TELAS.JOGO);
    }, []);

    // Torneio cancelado sem jogadores: mostra a mensagem e leva o jogador
    // para a aba Torneio do lobby (de qualquer tela em que ele esteja).
    const [avisoTorneio, setAvisoTorneio] = useState(null);
    useEffect(() => {
        const onCancelado = ({ mensagem } = {}) => {
            setAvisoTorneio({ mensagem: mensagem || 'O torneio foi cancelado por falta de jogadores.', em: Date.now() });
            setMesaAtual(null);
            setTela(t => (t === TELAS.JOGO ? TELAS.LOBBY : t));
        };
        socket.on('torneio:cancelado_sem_jogadores', onCancelado);
        return () => socket.off('torneio:cancelado_sem_jogadores', onCancelado);
    }, []);

    // Crédito de saída de mesa / prêmio de torneio: mostra no lobby quanto
    // voltou como saldo real e quanto como bônus (o servidor faz a conta).
    const [avisoCredito, setAvisoCredito] = useState(null);
    useEffect(() => {
        const fmt = n => (Number(n) || 0).toLocaleString('pt-BR');
        const onCredito = ({ origem, real = 0, bonus = 0 } = {}) => {
            if (real <= 0 && bonus <= 0) return;
            const partes = [];
            if (real  > 0) partes.push(`₿C ${fmt(real)} de saldo real`);
            if (bonus > 0) partes.push(`₿C ${fmt(bonus)} de bônus`);
            const inicio = origem === 'torneio' ? 'Prêmio do torneio:'
                : origem === 'inatividade' ? 'Você saiu da mesa por inatividade. Voltaram'
                : 'Voltaram';
            setAvisoCredito({ mensagem: `${inicio} ${partes.join(' e ')} para sua carteira.`, em: Date.now() });
        };
        socket.on('wallet:credito_recebido', onCredito);
        return () => socket.off('wallet:credito_recebido', onCredito);
    }, []);

    const handleSairMesa = useCallback(() => {
        // Game já emite 'sair_mesa' internamente; aqui apenas limpa o estado local
        setMesaAtual(null);
        setTela(TELAS.LOBBY);
    }, []);

    // ----------------------------------------------------------------
    // Telas
    // ----------------------------------------------------------------
    if (tela === TELAS.CARREGANDO) return (
        <div className="tela-carregando" role="status">
            <div className="marca" translate="no">
                <span className="marca-selo num" aria-hidden="true">₿C</span>
                <span className="marca-nome">Bitchager</span>
            </div>
            <span className="roda-carregando" aria-hidden="true" />
            <p>Verificando sessão…</p>
        </div>
    );

    if (tela === TELAS.AUTH) {
        return (
            <>
                {erroGlobal && (
                    <div style={{
                        position:   'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                        background: 'var(--cor-perigo-suave)',
                        border:     '1px solid var(--cor-perigo-linha)',
                        borderTop:  'none',
                        borderRadius: '0 0 10px 10px',
                        padding:    '12px 20px',
                        display:    'flex', alignItems: 'center', gap: '10px',
                        fontFamily: 'var(--fonte)',
                    }}>
                        <span style={{ fontSize: '18px' }}>⚠️</span>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--cor-perigo-texto)', flex: 1 }}>
                            {erroGlobal}
                        </p>
                        <button
                            onClick={() => setErroGlobal(null)}
                            style={{ background: 'none', border: 'none', color: 'var(--cor-perigo-texto)', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                        >×</button>
                    </div>
                )}
                <Auth onAutenticado={handleAutenticado} socket={socket} />
            </>
        );
    }

    if (tela === TELAS.JOGO) {
        return (
            <Game
                socket={socket}
                usuario={usuario}
                mesaId={mesaAtual}
                onSair={handleSairMesa}
            />
        );
    }

    // Conta sem PIN (ex.: fechou/recarregou a página no meio do cadastro):
    // não entra no Lobby até criar o PIN.
    if (usuario && usuario.temPin === false) {
        return (
            <Auth
                // key diferente da tela de login: sem isso o React reaproveita
                // o Auth já montado (preso em 'login') e o CriarPin nunca aparece.
                key="sem-pin"
                onAutenticado={handleAutenticado}
                socket={socket}
                usuarioSemPin={usuario}
            />
        );
    }

    return (
        <Lobby
            usuario={usuario}
            socket={socket}
            onEntrarMesa={handleEntrarMesa}
            onUsuarioAtualizado={setUsuario}
            conviteTorneio={conviteTorneio}
            conviteMesa={conviteMesa}
            avisoTorneio={avisoTorneio}
            onFecharAvisoTorneio={() => setAvisoTorneio(null)}
            avisoCredito={avisoCredito}
            onFecharAvisoCredito={() => setAvisoCredito(null)}
        />
    );
}
