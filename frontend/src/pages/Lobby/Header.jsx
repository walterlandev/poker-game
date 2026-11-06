/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Header.jsx

   Cabeçalho do lobby: marca, navegação (desktop; no celular a mesma
   navegação vira barra fixa embaixo), saldo ₿C e menu do avatar.

     → saldo: abre a Carteira; o "+" / "Comprar ₿C" abre a Loja
     → avatar: menu com Perfil, Configurações e Sair

   PROPS:
     usuario              → { uid, nome, avatar, saldo, saldoBonus, rankPontos }
     navegacao            → elemento <Tabs /> já montado pelo Lobby
     onAbrirLoja          → abre a loja para comprar ₿C
     onAbrirCarteira      → abre a carteira do jogador
     onAbrirPerfil        → abre o modal de perfil
     onAbrirConfiguracoes → abre o modal de configurações
     onLogout             → desloga o jogador
================================================================ */

import { useState, useEffect } from 'react';
import Icone from '../../components/Icone';

function calcularRank(rankPontos = 0) {
    if (rankPontos >= 10000) return 'Lendário';
    if (rankPontos >= 5000)  return 'Mestre';
    if (rankPontos >= 2000)  return 'Avançado';
    if (rankPontos >= 500)   return 'Intermediário';
    return 'Iniciante';
}

function formatarSaldo(valor = 0) {
    return Number(valor).toLocaleString('pt-BR');
}

export default function Header({ usuario, navegacao, onAbrirLoja, onAbrirCarteira, onAbrirPerfil, onAbrirConfiguracoes, onLogout }) {
    const [menuAberto, setMenuAberto] = useState(false);
    const rank   = calcularRank(usuario?.rankPontos);
    const saldo  = formatarSaldo((usuario?.saldo || 0) + (usuario?.saldoBonus || 0));
    const avatarFallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${usuario?.uid || 'default'}`;

    // Esc fecha o menu
    useEffect(() => {
        if (!menuAberto) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setMenuAberto(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuAberto]);

    const escolher = (fn) => () => { fn?.(); setMenuAberto(false); };

    return (
        <header className="lobby-topo">
            <div className="marca" translate="no">
                <span className="marca-selo num" aria-hidden="true">₿C</span>
                <span className="marca-nome">Bitchager</span>
            </div>

            {navegacao}

            <div className="lobby-topo-dir">
                <div className="saldo-grupo">
                    <button type="button" className="saldo-btn" onClick={onAbrirCarteira} aria-label={`Abrir carteira, saldo ₿C ${saldo}`}>
                        <span className="rot">Saldo</span>
                        <b className="num cor-bc">₿C {saldo}</b>
                    </button>
                    <button type="button" className="comprar-btn" onClick={onAbrirLoja} aria-label="Comprar ₿C">
                        <Icone nome="mais" tamanho={16} />
                        <span className="txt">Comprar ₿C</span>
                    </button>
                </div>

                <div className="perfil-menu">
                    <button
                        type="button"
                        className="perfil-btn"
                        onClick={() => setMenuAberto(m => !m)}
                        aria-expanded={menuAberto}
                        aria-haspopup="menu"
                        aria-label="Perfil, configurações e sair"
                    >
                        <img
                            src={usuario?.avatar || avatarFallback}
                            alt=""
                            width={36}
                            height={36}
                            onError={e => { e.target.onerror = null; e.target.src = avatarFallback; }}
                        />
                        <span className="txt">
                            <b>{usuario?.nome || 'Jogador'}</b>
                            <span>{rank}, <span className="num">{formatarSaldo(usuario?.rankPontos || 0)}</span> pts</span>
                        </span>
                        <Icone nome="desce" tamanho={16} className="seta" />
                    </button>

                    {menuAberto && (
                        <>
                            <div className="menu-veu" onClick={() => setMenuAberto(false)} />
                            <div className="menu-suspenso" role="menu">
                                <div className="menu-cab">
                                    <b>{usuario?.nome || 'Jogador'}</b>
                                    <span>{rank}, {formatarSaldo(usuario?.rankPontos || 0)} pts</span>
                                </div>
                                <button type="button" role="menuitem" onClick={escolher(onAbrirPerfil)}>
                                    <Icone nome="perfil" />Perfil
                                </button>
                                <button type="button" role="menuitem" onClick={escolher(onAbrirCarteira)}>
                                    <Icone nome="carteira" />Minha carteira
                                </button>
                                <button type="button" role="menuitem" onClick={escolher(onAbrirConfiguracoes)}>
                                    <Icone nome="config" />Configurações
                                </button>
                                <hr />
                                <button type="button" role="menuitem" className="perigo" onClick={escolher(onLogout)}>
                                    <Icone nome="sair" />Sair da conta
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
