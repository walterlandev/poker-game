/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Tabs.jsx

   Navegação entre as seções do lobby.
     → celular: barra fixa embaixo (zona do polegar), ícone + rótulo
     → desktop: dentro do cabeçalho, em linha
   Uma cor só para a seção ativa (latão). Admin aparece só para admin.

   PROPS:
     tabAtiva    → id da seção ativa ('mesas', 'carteira'...)
     onMudar     → function(tabId)
     qtdPublicas / qtdPrivadas → somadas no contador de Mesas
     qtdTorneios → contador de Torneio
     isAdmin     → mostra a seção Admin
================================================================ */

import Icone from '../../components/Icone';

const DEFINICAO_TABS = [
    { id: 'mesas',      label: 'Mesas',    icone: 'mesas',    badgeKey: 'qtdTotal'    },
    { id: 'campeonato', label: 'Torneio',  icone: 'torneio',  badgeKey: 'qtdTorneios' },
    { id: 'ranking',    label: 'Ranking',  icone: 'ranking',  badgeKey: null },
    { id: 'loja',       label: 'Loja',     icone: 'loja',     badgeKey: null },
    { id: 'carteira',   label: 'Carteira', icone: 'carteira', badgeKey: null },
];

const TAB_ADMIN = { id: 'admin', label: 'Admin', icone: 'admin', badgeKey: null };

export default function Tabs({ tabAtiva, onMudar, qtdPublicas = 0, qtdPrivadas = 0, qtdTorneios = 0, isAdmin = false }) {
    const badges = {
        qtdTotal: qtdPublicas + qtdPrivadas,
        qtdTorneios,
    };
    const tabs = isAdmin ? [...DEFINICAO_TABS, TAB_ADMIN] : DEFINICAO_TABS;

    return (
        <nav className={`nav-secoes${isAdmin ? ' com-admin' : ''}`} aria-label="Seções do lobby">
            {tabs.map(tab => {
                const ativa = tabAtiva === tab.id;
                const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        className="nav-item"
                        aria-current={ativa ? 'page' : undefined}
                        onClick={() => onMudar(tab.id)}
                    >
                        <span className="nav-icone">
                            <Icone nome={tab.icone} tamanho={22} />
                            {badge > 0 && <span className="nav-badge num">{badge > 99 ? '99+' : badge}</span>}
                        </span>
                        <span className="nav-rotulo">{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
