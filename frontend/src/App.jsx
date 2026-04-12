/* ================================================================
   ARQUIVO: frontend/src/App.jsx

   MUDANÇAS DESTA VERSÃO:
   → Escuta 'tema:ativado'  → atualiza usuario.tema em tempo real
   → Escuta 'tema:comprado' → atualiza temasComprados + saldo
   → Escuta 'wallet:saldo_atualizado' → mantém saldo sincronizado
   → Passa setUsuario para Lobby para atualizações locais
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged }               from 'firebase/auth';
import { doc, getDoc }                      from 'firebase/firestore';
import { io }                               from 'socket.io-client';
import { auth, db }                         from './services/firebase-config';
import Auth                                 from './pages/Auth/index';
import Lobby                                from './pages/Lobby/index';
import Game                                 from './pages/Game/index';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

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

    // ----------------------------------------------------------------
    // Conecta o socket e autentica no servidor
    // ----------------------------------------------------------------
    const conectarSocket = useCallback((perfil) => {
        if (socket.connected) return;
        socket.connect();
        socket.once('connect', () => {
            socket.emit('autenticar', {
                uid:    perfil.uid,
                nome:   perfil.nome,
                avatar: perfil.avatar || '',
            });
        });
        socket.on('disconnect', (m) => console.warn('Desconectado:', m));
        socket.on('erro',       ({ mensagem }) => console.error('Erro servidor:', mensagem));
    }, []);

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
                        };
                        setUsuario(perfil);
                        conectarSocket(perfil);
                        setTela(TELAS.LOBBY);
                    } else {
                        setTela(TELAS.AUTH);
                    }
                } catch (e) {
                    console.error('Erro ao carregar perfil:', e);
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

        socket.on('tema:ativado',          onTemaAtivado);
        socket.on('tema:comprado',         onTemaComprado);
        socket.on('wallet:saldo_atualizado', onSaldoAtualizado);
        socket.on('tema:erro',             onTemaErro);

        return () => {
            socket.off('tema:ativado',           onTemaAtivado);
            socket.off('tema:comprado',          onTemaComprado);
            socket.off('wallet:saldo_atualizado', onSaldoAtualizado);
            socket.off('tema:erro',              onTemaErro);
        };
    }, [uid]); // uid é string primitiva — comparação segura

    // ----------------------------------------------------------------
    // Handlers de navegação
    // ----------------------------------------------------------------
    const handleAutenticado = useCallback((perfil) => {
        setUsuario(perfil);
        conectarSocket(perfil);
        setTela(TELAS.LOBBY);
    }, [conectarSocket]);

    const handleEntrarMesa = useCallback((mesaId) => {
        setMesaAtual(mesaId);
        setTela(TELAS.JOGO);
    }, []);

    const handleSairMesa = useCallback(() => {
        socket.emit('sair_mesa');
        setMesaAtual(null);
        setTela(TELAS.LOBBY);
    }, []);

    // ----------------------------------------------------------------
    // Telas
    // ----------------------------------------------------------------
    if (tela === TELAS.CARREGANDO) return (
        <div style={{
            minHeight:      '100vh',
            background:     '#0a0f1e',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            '32px',
            fontFamily:     'sans-serif',
        }}>
            <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px' }}>
                <img src="/logo.png" alt="Poker Game"
                    style={{ width:'80px', height:'80px', objectFit:'contain' }} />
                <h1 style={{ fontSize:'32px', fontWeight:'800', color:'#F8FAFC', margin:0 }}>
                    Poker Game
                </h1>
                <p style={{ fontSize:'13px', color:'#D97706', margin:0 }}>
                    Powered by BC Bitchager
                </p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
                <div style={{
                    width:'36px', height:'36px',
                    border:'3px solid rgba(255,255,255,0.1)',
                    borderTop:'3px solid #7C3AED',
                    borderRadius:'50%',
                    animation:'girar 0.8s linear infinite',
                }} />
                <p style={{ fontSize:'14px', color:'rgba(255,255,255,0.4)', margin:0 }}>
                    Verificando sessão...
                </p>
            </div>
        </div>
    );

    if (tela === TELAS.AUTH) {
        return <Auth onAutenticado={handleAutenticado} socket={socket} />;
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

    return (
        <Lobby
            usuario={usuario}
            socket={socket}
            onEntrarMesa={handleEntrarMesa}
            onUsuarioAtualizado={setUsuario}
        />
    );
}
