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
     compacto    → bool    : só as últimas 5, sem filtros (tela principal)
     onDepositar → fn()    : ação do estado vazio
================================================================ */

import { useState, useEffect, useMemo } from 'react';
import {
    fmtBC,
    fmt,
    fmtData,
    sinalTx,
    resumoExtrato,
    bcParaBRL,
    LABEL_TX,
    TIPO_TX,
} from './walletUtils';
import Icone from '../../components/Icone';


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

// Na tela principal da carteira aparecem só as últimas movimentações
const LIMITE_COMPACTO = 5;

export default function History({ transacoes, socket, onCarregar, compacto = false, onDepositar }) {

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
    const lista = compacto ? txFiltradas.slice(0, LIMITE_COMPACTO) : txFiltradas;

    return (
        <div className={`cart-extrato${compacto ? ' compacto' : ''}`}>

            {!compacto && (
                <>
                    <div className="segmento segmento-largo" role="group" aria-label="Período">
                        {FILTROS_PERIODO.map(f => (
                            <button key={f.id} type="button" aria-pressed={filtroPeriodo === f.id} onClick={() => handlePeriodo(f.id)}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="cart-chips" role="group" aria-label="Tipo de movimentação">
                        {FILTROS_TIPO.map(f => (
                            <button key={f.id} type="button" className="cart-chip" aria-pressed={filtroTipo === f.id} onClick={() => setFiltroTipo(f.id)}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {txFiltradas.length > 0 && (
                        <dl className="cart-totais">
                            <div><dt>Entradas</dt><dd className="num positivo">₿C {fmtBC(resumo.totalEntradas)}</dd></div>
                            <div><dt>Saídas</dt><dd className="num">₿C {fmtBC(resumo.totalSaidas)}</dd></div>
                            <div><dt>Taxas</dt><dd className="num">R$ {fmt(bcParaBRL(resumo.totalTaxas))}</dd></div>
                        </dl>
                    )}
                </>
            )}

            {carregando && (
                <ul className="cart-tx-lista" aria-busy="true" aria-label="Carregando movimentações…">
                    {[0, 1, 2].map(i => <li key={i} className="cart-tx esqueleto" />)}
                </ul>
            )}

            {!carregando && txFiltradas.length === 0 && (
                <div className="cart-vazio">
                    <Icone nome="historico" tamanho={28} />
                    {transacoes.length === 0 ? (
                        <>
                            <p className="titulo">Nenhuma movimentação ainda</p>
                            <p className="sub">Faça um depósito para começar a jogar com saldo real.</p>
                            {onDepositar && (
                                <button type="button" className="btn btn-principal" onClick={onDepositar}>
                                    <Icone nome="baixo" tamanho={16} />Depositar
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="titulo">Nada neste filtro</p>
                            <button type="button" className="btn btn-neutro" onClick={() => { setFiltroTipo('todos'); handlePeriodo('tudo'); }}>
                                Limpar filtros
                            </button>
                        </>
                    )}
                </div>
            )}

            {!carregando && lista.length > 0 && (
                <ul className="cart-tx-lista">
                    {lista.map((tx, i) => <CardTx key={tx.id || i} tx={tx} />)}
                </ul>
            )}

            {!compacto && txFiltradas.length > 0 && (
                <p className="cart-nota num">
                    {txFiltradas.length} {txFiltradas.length === 1 ? 'movimentação' : 'movimentações'}
                </p>
            )}
        </div>
    );
}


// ================================================================
// LINHA DE TRANSAÇÃO
// ================================================================

const ICONE_TIPO = {
    deposito: 'baixo', saque: 'cima', envio: 'enviar', recebimento: 'receber',
    premio: 'torneio', compra: 'loja', taxa: 'info', bonus: 'presente',
};

const NOME_STATUS = {
    pendente: 'Pendente', concluido: 'Concluído', concluida: 'Concluída', confirmado: 'Confirmado',
    confirmada: 'Confirmada', falhou: 'Falhou', erro: 'Falhou', cancelado: 'Cancelado', cancelada: 'Cancelada',
};

function tomStatus(status = '') {
    const s = String(status).toLowerCase();
    if (s.startsWith('pend')) return 'pendente';
    if (s.startsWith('fal') || s.startsWith('erro') || s.startsWith('cancel')) return 'falhou';
    return 'ok';
}

function CardTx({ tx }) {
    const [expandido, setExpandido] = useState(false);
    const entrada = sinalTx(tx.tipo) === '+';
    const label   = LABEL_TX[tx.tipo] || tx.tipo;
    const idDet   = `tx-det-${tx.id || tx.criadoEm}`;

    return (
        <li className={`cart-tx${expandido ? ' aberta' : ''}`}>
            <button type="button" className="cart-tx-linha" onClick={() => setExpandido(p => !p)} aria-expanded={expandido} aria-controls={idDet}>
                <span className={`cart-tx-icone${entrada ? ' entrada' : ''}`} aria-hidden="true">
                    <Icone nome={ICONE_TIPO[tx.tipo] || 'carteira'} tamanho={18} />
                </span>
                <span className="cart-tx-meio">
                    <b>{label}</b>
                    <span className="num">
                        {fmtData(tx.criadoEm)}
                        {tx.contraparte ? ` · ${tx.tipo === TIPO_TX.ENVIO ? 'para' : 'de'} ${tx.contraparte}` : ''}
                    </span>
                </span>
                <span className="cart-tx-valor">
                    <b className={`num${entrada ? ' positivo' : ''}`}>{sinalTx(tx.tipo)}₿C {fmtBC(tx.valorBC)}</b>
                    {tx.status
                        ? <span className={`cart-status ${tomStatus(tx.status)}`}>{NOME_STATUS[String(tx.status).toLowerCase()] || tx.status}</span>
                        : <span className="num">R$ {fmt(bcParaBRL(tx.valorBC))}</span>}
                </span>
                <Icone nome="desce" tamanho={16} className="cart-tx-seta" />
            </button>

            {expandido && (
                <dl id={idDet} className="cart-tx-det">
                    <DetalheLinha label="Equivale a" valor={`R$ ${fmt(bcParaBRL(tx.valorBC))}`} />
                    {tx.taxaBC > 0 && <DetalheLinha label="Taxa cobrada" valor={`₿C ${fmtBC(tx.taxaBC)}`} />}
                    {tx.taxaBRL > 0 && <DetalheLinha label="Taxa em R$" valor={`R$ ${fmt(tx.taxaBRL)}`} />}
                    {tx.brlLiquido > 0 && <DetalheLinha label="Valor líquido recebido" valor={`R$ ${fmt(tx.brlLiquido)}`} />}
                    {tx.status && <DetalheLinha label="Status" valor={NOME_STATUS[String(tx.status).toLowerCase()] || tx.status} />}
                    {tx.id && <DetalheLinha label="ID da transação" valor={tx.id} mono />}
                </dl>
            )}
        </li>
    );
}

function DetalheLinha({ label, valor, mono }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd className={mono ? 'mono' : 'num'}>{valor}</dd>
        </div>
    );
}
