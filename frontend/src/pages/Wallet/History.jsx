/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/History.jsx

   CONCEITO GERAL:
   Extrato completo de transações da carteira do jogador.
   Exibe:
     → Resumo do período (entradas, saídas, taxas, saldo)
     → Filtros por tipo e período
     → Lista de transações com detalhes
     → Estado vazio quando não há transações

   DADOS:
     As transações chegam de duas formas:
       1. Carregamento inicial via socket.emit('wallet:buscar_historico')
       2. Novas transações em tempo real via prop 'transacoes' (index pai)

   PROPS:
     transacoes  → array : lista de transações já carregadas pelo pai
     socket      → Socket.io
     onCarregar  → fn(txs) : atualiza o array no pai após fetch inicial
================================================================ */

import { useState, useEffect, useMemo } from 'react';
import {
    fmtBC,
    fmt,
    fmtData,
    corTipoTx,
    sinalTx,
    resumoExtrato,
    bcParaBRL,
    LABEL_TX,
    ICONE_TX,
    TIPO_TX,
} from './walletUtils';


// ================================================================
// BLOCO 1: CONFIGURAÇÃO DE FILTROS
// ================================================================

const FILTROS_TIPO = [
    { id: 'todos',                label: 'Todos'       },
    { id: TIPO_TX.DEPOSITO,       label: 'Depósitos'   },
    { id: TIPO_TX.SAQUE,          label: 'Saques'      },
    { id: TIPO_TX.ENVIO,          label: 'Enviados'    },
    { id: TIPO_TX.RECEBIMENTO,    label: 'Recebidos'   },
    { id: TIPO_TX.PREMIO,         label: 'Prêmios'     },
    { id: TIPO_TX.COMPRA,         label: 'Compras'     },
    { id: TIPO_TX.BONUS,          label: 'Bônus'       },
];

