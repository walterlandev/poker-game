/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Tabs.jsx

   MUDANÇAS DESTA VERSÃO:
     → Tabs reorganizadas: Carteira | Mesas | Ranking | Loja
     → Carteira é a PRIMEIRA tab (WalletIndex)
     → Mesas agrupa públicas + privadas (sub-filtro interno)
       O badge soma as duas para mostrar o total de mesas
     → Cores atualizadas para refletir a nova identidade

   CONCEITO GERAL:
   Barra de navegação entre as seções do Lobby.
   Cada tab leva para uma seção diferente:
     → Carteira : saldo, depósito, saque, histórico, envio ₿C
     → Mesas    : mesas públicas e privadas (com sub-filtro)
     → Ranking  : top jogadores por saldo ₿C
     → Loja     : comprar ₿C e temas de cartas

   DESIGN MOBILE-FIRST:
   As tabs ficam na parte superior, logo abaixo do Header.
   São botões largos e fáceis de tocar com o polegar.
   A tab ativa tem um indicador visual (linha + cor + texto destacado).

   PROPS:
     tabAtiva    → string: id da tab ativa ('carteira', 'mesas', etc.)
     onMudar     → function(tabId): chamada ao trocar de tab
     qtdPublicas → number: quantidade de mesas públicas
     qtdPrivadas → number: quantidade de mesas privadas
     (o badge de Mesas mostra a soma das duas)
================================================================ */


// ================================================================
// BLOCO 1: DEFINIÇÃO DAS TABS
// ================================================================

const DEFINICAO_TABS = [
    {
        id:       'carteira',
        label:    'Carteira',
        icone:    '💳',
        badgeKey: null,
    },
    {
        id:       'mesas',
        label:    'Mesas',
        icone:    '🃏',
        badgeKey: 'qtdTotal',   // soma públicas + privadas
    },
    {
        id:       'campeonato',
        label:    'Torneio',
        icone:    '🏆',
        badgeKey: 'qtdTorneios',
    },
    {
        id:       'ranking',
        label:    'Ranking',
        icone:    '📊',
        badgeKey: null,
    },
    {
        id:       'loja',
        label:    'Loja',
        icone:    '₿C',
        badgeKey: null,
    },
];

// Só aparece pra quem é admin (checagem de verdade é sempre no servidor)
const TAB_ADMIN = {
    id:       'admin',
    label:    'Admin',
    icone:    '🛠️',
    badgeKey: null,
};

// Cor de cada tab quando ativa
const CORES_TABS = {
    carteira:   '#F59E0B',   // âmbar — moeda, carteira
    mesas:      '#7C3AED',   // roxo  — mesas de jogo
    campeonato: '#F59E0B',   // dourado — torneio, troféu
    ranking:    '#22C55E',   // verde — conquista
    loja:       '#D97706',   // laranja — loja, compras
    admin:      '#EF4444',   // vermelho — área restrita
};


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Tabs({ tabAtiva, onMudar, qtdPublicas = 0, qtdPrivadas = 0, qtdTorneios = 0, isAdmin = false }) {

    // Badge de mesas = soma de públicas + privadas
    const badges = {
        qtdTotal:    qtdPublicas + qtdPrivadas,
        qtdTorneios,
    };

    const tabs = isAdmin ? [...DEFINICAO_TABS, TAB_ADMIN] : DEFINICAO_TABS;

    return (
        <nav style={estilos.nav} role="tablist" aria-label="Seções do lobby">

            {tabs.map(tab => {
                const ativa    = tabAtiva === tab.id;
                const corAtiva = CORES_TABS[tab.id];
                const badge    = tab.badgeKey ? badges[tab.badgeKey] : null;

                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={ativa}
                        onClick={() => onMudar(tab.id)}
                        style={{
                            ...estilos.tab,
                            color: ativa ? corAtiva : 'rgba(255,255,255,0.4)',
                            background: ativa
                                ? `${corAtiva}12`
                                : 'transparent',
                        }}
                    >
                        {/* Ícone */}
                        <span style={{
                            fontSize:   tab.id === 'loja' ? '11px' : '15px',
                            fontWeight: tab.id === 'loja' ? '700'  : '400',
                            lineHeight: 1,
                            color:      tab.id === 'loja' && ativa ? '#D97706' : 'inherit',
                        }}>
                            {tab.icone}
                        </span>

                        {/* Label + badge opcional */}
                        <div style={estilos.labelContainer}>
                            <span style={{
                                ...estilos.label,
                                fontWeight: ativa ? '600' : '400',
                            }}>
                                {tab.label}
                            </span>

                            {/* Badge com total de mesas — só aparece se > 0 */}
                            {badge > 0 && (
                                <span style={{
                                    ...estilos.badge,
                                    background: ativa ? corAtiva : 'rgba(255,255,255,0.15)',
                                    color:      ativa ? '#fff'    : 'rgba(255,255,255,0.6)',
                                }}>
                                    {badge > 99 ? '99+' : badge}
                                </span>
                            )}
                        </div>

                        {/* Linha indicadora na base — só aparece na tab ativa */}
                        <div style={{
                            ...estilos.indicador,
                            opacity:    ativa ? 1 : 0,
                            background: corAtiva,
                        }} />

                    </button>
                );
            })}

        </nav>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// (inalterados em relação ao original)
// ================================================================

const estilos = {

    nav: {
        display:         'flex',
        background:      '#0d1424',
        borderBottom:    '1px solid rgba(255,255,255,0.06)',
        overflowX:       'auto',
        scrollbarWidth:  'none',
        msOverflowStyle: 'none',
        WebkitScrollbar: { display: 'none' },
    },

    tab: {
        flex:           1,
        minWidth:       '70px',
        padding:        '8px 4px 0',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '3px',
        border:         'none',
        cursor:         'pointer',
        position:       'relative',
        transition:     'color 0.2s, background 0.2s',
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
        minHeight:      '52px',
    },

    labelContainer: {
        display:    'flex',
        alignItems: 'center',
        gap:        '4px',
    },

    label: {
        fontSize:      '11px',
        lineHeight:    1,
        transition:    'font-weight 0.2s',
        letterSpacing: '-0.01em',
    },

    badge: {
        fontSize:     '9px',
        fontWeight:   '600',
        padding:      '1px 4px',
        borderRadius: '10px',
        lineHeight:   1.4,
        minWidth:     '16px',
        textAlign:    'center',
        transition:   'background 0.2s, color 0.2s',
    },

    indicador: {
        position:     'absolute',
        bottom:       0,
        left:         '20%',
        right:        '20%',
        height:       '2px',
        borderRadius: '2px 2px 0 0',
        transition:   'opacity 0.2s',
    },
};