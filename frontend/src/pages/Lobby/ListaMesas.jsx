/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ListaMesas.jsx

   CONCEITO GERAL:
   Exibe a lista de mesas disponíveis no lobby.
   Cada mesa é um card com as informações principais:
     → Nome da mesa
     → Quantidade de jogadores (ex: 3/9)
     → Blinds (ex: 10/20)
     → Buy-in (ex: ₿C 1.000)
     → Fase atual (Aguardando, Em jogo...)
     → Botão de entrar

   ESTADOS POSSÍVEIS:
     → Carregando  : spinner enquanto busca do servidor
     → Vazia       : nenhuma mesa disponível
     → Com mesas   : lista de cards

   PROPS:
     mesas      → array de objetos de mesa vindo do servidor
     carregando → boolean: true enquanto busca as mesas
     privadas   → boolean: true = tab privadas, false = tab públicas
     onEntrar   → function(mesaId): chamada ao clicar em entrar
================================================================ */


// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

// Retorna cor e texto para a fase da mesa
function infoFase(fase) {
    const mapa = {
        'AGUARDANDO': { cor: '#22C55E', texto: 'Aguardando',  pulsar: true  },
        'PRE-FLOP':   { cor: '#F59E0B', texto: 'Em jogo',     pulsar: false },
        'FLOP':       { cor: '#F59E0B', texto: 'Em jogo',     pulsar: false },
        'TURN':       { cor: '#F59E0B', texto: 'Em jogo',     pulsar: false },
        'RIVER':      { cor: '#F59E0B', texto: 'Em jogo',     pulsar: false },
        'SHOWDOWN':   { cor: '#EF4444', texto: 'Showdown',    pulsar: false },
    };
    return mapa[fase] || { cor: '#6B7280', texto: fase || 'Desconhecido', pulsar: false };
}

