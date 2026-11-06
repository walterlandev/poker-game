/* ================================================================
   ARQUIVO: frontend/src/pages/Wallet/index.jsx

   Carteira do jogador em TELA ÚNICA (montada na aba "Carteira" do lobby):
     → topo: saldo TOTAL grande e, sempre visível, a divisão
       "Real · pode sacar" e "Bônus · só para jogar"
     → ações: Depositar, Sacar, Enviar (WalletCard, um formulário por vez)
     → últimas movimentações (History compacto) + "Ver extrato completo"
     → rodapé: "Registro auditável" com a verificação do ledger

   PROPS:
     usuario  → { uid, nome, saldo, saldoBonus, sacadoHoje, temPin }
     socket   → instância do Socket.io

   EVENTOS SOCKET ESCUTADOS:
     'wallet:saldo_atualizado'  → { saldo, saldoBonus, sacadoHoje }
     'wallet:tx_nova'           → objeto de transação (atualiza histórico)
     'blockchain:status'        → resultado da verificação do ledger
   EVENTOS SOCKET EMITIDOS (aqui e nos filhos):
     'blockchain:verificar', 'wallet:depositar', 'wallet:sacar',
     'wallet:enviar', 'wallet:buscar_historico', 'wallet:buscar_jogador'
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import WalletCard from './WalletCard';
import History    from './History';
import Icone      from '../../components/Icone';
import { fmtBC, fmt, bcParaBRL } from './walletUtils';

export default function WalletIndex({ usuario, socket }) {

    // 'principal' (tela única) | 'extrato' (History completo)
    const [vista, setVista] = useState('principal');

    // Saldo separado em real (sacável) e bônus (só para jogar)
    const [saldoReal,  setSaldoReal ] = useState(usuario?.saldo      || 0);
    const [saldoBonus, setSaldoBonus] = useState(usuario?.saldoBonus || 0);
    const [sacadoHoje, setSacadoHoje] = useState(usuario?.sacadoHoje || 0);

    // Histórico de transações (alimentado via socket ou fetch inicial)
    const [transacoes, setTransacoes] = useState([]);

    // Aviso (sucesso / erro) vindo dos filhos
    const [feedback, setFeedback] = useState(null); // { tipo, msg }
    const timerFeedback = useRef(null);

    // Verificação do ledger auditável
    const [statusBlockchain, setStatusBlockchain] = useState(null);
    const [verificando,      setVerificando     ] = useState(false);

    // Abre um formulário do WalletCard a partir de fora (estado vazio)
    const [pedidoAcao, setPedidoAcao] = useState(0);

    const saldoTotal = saldoReal + saldoBonus;

    useEffect(() => {
        if (!socket) return;

        const handleSaldo = ({ saldo: s, saldoBonus: sb, sacadoHoje: sh }) => {
            setSaldoReal(s || 0);
            setSaldoBonus(sb || 0);
            setSacadoHoje(sh ?? 0);
        };
        const handleTxNova = (tx) => setTransacoes(prev => [tx, ...prev]);
        const handleStatus = (status) => { setStatusBlockchain(status); setVerificando(false); };

        socket.on('wallet:saldo_atualizado', handleSaldo);
        socket.on('wallet:tx_nova',          handleTxNova);
        socket.on('blockchain:status',       handleStatus);
        return () => {
            // Passa o handler para remover APENAS este listener, não os do App.jsx
            socket.off('wallet:saldo_atualizado', handleSaldo);
            socket.off('wallet:tx_nova',          handleTxNova);
            socket.off('blockchain:status',       handleStatus);
        };
    }, [socket]);

    useEffect(() => () => clearTimeout(timerFeedback.current), []);

    const mostrarFeedback = useCallback((tipo, msg) => {
        setFeedback({ tipo, msg });
        clearTimeout(timerFeedback.current);
        timerFeedback.current = setTimeout(() => setFeedback(null), tipo === 'erro' ? 7000 : 4500);
    }, []);

    function verificarBlockchain() {
        if (!socket || verificando) return;
        setVerificando(true);
        socket.emit('blockchain:verificar');
    }

    const statusLedger = verificando
        ? 'verificando…'
        : statusBlockchain
            ? (statusBlockchain.valida ? 'íntegro' : 'adulteração detectada')
            : 'não verificado';

    return (
        <div className="cart">

            {/* ---- Topo: saldo total e divisão real / bônus ---- */}
            <section className="cart-topo" aria-labelledby="cart-titulo">
                <h1 id="cart-titulo" className="titulo-secao">Carteira</h1>
                <p className="cart-total-rot">Saldo total</p>
                <p className="cart-total num">₿C {fmtBC(saldoTotal)}</p>
                <div className="cart-divisao">
                    <div className="cart-parte real">
                        <span className="rot">Real <span aria-hidden="true">·</span> pode sacar</span>
                        <b className="num">₿C {fmtBC(saldoReal)}</b>
                        <span className="sub num">≈ R$ {fmt(bcParaBRL(saldoReal))}</span>
                    </div>
                    <div className="cart-parte bonus">
                        <span className="rot">Bônus <span aria-hidden="true">·</span> só para jogar</span>
                        <b className="num">₿C {fmtBC(saldoBonus)}</b>
                        <span className="sub">não pode ser sacado nem enviado</span>
                    </div>
                </div>
            </section>

            <div aria-live="polite">
                {feedback && (
                    <button
                        type="button"
                        className={`aviso-inline ${feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}`}
                        onClick={() => setFeedback(null)}
                    >
                        <span>{feedback.msg}</span>
                        <Icone nome="fechar" tamanho={16} />
                    </button>
                )}
            </div>

            {vista === 'principal' && (
                <>
                    <WalletCard
                        key={pedidoAcao}
                        acaoInicial={pedidoAcao ? 'deposito' : null}
                        saldoReal={saldoReal}
                        sacadoHoje={sacadoHoje}
                        usuario={usuario}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />

                    <section className="cart-mov" aria-labelledby="cart-mov-titulo">
                        <div className="cart-mov-cab">
                            <h2 id="cart-mov-titulo">Últimas movimentações</h2>
                            <button type="button" className="cart-link" onClick={() => setVista('extrato')}>
                                Ver extrato completo
                            </button>
                        </div>
                        <History
                            compacto
                            transacoes={transacoes}
                            socket={socket}
                            onCarregar={setTransacoes}
                            onDepositar={() => setPedidoAcao(n => n + 1)}
                        />
                    </section>
                </>
            )}

            {vista === 'extrato' && (
                <section className="cart-mov" aria-labelledby="cart-ext-titulo">
                    <div className="cart-mov-cab">
                        <button type="button" className="btn btn-fantasma cart-voltar" onClick={() => setVista('principal')}>
                            <Icone nome="receber" tamanho={18} />Carteira
                        </button>
                        <h2 id="cart-ext-titulo">Extrato completo</h2>
                    </div>
                    <History
                        transacoes={transacoes}
                        socket={socket}
                        onCarregar={setTransacoes}
                        onDepositar={() => { setVista('principal'); setPedidoAcao(n => n + 1); }}
                    />
                </section>
            )}

            {/* ---- Rodapé: registro auditável ---- */}
            <footer className="cart-ledger">
                <Icone nome="cadeia" tamanho={16} />
                <span>
                    Registro auditável <span aria-hidden="true">·</span>{' '}
                    <span className={statusBlockchain ? (statusBlockchain.valida ? 'ok' : 'falhou') : ''} role="status">
                        {statusLedger}
                    </span>
                    {statusBlockchain && !verificando && (
                        <span className="num"> ({statusBlockchain.totalBlocos} blocos, {statusBlockchain.totalTransacoes} transações)</span>
                    )}
                </span>
                <button type="button" className="cart-link" onClick={verificarBlockchain} disabled={verificando} aria-busy={verificando || undefined}>
                    Verificar
                </button>
            </footer>
        </div>
    );
}
