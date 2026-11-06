/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/index.jsx

   CONCEITO GERAL:
   Container interno da carteira do jogador.
   Gerencia a navegação entre as 3 abas da Wallet:
     → Visão Geral  (WalletCard  — saldo, depósito, saque)
     → Histórico    (History     — extrato de transações)
     → Enviar       (SendBC      — transferência P2P entre jogadores)

   ESTE ARQUIVO não é o index da aplicação toda.
   Ele é montado dentro do painel/menu do jogador
   quando a aba "Carteira" é selecionada.

   PROPS:
     usuario  → { uid, nome, saldo, saldoBonus, sacadoHoje, tema }
     socket   → instância do Socket.io (para eventos em tempo real)

   EVENTOS SOCKET ESCUTADOS:
     'wallet:saldo_atualizado'  → { saldo, saldoBonus, sacadoHoje }
     'wallet:tx_nova'           → objeto de transação (atualiza histórico)

   EVENTOS SOCKET EMITIDOS (via filhos):
     'wallet:depositar'
     'wallet:sacar'
     'wallet:enviar'
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import WalletCard from './WalletCard';
import History    from './History';
import SendBC     from './SendBC';
import ChipPoker  from '../../components/ChipPoker';

// ================================================================
// BLOCO 1: DEFINIÇÃO DAS ABAS
// ================================================================

