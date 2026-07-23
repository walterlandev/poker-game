/* ================================================================
   ARQUIVO: frontend/src/pages/Game/InfoMesa.jsx

   CONCEITO GERAL:
   Painel de informações da mesa exibido no topo da tela do jogo.
   Mostra ao jogador os dados essenciais da partida em andamento:
     → Nome da mesa
     → Fase atual (Pré-Flop, Flop, Turn, River, Showdown)
     → Pote total acumulado
     → Blinds (Small Blind e Big Blind)
     → Maior aposta atual da rodada

   POR QUE ESSAS INFORMAÇÕES SÃO IMPORTANTES:
     Pote       → quanto o jogador pode ganhar se vencer
     Fase       → em qual momento da mão estamos
     Big Blind  → referência para calcular apostas (ex: "abrir 3x o BB")
     Maior Aposta → quanto precisa pagar para continuar (call)

   DESIGN:
   Compacto e horizontal para não ocupar muito espaço na tela mobile.
   As informações mais importantes (pote e fase) ficam em destaque.
   Blinds ficam em tamanho menor pois mudam menos durante a mão.

   PROPS:
     mesa → objeto completo do estado da mesa
            { nome, fase, pote, smallBlind, bigBlind, maiorAposta }
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

// Mapeamento de fase para label amigável e cor
const CONFIG_FASE = {
    'AGUARDANDO': { label: 'Aguardando',  cor: '#6B7280', icone: '⏳' },
    'PRE-FLOP':   { label: 'Pré-Flop',   cor: '#3B82F6', icone: '🃏' },
    'FLOP':       { label: 'Flop',        cor: '#10B981', icone: '🃏' },
    'TURN':       { label: 'Turn',        cor: '#F59E0B', icone: '🃏' },
    'RIVER':      { label: 'River',       cor: '#EF4444', icone: '🃏' },
    'SHOWDOWN':   { label: 'Showdown',    cor: '#8B5CF6', icone: '🏆' },
};

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function InfoMesa({ mesa }) {

    if (!mesa) return null;

    const configFase  = CONFIG_FASE[mesa.fase] || CONFIG_FASE['AGUARDANDO'];
    const temAposta   = (mesa.maiorAposta || 0) > 0;

    return (
        <div style={estilos.container}>

            {/* Nome */}
            <p style={estilos.nomeMesa}>
                {mesa.nome || 'Mesa'}
            </p>

            {/* Badge fase */}
            <div style={{
                ...estilos.badgeFase,
                background: `${configFase.cor}20`,
                border:     `1px solid ${configFase.cor}50`,
                color:       configFase.cor,
            }}>
                {mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN' && (
                    <span style={{ ...estilos.pontoPulsante, background: configFase.cor }} />
                )}
                {configFase.label}
            </div>

            <Separador />

            {/* Pote */}
            <InfoItem label="Pote" valor={`₿C ${fmt(mesa.pote)}`} corValor="#F59E0B" />

            <Separador />

            {/* BB */}
            <InfoItem label="BB" valor={fmt(mesa.bigBlind)} corValor="#94A3B8" />

            {/* Call */}
            {temAposta && (
                <>
                    <Separador />
                    <InfoItem label="Call" valor={`₿C ${fmt(mesa.maiorAposta)}`} corValor="#22C55E" />
                </>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTES AUXILIARES
// ================================================================

// Item de informação com label e valor
// destaque → valor em tamanho maior
function InfoItem({ label, valor, corValor = '#F8FAFC' }) {
    return (
        <div style={estilos.infoItem}>
            <span style={estilos.infoLabel}>{label}</span>
            <span style={{ ...estilos.infoValor, color: corValor, fontSize:'11px', fontWeight:'600' }}>
                {valor}
            </span>
        </div>
    );
}

// Separador vertical entre os itens
function Separador() {
    return <div style={estilos.separador} />;
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Uma única linha horizontal — compacta
    container: {
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        flex:        1,
        minWidth:    0,
        padding:     '0 10px',
        overflowX:   'auto',
        scrollbarWidth: 'none',
    },

    nomeMesa: {
        fontSize:     '12px',
        fontWeight:   '600',
        color:        '#F8FAFC',
        margin:       0,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        flexShrink:   1,
        minWidth:     0,
    },

    badgeFase: {
        display:      'flex',
        alignItems:   'center',
        gap:          '4px',
        padding:      '2px 7px',
        borderRadius: '12px',
        fontSize:     '10px',
        fontWeight:   '600',
        flexShrink:   0,
        whiteSpace:   'nowrap',
    },

    pontoPulsante: {
        width:        '5px',
        height:       '5px',
        borderRadius: '50%',
        display:      'inline-block',
        animation:    'pulse 1.5s ease-in-out infinite',
        flexShrink:   0,
    },

    infoItem: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '1px',
        flexShrink:    0,
    },

    infoLabel: {
        fontSize:      '8px',
        color:         'rgba(255,255,255,0.30)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        lineHeight:    1,
    },

    infoValor: {
        lineHeight: 1,
        whiteSpace: 'nowrap',
    },

    separador: {
        width:     '1px',
        height:    '20px',
        background:'rgba(255,255,255,0.08)',
        flexShrink: 0,
    },
};