const FILTROS_PERIODO = [
    { id: 'hoje',  label: 'Hoje'       },
    { id: '7d',    label: '7 dias'     },
    { id: '30d',   label: '30 dias'    },
    { id: 'tudo',  label: 'Tudo'       },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function History({ transacoes, socket, onCarregar }) {

    const [filtroTipo,    setFiltroTipo]    = useState('todos');
    const [filtroPeriodo, setFiltroPeriodo] = useState('30d');
    // Inicia como true — já está carregando desde a montagem.
    // setState só ocorre dentro de callbacks do socket, nunca no corpo do effect.
    const [carregando,    setCarregando]    = useState(true);
    const [jaCarregou,    setJaCarregou]    = useState(false);


    // ----------------------------------------------------------------
    // Carrega histórico do backend na primeira vez que a aba abre.
    // setCarregando(true) foi removido do corpo do effect (anti-pattern).
    // ----------------------------------------------------------------
    useEffect(() => {
        if (jaCarregou || !socket) return;

        socket.emit('wallet:buscar_historico', { periodo: filtroPeriodo });

        socket.once('wallet:historico', (data) => {
            onCarregar(data?.transacoes || []);
            setCarregando(false);
            setJaCarregou(true);
        });

        return () => {
            socket.off('wallet:historico');
        };
    }, [socket, jaCarregou]);  // eslint-disable-line


    // ----------------------------------------------------------------
    // Re-busca quando o período muda (após carregamento inicial)
    // ----------------------------------------------------------------
    function handlePeriodo(p) {
        setFiltroPeriodo(p);
        if (!socket) return;
        setCarregando(true);
        // Remove qualquer listener de uma troca de período anterior ainda
        // pendente — sem isso, clicar rápido entre períodos podia aplicar
        // a resposta errada (a que chegasse primeiro) a ambos os pedidos.
        socket.off('wallet:historico');
        socket.emit('wallet:buscar_historico', { periodo: p });
        socket.once('wallet:historico', (data) => {
            onCarregar(data?.transacoes || []);
            setCarregando(false);
        });
    }


    // Filtro de tipo aplicado localmente.
    // Filtro de período vai ao backend via socket — evita Date.now() no render.
    const txFiltradas = useMemo(() => {
        if (filtroTipo === 'todos') return transacoes;
        return transacoes.filter(tx => tx.tipo === filtroTipo);
    }, [transacoes, filtroTipo]);


    // ----------------------------------------------------------------
    // Resumo do período filtrado
    // ----------------------------------------------------------------
    const resumo = useMemo(() => resumoExtrato(txFiltradas), [txFiltradas]);


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Filtro de período ---- */}
            <div style={estilos.filtroPeriodo}>
                {FILTROS_PERIODO.map(f => (
                    <button
                        key={f.id}
                        onClick={() => handlePeriodo(f.id)}
                        style={{
                            ...estilos.btnFiltro,
                            background: filtroPeriodo === f.id
                                ? 'rgba(245,158,11,0.15)'
                                : 'rgba(255,255,255,0.04)',
                            border: filtroPeriodo === f.id
                                ? '1px solid rgba(245,158,11,0.40)'
                                : '1px solid rgba(255,255,255,0.07)',
                            color: filtroPeriodo === f.id
                                ? '#F59E0B'
                                : 'rgba(255,255,255,0.40)',
                            fontWeight: filtroPeriodo === f.id ? '600' : '400',
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* ---- Resumo do período ---- */}
            {txFiltradas.length > 0 && (
                <div style={estilos.cardResumo}>
                    <CardResumoItem
                        label="Entradas"
                        valor={`₿C ${fmtBC(resumo.totalEntradas)}`}
                        cor="#22C55E"
                        icone="⬇️"
                    />
                    <div style={estilos.resumoDivisor} />
                    <CardResumoItem
                        label="Saídas"
                        valor={`₿C ${fmtBC(resumo.totalSaidas)}`}
                        cor="#EF4444"
                        icone="⬆️"
                    />
                    <div style={estilos.resumoDivisor} />
                    <CardResumoItem
                        label="Taxas"
                        valor={`R$ ${fmt(bcParaBRL(resumo.totalTaxas))}`}
                        cor="#F59E0B"
                        icone="📋"
                    />
                </div>
            )}

            {/* ---- Filtro de tipo (scroll horizontal) ---- */}
            <div style={estilos.filtroTipoScroll}>
                {FILTROS_TIPO.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFiltroTipo(f.id)}
                        style={{
                            ...estilos.chipTipo,
                            background: filtroTipo === f.id
                                ? 'rgba(124,58,237,0.18)'
                                : 'rgba(255,255,255,0.04)',
                            border: filtroTipo === f.id
                                ? '1px solid rgba(124,58,237,0.45)'
                                : '1px solid rgba(255,255,255,0.07)',
                            color: filtroTipo === f.id
                                ? '#A78BFA'
                                : 'rgba(255,255,255,0.40)',
                            fontWeight: filtroTipo === f.id ? '600' : '400',
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* ---- Estado: carregando ---- */}
            {carregando && (
                <div style={estilos.estadoVazio}>
                    <span style={{ fontSize: '28px', opacity: 0.4 }}>⏳</span>
                    <p style={estilos.estadoTexto}>Carregando transações...</p>
                </div>
            )}

            {/* ---- Estado: sem transações ---- */}
            {!carregando && txFiltradas.length === 0 && (
                <div style={estilos.estadoVazio}>
                    <span style={{ fontSize: '36px', opacity: 0.25 }}>📋</span>
                    <p style={estilos.estadoTexto}>
                        {transacoes.length === 0
                            ? 'Nenhuma transação ainda.\nDeposite para começar a jogar!'
                            : 'Nenhuma transação neste filtro.'}
                    </p>
                    {transacoes.length > 0 && (
                        <button
                            onClick={() => { setFiltroTipo('todos'); setFiltroPeriodo('tudo'); }}
                            style={estilos.btnLimparFiltro}
                        >
                            Limpar filtros
                        </button>
                    )}
                </div>
            )}

            {/* ---- Lista de transações ---- */}
            {!carregando && txFiltradas.length > 0 && (
                <div style={estilos.lista}>
                    {txFiltradas.map((tx, i) => (
                        <CardTx key={tx.id || i} tx={tx} />
                    ))}
                </div>
            )}

            {/* ---- Contador ---- */}
            {txFiltradas.length > 0 && (
                <p style={estilos.contador}>
                    {txFiltradas.length} transaç{txFiltradas.length === 1 ? 'ão' : 'ões'} encontrada{txFiltradas.length !== 1 ? 's' : ''}
                </p>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: CARD DE TRANSAÇÃO
// ================================================================

function CardTx({ tx }) {

    const [expandido, setExpandido] = useState(false);

    const cor    = corTipoTx(tx.tipo);
    const sinal  = sinalTx(tx.tipo);
    const label  = LABEL_TX[tx.tipo]  || tx.tipo;
    const icone  = ICONE_TX[tx.tipo]  || '💱';

    return (
        <div
            onClick={() => setExpandido(p => !p)}
            style={{
                ...estilos.cardTx,
                borderColor: expandido ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                background:  expandido ? 'rgba(255,255,255,0.04)' : '#111827',
            }}
        >
            {/* Linha principal */}
            <div style={estilos.txLinha}>

                {/* Ícone do tipo */}
                <div style={{ ...estilos.txIcone, background: `${cor}15`, border: `1px solid ${cor}30` }}>
                    <span style={{ fontSize: '16px' }}>{icone}</span>
                </div>

                {/* Tipo e data */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={estilos.txLabel}>{label}</p>
                    <p style={estilos.txData}>{fmtData(tx.criadoEm)}</p>
                    {tx.contraparte && (
                        <p style={estilos.txContraparte}>
                            {tx.tipo === TIPO_TX.ENVIO ? '→ ' : '← '}
                            {tx.contraparte}
                        </p>
                    )}
                </div>

                {/* Valor */}
                <div style={{ textAlign: 'right' }}>
                    <p style={{ ...estilos.txValor, color: cor }}>
                        {sinal}₿C {fmtBC(tx.valorBC)}
                    </p>
                    <p style={estilos.txValorBRL}>
                        R$ {fmt(bcParaBRL(tx.valorBC))}
                    </p>
                </div>

                {/* Seta de expansão */}
                <span style={{
                    ...estilos.txSeta,
                    transform: expandido ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>
                    ▾
                </span>

            </div>

            {/* Detalhes expandidos */}
            {expandido && (
                <div style={estilos.txDetalhes}>

                    {tx.taxaBC > 0 && (
                        <DetalheLinha label="Taxa cobrada" valor={`₿C ${fmtBC(tx.taxaBC)}`} cor="#F59E0B" />
                    )}
                    {tx.taxaBRL > 0 && (
                        <DetalheLinha label="Taxa em R$" valor={`R$ ${fmt(tx.taxaBRL)}`} cor="#F59E0B" />
                    )}
                    {tx.brlLiquido > 0 && (
                        <DetalheLinha label="Valor líquido recebido" valor={`R$ ${fmt(tx.brlLiquido)}`} />
                    )}
                    {tx.status && (
                        <DetalheLinha label="Status" valor={tx.status} />
                    )}
                    {tx.id && (
                        <DetalheLinha label="ID da transação" valor={tx.id} mono />
                    )}

                </div>
            )}

        </div>
    );
}

// ================================================================
// BLOCO 4: SUBCOMPONENTES AUXILIARES
// ================================================================

function CardResumoItem({ label, valor, cor, icone }) {
    return (
        <div style={estilos.resumoItem}>
            <span style={{ fontSize: '14px' }}>{icone}</span>
            <div>
                <p style={estilos.resumoLabel}>{label}</p>
                <p style={{ ...estilos.resumoValor, color: cor }}>{valor}</p>
            </div>
        </div>
    );
}

function DetalheLinha({ label, valor, cor, mono }) {
    return (
        <div style={estilos.detalheinha}>
            <span style={estilos.detalheLabelI}>{label}</span>
            <span style={{
                ...estilos.detalheValorI,
                color:      cor || 'rgba(255,255,255,0.6)',
                fontFamily: mono ? 'monospace' : 'inherit',
                fontSize:   mono ? '10px' : '12px',
            }}>
                {valor}
            </span>
        </div>
    );
}


// ================================================================
// BLOCO 5: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    // Filtro de período — 4 botões em linha
    filtroPeriodo: {
        display: 'flex',
        gap:     '6px',
    },

    btnFiltro: {
        flex:         1,
        padding:      '7px 4px',
        borderRadius: '7px',
        cursor:       'pointer',
        outline:      'none',
        fontSize:     '12px',
        fontFamily:   'inherit',
        transition:   'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    // Card de resumo do período
    cardResumo: {
        display:      'flex',
        alignItems:   'center',
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding:      '12px',
        gap:          '0',
    },

    resumoItem: {
        flex:          1,
        display:       'flex',
        gap:           '8px',
        alignItems:    'center',
        justifyContent:'center',
    },

    resumoDivisor: {
        width:      '1px',
        height:     '32px',
        background: 'rgba(255,255,255,0.07)',
    },

    resumoLabel: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.35)',
        margin:   0,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    },

    resumoValor: {
        fontSize:   '13px',
        fontWeight: '700',
        margin:     '2px 0 0',
    },

    // Filtro de tipo — scroll horizontal no mobile
    filtroTipoScroll: {
        display:    'flex',
        gap:        '6px',
        overflowX:  'auto',
        paddingBottom: '4px',
        scrollbarWidth: 'none',
    },

    chipTipo: {
        flexShrink:   0,
        padding:      '5px 12px',
        borderRadius: '20px',
        cursor:       'pointer',
        outline:      'none',
        fontSize:     '12px',
        fontFamily:   'inherit',
        whiteSpace:   'nowrap',
        transition:   'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    // Estado vazio / carregando
    estadoVazio: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '10px',
        padding:        '40px 20px',
        textAlign:      'center',
    },

    estadoTexto: {
        fontSize:   '13px',
        color:      'rgba(255,255,255,0.30)',
        margin:     0,
        lineHeight: 1.5,
        whiteSpace: 'pre-line',
    },

    btnLimparFiltro: {
        background:   'transparent',
        border:       '1px solid rgba(255,255,255,0.15)',
        borderRadius: '6px',
        color:        'rgba(255,255,255,0.45)',
        fontSize:     '12px',
        padding:      '6px 14px',
        cursor:       'pointer',
        fontFamily:   'inherit',
    },

    // Lista de cards de transação
    lista: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    // Card individual de transação
    cardTx: {
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding:      '12px',
        cursor:       'pointer',
        transition:   'all 0.15s',
        display:      'flex',
        flexDirection:'column',
        gap:          '0',
        WebkitTapHighlightColor: 'transparent',
    },

    txLinha: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
    },

    txIcone: {
        width:          '36px',
        height:         '36px',
        borderRadius:   '8px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
    },

    txLabel: {
        fontSize:   '13px',
        fontWeight: '600',
        color:      '#F8FAFC',
        margin:     0,
    },

    txData: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.30)',
        margin:   '2px 0 0',
    },

    txContraparte: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.40)',
        margin:    '1px 0 0',
        overflow:  'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:'nowrap',
    },

    txValor: {
        fontSize:   '14px',
        fontWeight: '700',
        margin:     0,
    },

    txValorBRL: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.30)',
        margin:   '2px 0 0',
    },

    txSeta: {
        fontSize:   '14px',
        color:      'rgba(255,255,255,0.25)',
        flexShrink: 0,
        transition: 'transform 0.2s',
        userSelect: 'none',
    },

    // Detalhes expandidos
    txDetalhes: {
        marginTop:    '10px',
        paddingTop:   '10px',
        borderTop:    '1px solid rgba(255,255,255,0.06)',
        display:      'flex',
        flexDirection:'column',
        gap:          '6px',
    },

    detalheinha: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
    },

    detalheLabelI: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.35)',
    },

    detalheValorI: {
        fontSize:   '12px',
        fontWeight: '500',
    },

    // Contador de resultados
    contador: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.20)',
        margin:    0,
        textAlign: 'center',
    },
};