const ABAS = [
    {
        id:    'geral',
        label: 'Visão Geral',
        icone: '💳',
        desc:  'Saldo, depósito e saque',
    },
    {
        id:    'historico',
        label: 'Histórico',
        icone: '📋',
        desc:  'Extrato de transações',
    },
    {
        id:    'enviar',
        label: 'Enviar ₿C',
        icone: '➡️',
        desc:  'Transferir para jogador',
    },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function WalletIndex({ usuario, socket }) {

    // Aba ativa
    const [abaAtiva, setAbaAtiva] = useState('geral');

    // ✅ CORREÇÃO: saldo inclui real + bônus
    const [saldo,       setSaldo]       = useState((usuario?.saldo || 0) + (usuario?.saldoBonus || 0));
    const [sacadoHoje,  setSacadoHoje]  = useState(usuario?.sacadoHoje || 0);

    // Histórico de transações (alimentado via socket ou fetch inicial)
    const [transacoes,  setTransacoes]  = useState([]);

    // Feedback global (sucesso / erro) vindo dos filhos
    const [feedback, setFeedback] = useState(null); // { tipo: 'sucesso'|'erro', msg: string }

    // Saldo derivado: usa o estado local (atualizado pelo socket) ou cai
    // de volta na prop caso o socket ainda não tenha enviado nada.
    // Não usamos useEffect para sincronizar props → estado (anti-pattern).
    const saldoAtual     = saldo      ?? ((usuario?.saldo || 0) + (usuario?.saldoBonus || 0));
    const sacadoHojeReal = sacadoHoje ?? usuario?.sacadoHoje ?? 0;


    // ----------------------------------------------------------------
    // Escuta eventos de socket em tempo real
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        const handleSaldo = ({ saldo: s, saldoBonus: sb, sacadoHoje: sh }) => {
            setSaldo((s || 0) + (sb || 0));
            setSacadoHoje(sh ?? 0);
        };

        const handleTxNova = (tx) => {
            setTransacoes(prev => [tx, ...prev]);
        };

        socket.on('wallet:saldo_atualizado', handleSaldo);
        socket.on('wallet:tx_nova',          handleTxNova);

        return () => {
            // Passa o handler para remover APENAS este listener, não os do App.jsx
            socket.off('wallet:saldo_atualizado', handleSaldo);
            socket.off('wallet:tx_nova',          handleTxNova);
        };
    }, [socket]);


    // ----------------------------------------------------------------
    // Exibe feedback temporário (3 segundos)
    // ----------------------------------------------------------------
    const mostrarFeedback = useCallback((tipo, msg) => {
        setFeedback({ tipo, msg });
        setTimeout(() => setFeedback(null), 3500);
    }, []);


    // ----------------------------------------------------------------
    // Renderiza o conteúdo da aba ativa
    // ----------------------------------------------------------------
    function renderAba() {
        switch (abaAtiva) {
            case 'geral':
                return (
                    <WalletCard
                        saldo={saldoAtual}
                        sacadoHoje={sacadoHojeReal}
                        usuario={usuario}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                );
            case 'historico':
                return (
                    <History
                        transacoes={transacoes}
                        socket={socket}
                        onCarregar={setTransacoes}
                    />
                );
            case 'enviar':
                return (
                    <SendBC
                        saldo={saldoAtual}
                        usuario={usuario}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                );
            default:
                return null;
        }
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Cabeçalho da Wallet ---- */}
            <div style={estilos.cabecalho}>
                <div>
                    <h2 style={estilos.titulo}>
                        <ChipPoker size={20} /> Carteira
                    </h2>
                    <p style={estilos.subtitulo}>
                        Seu banco interno do jogo
                    </p>
                </div>

                {/* Saldo rápido sempre visível */}
                <div style={estilos.saldoRapido}>
                    <span style={estilos.saldoLabel}>Saldo</span>
                    <span style={estilos.saldoValor}>
                        ₿C {Number(saldoAtual).toLocaleString('pt-BR')}
                    </span>
                </div>
            </div>

            {/* ---- Feedback global ---- */}
            {feedback && (
                <div style={{
                    ...estilos.feedback,
                    background: feedback.tipo === 'sucesso'
                        ? 'var(--cor-positivo-suave)'
                        : 'var(--cor-perigo-suave)',
                    border: feedback.tipo === 'sucesso'
                        ? '1px solid var(--cor-positivo)'
                        : '1px solid var(--cor-perigo-linha)',
                    color: feedback.tipo === 'sucesso' ? 'var(--cor-positivo-texto)' : 'var(--cor-perigo-texto)',
                }}>
                    <span style={{ fontSize: '15px' }}>
                        {feedback.tipo === 'sucesso' ? '✓' : '✕'}
                    </span>
                    {feedback.msg}
                </div>
            )}

            {/* ---- Barra de abas (topo) ---- */}
            <div style={estilos.barraTabs}>
                {ABAS.map(aba => {
                    const ativa = abaAtiva === aba.id;
                    return (
                        <button
                            key={aba.id}
                            onClick={() => setAbaAtiva(aba.id)}
                            title={aba.desc}
                            style={{
                                ...estilos.tab,
                                background: ativa
                                    ? 'var(--cor-destaque-suave)'
                                    : 'transparent',
                                borderBottom: ativa
                                    ? '2px solid var(--cor-destaque-texto)'
                                    : '2px solid transparent',
                                color: ativa
                                    ? 'var(--cor-destaque-texto)'
                                    : 'var(--cor-texto-3)',
                                fontWeight: ativa ? '600' : '400',
                            }}
                        >
                            <span style={{ fontSize: '15px' }}>{aba.icone}</span>
                            <span style={{ fontSize: '13px' }}>{aba.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ---- Indicador de aba ativa (linha) ---- */}
            <div style={estilos.divisor} />

            {/* ---- Conteúdo da aba ---- */}
            <div style={estilos.conteudo}>
                {renderAba()}
            </div>

        </div>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '0px',
        height:        '100%',
    },

    // Cabeçalho com título e saldo rápido
    cabecalho: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        padding:        '16px 16px 12px',
        borderBottom:   '1px solid var(--cor-superficie)',
    },

    titulo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '7px',
        fontSize:   '18px',
        fontWeight: '700',
        color:      'var(--cor-texto)',
        margin:     0,
    },

    subtitulo: {
        fontSize:  '12px',
        color:     'var(--cor-texto-3)',
        margin:    '3px 0 0',
    },

    // Saldo sempre visível no canto superior direito
    saldoRapido: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-end',
        gap:            '2px',
        background:     'var(--cor-destaque-suave)',
        border:         '1px solid var(--cor-destaque-suave)',
        borderRadius:   '8px',
        padding:        '8px 12px',
    },

    saldoLabel: {
        fontSize:   '10px',
        color:      'var(--cor-destaque-linha)',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    saldoValor: {
        fontSize:   '15px',
        fontWeight: '700',
        color:      'var(--cor-destaque-texto)',
    },

    // Feedback de sucesso ou erro
    feedback: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
        margin:     '10px 16px 0',
        padding:    '10px 14px',
        borderRadius: '8px',
        fontSize:   '13px',
        fontWeight: '500',
    },

    // Barra de abas no topo
    barraTabs: {
        display:    'flex',
        gap:        '0px',
        padding:    '0 16px',
        marginTop:  '12px',
    },

    tab: {
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '3px',
        padding:        '8px 4px',
        border:         'none',
        borderBottom:   '2px solid transparent',
        cursor:         'pointer',
        outline:        'none',
        transition:     'all 0.18s',
        fontFamily:     'inherit',
        WebkitTapHighlightColor: 'transparent',
        borderRadius:   '6px 6px 0 0',
    },

    divisor: {
        height:     '1px',
        background: 'var(--cor-superficie)',
        margin:     '0 16px',
    },

    // Área de conteúdo da aba
    conteudo: {
        flex:       1,
        padding:    '16px',
        overflowY:  'auto',
    },
};