// Calcula o percentual de ocupação da mesa
function percentualOcupacao(jogadores, max = 9) {
    return Math.round((jogadores / max) * 100);
}

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function ListaMesas({ mesas = [], carregando, privadas, onEntrar }) {

    // ---- Estado de carregamento ----
    if (carregando) {
        return (
            <div style={estilos.centralizado}>
                <Spinner />
                <p style={estilos.textoMuted}>Buscando mesas...</p>
            </div>
        );
    }

    // ---- Lista vazia ----
    if (mesas.length === 0) {
        return (
            <div style={estilos.centralizado}>
                <span style={{ fontSize: '48px', lineHeight: 1 }}>
                    {privadas ? '🔒' : '🎴'}
                </span>
                <p style={estilos.textoVazio}>
                    {privadas
                        ? 'Nenhuma mesa privada disponível'
                        : 'Nenhuma mesa pública disponível'
                    }
                </p>
                <p style={estilos.textoMuted}>
                    {privadas
                        ? 'Peça um convite a um amigo ou crie sua mesa'
                        : 'Crie uma mesa e convide jogadores'
                    }
                </p>
            </div>
        );
    }

    // ---- Lista de cards ----
    return (
        <div style={estilos.lista}>

            {/* Contador de mesas */}
            <p style={estilos.contador}>
                {mesas.length} {mesas.length === 1 ? 'mesa' : 'mesas'} disponíve{mesas.length === 1 ? 'l' : 'is'}
            </p>

            {/* Um card para cada mesa */}
            {mesas.map(mesa => (
                <CardMesa
                    key={mesa.id}
                    mesa={mesa}
                    privada={privadas}
                    onEntrar={onEntrar}
                />
            ))}

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE CardMesa
//
// Responsável por exibir as informações de UMA mesa.
// Separado em componente próprio para manter o código organizado.
// ================================================================

function CardMesa({ mesa, privada, onEntrar }) {

    const fase        = infoFase(mesa.fase);
    const qtdJogadores = Object.keys(mesa.jogadores || {}).length;
    const pctOcupacao  = percentualOcupacao(qtdJogadores);
    const estaCheia    = qtdJogadores >= 9;
    const emJogo       = mesa.fase !== 'AGUARDANDO';

    return (
        <div style={estilos.card}>

            {/* ---- Linha superior: nome + fase ---- */}
            <div style={estilos.cardTopo}>

                {/* Nome da mesa + ícone de privada */}
                <div style={estilos.nomeMesa}>
                    {privada && (
                        <span style={estilos.iconeLock}>🔒</span>
                    )}
                    <span style={estilos.textoNome}>
                        {mesa.nome || `Mesa ${mesa.id}`}
                    </span>
                </div>

                {/* Badge de fase com pulsação se aguardando */}
                <div style={{
                    ...estilos.badgeFase,
                    background: `${fase.cor}18`,
                    border:     `1px solid ${fase.cor}40`,
                    color:       fase.cor,
                }}>
                    {fase.pulsar && <span style={estilos.pontoPulsar(fase.cor)} />}
                    {fase.texto}
                </div>

            </div>

            {/* ---- Linha do meio: informações da mesa ---- */}
            <div style={estilos.infoGrid}>

                {/* Buy-in */}
                <InfoItem
                    label="Buy-in"
                    valor={`₿C ${fmt(mesa.buyIn || mesa.valorBuyIn)}`}
                    corValor="#F59E0B"
                />

                {/* Blinds */}
                <InfoItem
                    label="Blinds"
                    valor={`${fmt(mesa.smallBlind)}/${fmt(mesa.bigBlind)}`}
                />

                {/* Jogadores */}
                <InfoItem
                    label="Jogadores"
                    valor={`${qtdJogadores}/9`}
                    corValor={estaCheia ? '#EF4444' : '#F8FAFC'}
                />

            </div>

            {/* ---- Barra de ocupação ---- */}
            <div style={estilos.barraContainer}>
                <div style={estilos.barraFundo}>
                    <div style={{
                        ...estilos.barraPreenchimento,
                        width:      `${pctOcupacao}%`,
                        background: estaCheia ? '#EF4444' : '#22C55E',
                    }} />
                </div>
                <span style={estilos.barraTexto}>{pctOcupacao}%</span>
            </div>

            {/* ---- Botão de entrar ---- */}
            <button
                onClick={() => onEntrar(mesa.id)}
                disabled={estaCheia}
                style={{
                    ...estilos.btnEntrar,
                    background: estaCheia
                        ? 'rgba(255,255,255,0.05)'
                        : emJogo
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(34,197,94,0.15)',
                    border: estaCheia
                        ? '1px solid rgba(255,255,255,0.1)'
                        : emJogo
                            ? '1px solid rgba(245,158,11,0.4)'
                            : '1px solid rgba(34,197,94,0.4)',
                    color: estaCheia
                        ? 'rgba(255,255,255,0.3)'
                        : emJogo
                            ? '#F59E0B'
                            : '#22C55E',
                    cursor: estaCheia ? 'not-allowed' : 'pointer',
                }}
            >
                {estaCheia ? 'Mesa Cheia' : emJogo ? 'Observar / Entrar' : 'Entrar na Mesa'}
            </button>

        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTES AUXILIARES PEQUENOS
// ================================================================

// Item de informação: label em cima, valor em baixo
function InfoItem({ label, valor, corValor = '#F8FAFC' }) {
    return (
        <div style={estilos.infoItem}>
            <span style={estilos.infoLabel}>{label}</span>
            <span style={{ ...estilos.infoValor, color: corValor }}>{valor}</span>
        </div>
    );
}

// Spinner de carregamento animado com CSS
function Spinner() {
    return (
        <div style={estilos.spinner}>
            <div style={{
                width:        '32px',
                height:       '32px',
                border:       '3px solid rgba(255,255,255,0.1)',
                borderTop:    '3px solid #7C3AED',
                borderRadius: '50%',
                animation:    'girar 0.8s linear infinite',
            }} />
        </div>
    );
}


// ================================================================
// BLOCO 5: ESTILOS
// ================================================================

const estilos = {

    // Container centralizado (para estados de carregamento e vazio)
    centralizado: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '12px',
        padding:        '48px 20px',
        textAlign:      'center',
    },

    // Texto de mesa vazia
    textoVazio: {
        fontSize:   '15px',
        fontWeight: '500',
        color:      '#F8FAFC',
        margin:     0,
    },

    // Texto secundário apagado
    textoMuted: {
        fontSize: '13px',
        color:    'rgba(255,255,255,0.35)',
        margin:   0,
    },

    // Container da lista de cards
    lista: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '10px',
    },

    // Contador de mesas no topo da lista
    contador: {
        fontSize:      '11px',
        color:         'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin:        '0 0 4px',
    },

    // Card de uma mesa
    card: {
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        padding:      '14px',
        display:      'flex',
        flexDirection: 'column',
        gap:          '10px',
    },

    // Topo do card: nome + fase
    cardTopo: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            '8px',
    },

    // Nome da mesa
    nomeMesa: {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        minWidth:   0,
    },

    iconeLock: {
        fontSize:  '12px',
        flexShrink: 0,
    },

    textoNome: {
        fontSize:     '14px',
        fontWeight:   '600',
        color:        '#F8FAFC',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
    },

    // Badge da fase (Aguardando, Em jogo, etc.)
    badgeFase: {
        display:      'flex',
        alignItems:   'center',
        gap:          '5px',
        padding:      '3px 8px',
        borderRadius: '20px',
        fontSize:     '11px',
        fontWeight:   '500',
        flexShrink:   0,
        whiteSpace:   'nowrap',
    },

    // Ponto pulsante no badge de Aguardando
    pontoPulsar: (cor) => ({
        width:        '6px',
        height:       '6px',
        borderRadius: '50%',
        background:   cor,
        // A animação é definida inline com @keyframes no Spinner
        // Para evitar duplicação, usamos animation direta
        animation:    'pulsar 1.5s ease-in-out infinite',
        flexShrink:   0,
    }),

    // Grid de 3 informações (buy-in, blinds, jogadores)
    infoGrid: {
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:                 '8px',
    },

    // Item individual do grid
    infoItem: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
    },

    infoLabel: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    },

    infoValor: {
        fontSize:   '13px',
        fontWeight: '600',
    },

    // Container da barra de ocupação
    barraContainer: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    barraFundo: {
        flex:         1,
        height:       '4px',
        background:   'rgba(255,255,255,0.08)',
        borderRadius: '2px',
        overflow:     'hidden',
    },

    barraPreenchimento: {
        height:       '100%',
        borderRadius: '2px',
        transition:   'width 0.4s ease',
    },

    barraTexto: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.35)',
        minWidth:  '28px',
        textAlign: 'right',
    },

    // Botão de entrar na mesa
    btnEntrar: {
        width:         '100%',
        padding:       '10px',
        borderRadius:  '8px',
        fontSize:      '13px',
        fontWeight:    '600',
        textAlign:     'center',
        transition:    'opacity 0.15s',
        WebkitTapHighlightColor: 'transparent',
        outline:       'none',
    },

    // Spinner de carregamento
    spinner: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },
};
