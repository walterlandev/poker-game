import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { io } from "socket.io-client";
import { auth, db } from "./services/firebase-config";
import Auth from "./pages/Auth/index";
import Lobby from "./pages/Lobby/index";
import Game from "./pages/Game/index";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SERVER_URL, { autoConnect: false, reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 5 });
const TELAS = { CARREGANDO: "carregando", AUTH: "auth", LOBBY: "lobby", JOGO: "jogo" };

export default function App() {
    const [tela, setTela] = useState(TELAS.CARREGANDO);
    const [usuario, setUsuario] = useState(null);
    const [mesaAtual, setMesaAtual] = useState(null);

    const conectarSocket = useCallback((perfil) => {
        if (socket.connected) return;
        socket.connect();
        socket.once("connect", () => {
            socket.emit("autenticar", { uid: perfil.uid, nome: perfil.nome, avatar: perfil.avatar || "" });
        });
        socket.on("disconnect", (m) => console.warn("Desconectado:", m));
        socket.on("erro", ({ mensagem }) => console.error("Erro:", mensagem));
    }, []);

    useEffect(() => {
        const cancelar = onAuthStateChanged(auth, async (userFirebase) => {
            if (userFirebase) {
                try {
                    const snap = await getDoc(doc(db, "jogadores", userFirebase.uid));
                    if (snap.exists()) {
                        const perfil = {
                            uid: userFirebase.uid,
                            nome: snap.data().nome || "",
                            avatar: snap.data().avatar || "",
                            saldo: snap.data().saldo ?? 0,
                            saldoBonus: snap.data().saldoBonus ?? 0,
                            sacadoHoje: snap.data().sacadoHoje ?? 0,
                            bonusResgatado: snap.data().bonusResgatado ?? false,
                            rankPontos: snap.data().rankPontos ?? 0,
                            tema: snap.data().tema || "classico",
                            temasComprados: snap.data().temasComprados || [],
                        };
                        setUsuario(perfil);
                        conectarSocket(perfil);
                        setTela(TELAS.LOBBY);
                    } else {
                        setTela(TELAS.AUTH);
                    }
                } catch (e) {
                    console.error("Erro perfil:", e);
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

    const handleAutenticado = useCallback((perfil) => {
        setUsuario(perfil); conectarSocket(perfil); setTela(TELAS.LOBBY);
    }, [conectarSocket]);

    const handleEntrarMesa = useCallback((mesaId) => {
        setMesaAtual(mesaId); setTela(TELAS.JOGO);
    }, []);

    const handleSairMesa = useCallback(() => {
        socket.emit("sair_mesa"); setMesaAtual(null); setTela(TELAS.LOBBY);
    }, []);

    if (tela === TELAS.CARREGANDO) return (
        <div style={{ minHeight:"100vh", background:"#0a0f1e", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"32px", fontFamily:"sans-serif" }}>
            <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
                <img src="/logo.png" alt="Poker Game" style={{ width:"80px", height:"80px", objectFit:"contain" }} />
                <h1 style={{ fontSize:"32px", fontWeight:"800", color:"#F8FAFC", margin:0 }}>Poker Game</h1>
                <p style={{ fontSize:"13px", color:"#D97706", margin:0 }}>Powered by BC Bitchager</p>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
                <div style={{ width:"36px", height:"36px", border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #7C3AED", borderRadius:"50%", animation:"girar 0.8s linear infinite" }} />
                <p style={{ fontSize:"14px", color:"rgba(255,255,255,0.4)", margin:0 }}>Verificando sessao...</p>
            </div>
        </div>
    );

    if (tela === TELAS.AUTH) return <Auth onAutenticado={handleAutenticado} socket={socket} />;
    if (tela === TELAS.JOGO) return <Game socket={socket} usuario={usuario} mesaId={mesaAtual} onSair={handleSairMesa} />;
    return <Lobby usuario={usuario} socket={socket} onEntrarMesa={handleEntrarMesa} />;
}
