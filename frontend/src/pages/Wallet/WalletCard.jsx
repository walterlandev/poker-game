/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/WalletCard.jsx

   CONCEITO GERAL:
   Visão geral da carteira do jogador. Exibe:
     → Saldo atual em ₿C e equivalente em R$
     → Explicação da cotação e do sistema de taxas
     → Formulário de depósito (R$ → ₿C)
     → Formulário de saque   (₿C → R$)
     → Limite diário de saque utilizado

   FLUXO DE SEGURANÇA:
     Depósito → PinConfirm → socket.emit('wallet:depositar')
     Saque    → PinConfirm → socket.emit('wallet:sacar')
     O backend valida o PIN e executa — o frontend nunca credita sozinho.

   PROPS:
     saldo       → number  : saldo atual em ₿C
     sacadoHoje  → number  : ₿C já sacados hoje
     usuario     → object  : { uid, nome }
     socket      → Socket.io
     onFeedback  → fn(tipo, msg) : exibe feedback no index pai
================================================================ */

import { useState, useMemo, useEffect } from 'react';
import PinConfirm from './PinConfirm';
import ChipPoker  from '../../components/ChipPoker';
import {
    calcularDeposito,
    calcularSaque,
    validarDeposito,
    validarSaque,
    fmt,
    fmtBC,
    bcParaBRL,
    LIMITES,
    TAXAS,
    COTACAO,
} from './walletUtils';


// ================================================================
// BLOCO 1: COMPONENTE PRINCIPAL
// ================================================================

export default function WalletCard({ saldo, sacadoHoje, usuario, socket, onFeedback }) {

    // Ação em foco: 'deposito' | 'saque' | null
    const [acao, setAcao] = useState(null);

    // Valores dos inputs
    const [valorDeposito, setValorDeposito] = useState('');
    const [valorSaque,    setValorSaque]    = useState('');
    const [chavePix,      setChavePix]      = useState(usuario?.dadosBancarios?.chavePix || '');

    // Controle do modal de PIN
    const [pinAberto,    setPinAberto]    = useState(false);
    const [acaoPendente, setAcaoPendente] = useState(null); // { tipo, payload }

    // Erros de validação inline
    const [erroDeposito, setErroDeposito] = useState(null);
    const [erroSaque,    setErroSaque]    = useState(null);

    // QR Code PIX — exibido após depósito em produção
    const [pixPendente, setPixPendente] = useState(null); // { pixCopiaECola, qrCode, bcCreditar, expiracaoEm }
    const [pixCopiado,  setPixCopiado]  = useState(false);

    // Saque fica PENDENTE até o PIX de saída ser confirmado (DEV simula em 3s)
    const [saquePendente, setSaquePendente] = useState(null); // { saqueId, valorBC, brlLiquido, chavePix }

    // Verificação da blockchain interna (ledger auditável)
    const [statusBlockchain, setStatusBlockchain] = useState(null);
    const [verificando,      setVerificando]      = useState(false);

    function verificarBlockchain() {
        if (!socket) return;
        setVerificando(true);
        socket.emit('blockchain:verificar');
    }

    useEffect(() => {
        if (!socket) return;
        const onStatus = (status) => {
            setStatusBlockchain(status);
            setVerificando(false);
        };
        socket.on('blockchain:status', onStatus);
        return () => socket.off('blockchain:status', onStatus);
    }, [socket]);

    // Escuta confirmação de depósito (DEV auto-confirma; PROD via webhook)
    useEffect(() => {
        if (!socket) return;

        const onIniciado = (data) => {
            if (data.simulado) {
                onFeedback('sucesso', `⚙️ Depósito simulado — ₿C ${fmtBC(data.bcCreditar)} creditado em 3s.`);
            } else {
                setPixPendente({
                    pixCopiaECola: data.pixCopiaECola,
                    qrCode:        data.qrCode,
                    bcCreditar:    data.bcCreditar,
                    totalBRL:      data.totalBRL,
                    expiracaoEm:   data.expiracaoEm,
                });
            }
        };

        const onConfirmado = ({ bcCreditar }) => {
            setPixPendente(null);
            onFeedback('sucesso', `✅ Depósito confirmado — ₿C ${fmtBC(bcCreditar)} creditados!`);
        };

        // Saque fica pendente até o PIX de saída ser (de fato) enviado —
        // ver backend/wallet/wallet-manager.js (wallet:sacar/confirmarSaque).
        const onSaquePendente = (data) => {
            setSaquePendente(data);
        };

        const onSaqueConfirmado = ({ brlLiquido }) => {
            setSaquePendente(null);
            onFeedback('sucesso', `✅ Saque confirmado — R$ ${fmt(brlLiquido)} enviados via PIX!`);
        };

        // Sem isso, PIN errado / falha no depósito ou saque não mostrava
        // nada — o formulário só fechava em silêncio, sem o jogador saber
        // que a operação não foi concluída.
        const onErro = ({ mensagem }) => {
            onFeedback('erro', mensagem || 'Não foi possível concluir a operação. Tente novamente.');
        };

        socket.on('wallet:deposito_iniciado',   onIniciado);
        socket.on('wallet:deposito_confirmado', onConfirmado);
        socket.on('wallet:saque_pendente',      onSaquePendente);
        socket.on('wallet:saque_confirmado',    onSaqueConfirmado);
        socket.on('erro', onErro);

        return () => {
            socket.off('wallet:deposito_iniciado',   onIniciado);
            socket.off('wallet:deposito_confirmado', onConfirmado);
            socket.off('wallet:saque_pendente',      onSaquePendente);
            socket.off('wallet:saque_confirmado',    onSaqueConfirmado);
            socket.off('erro', onErro);
        };
    }, [socket, onFeedback]);


    // ----------------------------------------------------------------
    // Cálculos reativos (recalcula a cada keystroke)
    // ----------------------------------------------------------------
    const previewDeposito = useMemo(() => {
        const v = parseFloat(valorDeposito);
        return !isNaN(v) && v > 0 ? calcularDeposito(v) : null;
    }, [valorDeposito]);

    const previewSaque = useMemo(() => {
        const v = parseFloat(valorSaque);
        return !isNaN(v) && v > 0 ? calcularSaque(v) : null;
    }, [valorSaque]);

    const restanteDiario = Math.max(0, LIMITES.SAQUE_MAX_DIARIO_BC - sacadoHoje);
    const percDiario     = Math.min(100, (sacadoHoje / LIMITES.SAQUE_MAX_DIARIO_BC) * 100);


    // ----------------------------------------------------------------
    // Abre o painel de ação (deposito ou saque) — fecha se já aberto
    // ----------------------------------------------------------------
    function toggleAcao(tipo) {
        setAcao(prev => prev === tipo ? null : tipo);
        setErroDeposito(null);
        setErroSaque(null);
    }


    // ----------------------------------------------------------------
    // Submete depósito → valida → abre PIN
    // ----------------------------------------------------------------
    function handleSubmitDeposito() {
        if (!usuario?.temPin) {
            onFeedback('erro', 'Você ainda não tem um PIN de segurança. Crie um em Configurações antes de depositar.');
            return;
        }
        const v   = parseFloat(valorDeposito);
        const val = validarDeposito(v);
        if (!val.valido) { setErroDeposito(val.erro); return; }
        setErroDeposito(null);
        setAcaoPendente({ tipo: 'deposito', payload: calcularDeposito(v) });
        setPinAberto(true);
    }


    // ----------------------------------------------------------------
    // Submete saque → valida → abre PIN
    // ----------------------------------------------------------------
    function handleSubmitSaque() {
        if (!usuario?.temPin) {
            onFeedback('erro', 'Você ainda não tem um PIN de segurança. Crie um em Configurações antes de sacar.');
            return;
        }
        if (!chavePix.trim()) {
            setErroSaque('Informe a chave PIX que vai receber o valor.');
            return;
        }
        const v   = parseFloat(valorSaque);
        const val = validarSaque(v, saldo, sacadoHoje);
        if (!val.valido) { setErroSaque(val.erro); return; }
        setErroSaque(null);
        setAcaoPendente({ tipo: 'saque', payload: calcularSaque(v) });
        setPinAberto(true);
    }


    // ----------------------------------------------------------------
    // PIN confirmado pelo jogador → emite evento ao backend
    // ----------------------------------------------------------------
    function handlePinConfirmado(pin) {
        if (!acaoPendente || !socket) return;

        const { tipo, payload } = acaoPendente;

        if (tipo === 'deposito') {
            socket.emit('wallet:depositar', {
                uid:      usuario?.uid,
                valorBRL: payload.valorBRL,
                taxaBRL:  payload.taxaBRL,
                bcEsperado: payload.bcRecebido,
                pin,
            });
        }

        if (tipo === 'saque') {
            socket.emit('wallet:sacar', {
                uid:       usuario?.uid,
                valorBC:   payload.bcDebitado,
                chavePix:  chavePix.trim(),
                pin,
            });
        }

        setPinAberto(false);
        setAcaoPendente(null);
        setValorDeposito('');
        setValorSaque('');
        setAcao(null);

        // Feedback real vem via socket: wallet:deposito_iniciado/confirmado
        // (depósito) ou wallet:saque_pendente/confirmado (saque) — nunca
        // fingir sucesso aqui antes do servidor confirmar de verdade.
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ======================================================
                SEÇÃO 1 — SALDO PRINCIPAL
            ====================================================== */}
            <div style={estilos.cardSaldo}>

                <div style={estilos.saldoTopo}>
                    <div style={estilos.saldoIcone}>
                        <ChipPoker size={36} />
                    </div>
                    <div>
                        <p style={estilos.saldoLabel}>Saldo disponível</p>
                        <p style={estilos.saldoBig}>
                            {fmtBC(saldo)}
                        </p>
                        <p style={estilos.saldoEquiv}>
                            ≈ R$ {fmt(bcParaBRL(saldo))} em reais
                        </p>
                    </div>
                </div>

                {/* Barra de limite diário de saque */}
                <div style={estilos.limiteDiario}>
                    <div style={estilos.limiteHeader}>
                        <span style={estilos.limiteLabel}>Saque hoje</span>
                        <span style={estilos.limiteValor}>
                            ₿C {fmtBC(sacadoHoje)} / {fmtBC(LIMITES.SAQUE_MAX_DIARIO_BC)}
                        </span>
                    </div>
                    <div style={estilos.barraFundo}>
                        <div style={{
                            ...estilos.barraPreenchimento,
                            width: `${percDiario}%`,
                            background: percDiario > 80 ? '#EF4444' : '#F59E0B',
                        }} />
                    </div>
                    <p style={estilos.limiteRestante}>
                        Restante hoje: ₿C {fmtBC(restanteDiario)}
                    </p>
                </div>

            </div>


            {/* ======================================================
                SEÇÃO 2 — COTAÇÃO E TAXAS (explicação fixa)
            ====================================================== */}
            <div style={estilos.cardCotacao}>
                <p style={estilos.cotacaoTitulo}>💱 Como funciona a ₿C</p>

                <div style={estilos.cotacaoGrid}>

                    <InfoItem
                        icone="🔄"
                        titulo="Cotação fixa"
                        texto={`R$ 1,00 = ₿C ${fmtBC(COTACAO.BC_POR_REAL)}`}
                        sub="Valor nunca flutua"
                    />
                    <InfoItem
                        icone="⬇️"
                        titulo="Taxa de depósito"
                        texto={`${TAXAS.DEPOSITO * 100}% sobre o valor`}
                        sub="Cobrada em R$ além do depósito"
                    />
                    <InfoItem
                        icone="⬆️"
                        titulo="Taxa de saque"
                        texto={`${TAXAS.SAQUE * 100}% sobre o valor`}
                        sub="Descontada do valor recebido"
                    />
                    <InfoItem
                        icone="🔒"
                        titulo="Saldo recuperável"
                        texto="100% do saldo"
                        sub="Saque a qualquer momento"
                    />

                </div>

                <div style={estilos.cotacaoAviso}>
                    <span>ℹ️</span>
                    <p style={estilos.cotacaoAvisoTexto}>
                        A ₿C é a ficha digital do jogo. Cada real depositado
                        vira {fmtBC(COTACAO.BC_POR_REAL)} fichas para jogar nas mesas.
                        Todo o saldo pode ser sacado a qualquer momento, descontada apenas a taxa.
                    </p>
                </div>
            </div>


            {/* ======================================================
                SEÇÃO 2B — BLOCKCHAIN (ledger auditável)
            ====================================================== */}
            <div style={estilos.blockchainCard}>
                <div style={estilos.blockchainTopo}>
                    <div>
                        <p style={estilos.blockchainTitulo}>⛓️ Ledger da ₿C</p>
                        <p style={estilos.blockchainSub}>
                            Todo depósito, saque e envio fica registrado numa cadeia de
                            blocos encadeada — qualquer alteração no histórico quebra a
                            corrente e fica visível na hora.
                        </p>
                    </div>
                    <button onClick={verificarBlockchain} style={estilos.btnVerificar} disabled={verificando}>
                        {verificando ? '...' : '🔍 Verificar'}
                    </button>
                </div>

                {statusBlockchain && (
                    <div style={estilos.blockchainStatus}>
                        <span style={{
                            ...estilos.blockchainBadge,
                            background: statusBlockchain.valida ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                            color:      statusBlockchain.valida ? '#4ADE80' : '#FCA5A5',
                        }}>
                            {statusBlockchain.valida ? '✓ Cadeia íntegra' : '✕ Adulteração detectada'}
                        </span>
                        <span style={estilos.blockchainInfo}>
                            {statusBlockchain.totalBlocos} bloco(s) · {statusBlockchain.totalTransacoes} transação(ões)
                        </span>
                    </div>
                )}
            </div>


            {/* ======================================================
                SEÇÃO 3 — BOTÕES DE AÇÃO
            ====================================================== */}
            <div style={estilos.botoesAcao}>
                <BotaoAcao
                    icone="⬇️"
                    label="Depositar"
                    cor="#22C55E"
                    ativo={acao === 'deposito'}
                    onClick={() => toggleAcao('deposito')}
                />
                <BotaoAcao
                    icone="⬆️"
                    label="Sacar"
                    cor="#F59E0B"
                    ativo={acao === 'saque'}
                    onClick={() => toggleAcao('saque')}
                />
            </div>


            {/* ======================================================
                SEÇÃO 4 — FORMULÁRIO DE DEPÓSITO
            ====================================================== */}
            {acao === 'deposito' && (
                <div style={estilos.formCard}>

                    <p style={estilos.formTitulo}>⬇️ Depósito</p>

                    {/* Limites */}
                    <p style={estilos.formDica}>
                        Mínimo R$ {fmt(LIMITES.DEPOSITO_MIN_BRL)} · Máximo R$ {fmt(LIMITES.DEPOSITO_MAX_BRL)} por transação
                    </p>

                    {/* Input valor em R$ */}
                    <div style={estilos.inputGroup}>
                        <span style={estilos.inputPrefix}>R$</span>
                        <input
                            type="number"
                            min="1"
                            max="500"
                            step="1"
                            placeholder="0,00"
                            value={valorDeposito}
                            onChange={e => {
                                setValorDeposito(e.target.value);
                                setErroDeposito(null);
                            }}
                            style={estilos.input}
                        />
                    </div>

                    {erroDeposito && (
                        <p style={estilos.erroTexto}>⚠ {erroDeposito}</p>
                    )}

                    {/* Preview do cálculo */}
                    {previewDeposito && (
                        <div style={estilos.preview}>
                            <LinhaPreview label="Valor depositado"  valor={`R$ ${fmt(previewDeposito.valorBRL)}`} />
                            <LinhaPreview label={`Taxa (${previewDeposito.taxaPerc}%)`} valor={`+ R$ ${fmt(previewDeposito.taxaBRL)}`} cor="#EF4444" />
                            <div style={estilos.previewDivisor} />
                            <LinhaPreview label="Total cobrado"     valor={`R$ ${fmt(previewDeposito.totalBRL)}`}    destaque />
                            <LinhaPreview label="₿C creditados"     valor={`₿C ${fmtBC(previewDeposito.bcRecebido)}`} cor="#22C55E" destaque />
                        </div>
                    )}

                    {/* Métodos de pagamento */}
                    {previewDeposito && (
                        <>
                            <p style={estilos.labelMetodo}>Pagar com</p>
                            <div style={estilos.metodos}>
                                <MetodoPag icone="📱" label="PIX"    destaque />
                                <MetodoPag icone="💳" label="Cartão"          />
                            </div>
                        </>
                    )}

                    <button
                        onClick={handleSubmitDeposito}
                        disabled={!previewDeposito}
                        style={{
                            ...estilos.btnConfirmar,
                            background: previewDeposito ? '#22C55E' : 'rgba(255,255,255,0.08)',
                            color:      previewDeposito ? '#fff'    : 'rgba(255,255,255,0.3)',
                            cursor:     previewDeposito ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {previewDeposito
                            ? `Depositar R$ ${fmt(previewDeposito.totalBRL)}`
                            : 'Informe o valor'}
                    </button>

                </div>
            )}


            {/* ======================================================
                SEÇÃO 5 — FORMULÁRIO DE SAQUE
            ====================================================== */}
            {acao === 'saque' && (
                <div style={estilos.formCard}>

                    <p style={estilos.formTitulo}>⬆️ Saque</p>

                    <p style={estilos.formDica}>
                        Mínimo ₿C {fmtBC(LIMITES.SAQUE_MIN_BC)} · Disponível hoje: ₿C {fmtBC(restanteDiario)}
                    </p>

                    {/* Input valor em ₿C */}
                    <div style={estilos.inputGroup}>
                        <span style={estilos.inputPrefix}>₿C</span>
                        <input
                            type="number"
                            min={LIMITES.SAQUE_MIN_BC}
                            step="1000"
                            placeholder="0"
                            value={valorSaque}
                            onChange={e => {
                                setValorSaque(e.target.value);
                                setErroSaque(null);
                            }}
                            style={estilos.input}
                        />
                    </div>

                    {/* Atalho: sacar tudo */}
                    {saldo >= LIMITES.SAQUE_MIN_BC && (
                        <button
                            onClick={() => setValorSaque(String(saldo))}
                            style={estilos.btnTudo}
                        >
                            Sacar tudo (₿C {fmtBC(saldo)})
                        </button>
                    )}

                    {/* Chave PIX que vai receber o valor */}
                    <div style={estilos.inputGroup}>
                        <span style={estilos.inputPrefix}>🔑</span>
                        <input
                            type="text"
                            placeholder="Sua chave PIX (CPF, e-mail, telefone...)"
                            value={chavePix}
                            onChange={e => {
                                setChavePix(e.target.value);
                                setErroSaque(null);
                            }}
                            style={estilos.input}
                        />
                    </div>

                    {erroSaque && (
                        <p style={estilos.erroTexto}>⚠ {erroSaque}</p>
                    )}

                    {/* Preview do cálculo */}
                    {previewSaque && (
                        <div style={estilos.preview}>
                            <LinhaPreview label="₿C debitados"      valor={`₿C ${fmtBC(previewSaque.bcDebitado)}`} />
                            <LinhaPreview label="Equivale a"         valor={`R$ ${fmt(previewSaque.brlBruto)}`} />
                            <LinhaPreview label={`Taxa (${previewSaque.taxaPerc}%)`} valor={`- R$ ${fmt(previewSaque.taxaBRL)}`} cor="#EF4444" />
                            <div style={estilos.previewDivisor} />
                            <LinhaPreview label="Você recebe"        valor={`R$ ${fmt(previewSaque.brlLiquido)}`} cor="#22C55E" destaque />
                        </div>
                    )}

                    <button
                        onClick={handleSubmitSaque}
                        disabled={!previewSaque || !chavePix.trim()}
                        style={{
                            ...estilos.btnConfirmar,
                            background: previewSaque && chavePix.trim() ? '#F59E0B' : 'rgba(255,255,255,0.08)',
                            color:      previewSaque && chavePix.trim() ? '#fff'    : 'rgba(255,255,255,0.3)',
                            cursor:     previewSaque && chavePix.trim() ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {previewSaque
                            ? `Sacar · Receber R$ ${fmt(previewSaque.brlLiquido)}`
                            : 'Informe o valor'}
                    </button>

                </div>
            )}


            {/* ======================================================
                SEÇÃO 5B — SAQUE PENDENTE (aguardando PIX de saída)
            ====================================================== */}
            {saquePendente && (
                <div style={estilos.pixCard}>
                    <div style={estilos.pixHeader}>
                        <span style={{ fontSize: '22px' }}>⏳</span>
                        <div>
                            <p style={estilos.pixTitulo}>Processando seu saque</p>
                            <p style={estilos.pixSub}>
                                R$ {fmt(saquePendente.brlLiquido)} sendo enviados via PIX pra chave{' '}
                                <strong>{saquePendente.chavePix}</strong>
                            </p>
                        </div>
                    </div>
                    <p style={estilos.pixAviso}>
                        Isso pode levar alguns instantes. Você recebe uma notificação assim que confirmar.
                    </p>
                </div>
            )}


            {/* ======================================================
                SEÇÃO 6 — PIX QR CODE (depósito em produção)
            ====================================================== */}
            {pixPendente && (
                <div style={estilos.pixCard}>
                    <div style={estilos.pixHeader}>
                        <span style={{ fontSize: '22px' }}>📱</span>
                        <div>
                            <p style={estilos.pixTitulo}>Aguardando pagamento PIX</p>
                            <p style={estilos.pixSub}>
                                Escaneie o QR Code ou copie o código abaixo
                            </p>
                        </div>
                        <button
                            onClick={() => setPixPendente(null)}
                            style={estilos.pixFechar}
                            title="Fechar"
                        >×</button>
                    </div>

                    <div style={estilos.pixResumo}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                            R$ {fmt(pixPendente.totalBRL)} → ₿C {fmtBC(pixPendente.bcCreditar)}
                        </span>
                    </div>

                    {/* QR Code em base64 */}
                    {pixPendente.qrCode && (
                        <div style={estilos.qrWrap}>
                            <img
                                src={`data:image/png;base64,${pixPendente.qrCode}`}
                                alt="QR Code PIX"
                                style={estilos.qrImg}
                            />
                        </div>
                    )}

                    {/* Pix Copia e Cola */}
                    {pixPendente.pixCopiaECola && (
                        <div style={estilos.pixCopiaWrap}>
                            <p style={estilos.pixCodigoTexto}>
                                {pixPendente.pixCopiaECola}
                            </p>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(pixPendente.pixCopiaECola);
                                    setPixCopiado(true);
                                    setTimeout(() => setPixCopiado(false), 2500);
                                }}
                                style={{
                                    ...estilos.pixBtnCopiar,
                                    background: pixCopiado ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.15)',
                                    color:      pixCopiado ? '#4ADE80' : '#A78BFA',
                                    border:     pixCopiado ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(124,58,237,0.3)',
                                }}
                            >
                                {pixCopiado ? '✓ Copiado!' : '📋 Copiar código'}
                            </button>
                        </div>
                    )}

                    <p style={estilos.pixAviso}>
                        Após pagar, o saldo será creditado automaticamente em segundos.
                    </p>
                </div>
            )}


            {/* ======================================================
                MODAL DE PIN
            ====================================================== */}
            {pinAberto && (
                <PinConfirm
                    titulo={acaoPendente?.tipo === 'deposito' ? 'Confirmar depósito' : 'Confirmar saque'}
                    descricao={
                        acaoPendente?.tipo === 'deposito'
                            ? `R$ ${fmt(acaoPendente.payload.totalBRL)} → ₿C ${fmtBC(acaoPendente.payload.bcRecebido)}`
                            : `₿C ${fmtBC(acaoPendente?.payload.bcDebitado)} → R$ ${fmt(acaoPendente?.payload.brlLiquido)}`
                    }
                    onConfirmar={handlePinConfirmado}
                    onCancelar={() => { setPinAberto(false); setAcaoPendente(null); }}
                />
            )}

        </div>
    );
}


// ================================================================
// BLOCO 2: SUBCOMPONENTES
// ================================================================

function BotaoAcao({ icone, label, cor, ativo, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                ...estilos.botaoAcao,
                background: ativo ? `${cor}18` : 'rgba(255,255,255,0.04)',
                border:     ativo ? `1px solid ${cor}50` : '1px solid rgba(255,255,255,0.08)',
                color:      ativo ? cor : 'rgba(255,255,255,0.5)',
            }}
        >
            <span style={{ fontSize: '20px' }}>{icone}</span>
            <span style={{ fontSize: '13px', fontWeight: ativo ? '600' : '400' }}>{label}</span>
        </button>
    );
}

function InfoItem({ icone, titulo, texto, sub }) {
    return (
        <div style={estilos.infoItem}>
            <span style={{ fontSize: '18px' }}>{icone}</span>
            <div>
                <p style={estilos.infoTitulo}>{titulo}</p>
                <p style={estilos.infoTexto}>{texto}</p>
                {sub && <p style={estilos.infoSub}>{sub}</p>}
            </div>
        </div>
    );
}

function LinhaPreview({ label, valor, cor, destaque }) {
    return (
        <div style={estilos.linhaPreview}>
            <span style={{
                fontSize:   destaque ? '13px' : '12px',
                color:      'rgba(255,255,255,0.45)',
                fontWeight: destaque ? '500' : '400',
            }}>
                {label}
            </span>
            <span style={{
                fontSize:   destaque ? '14px' : '13px',
                fontWeight: destaque ? '700'  : '500',
                color:      cor || '#F8FAFC',
            }}>
                {valor}
            </span>
        </div>
    );
}

function MetodoPag({ icone, label, destaque }) {
    const [ativo, setAtivo] = useState(!!destaque);
    return (
        <button
            onClick={() => setAtivo(true)}
            style={{
                ...estilos.metodoPag,
                background: ativo ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                border:     ativo ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color:      ativo ? '#A78BFA' : 'rgba(255,255,255,0.4)',
            }}
        >
            <span style={{ fontSize: '18px' }}>{icone}</span>
            <span style={{ fontSize: '12px', fontWeight: ativo ? '600' : '400' }}>{label}</span>
            {destaque && <span style={estilos.badgePix}>Recomendado</span>}
        </button>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '14px',
    },

    // Card principal de saldo
    cardSaldo: {
        background:   '#111827',
        border:       '1px solid rgba(245,158,11,0.20)',
        borderRadius: '14px',
        padding:      '18px',
        display:      'flex',
        flexDirection:'column',
        gap:          '16px',
    },

    saldoTopo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '14px',
    },

    saldoIcone: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'rgba(245,158,11,0.12)',
        border:         '1px solid rgba(245,158,11,0.25)',
        borderRadius:   '10px',
        padding:        '10px 12px',
    },

    saldoLabel: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.35)',
        margin:    0,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    saldoBig: {
        fontSize:   '28px',
        fontWeight: '800',
        color:      '#F59E0B',
        margin:     '2px 0 0',
        lineHeight:  1,
    },

    saldoEquiv: {
        fontSize: '12px',
        color:    'rgba(255,255,255,0.35)',
        margin:   '4px 0 0',
    },

    // Barra de limite diário
    limiteDiario: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    limiteHeader: {
        display:        'flex',
        justifyContent: 'space-between',
    },

    limiteLabel: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.35)',
    },

    limiteValor: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.5)',
    },

    barraFundo: {
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

    limiteRestante: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.25)',
        margin:   0,
    },

    // Card de cotação / explicação
    cardCotacao: {
        background:   'rgba(59,130,246,0.05)',
        border:       '1px solid rgba(59,130,246,0.15)',
        borderRadius: '12px',
        padding:      '14px',
        display:      'flex',
        flexDirection:'column',
        gap:          '12px',
    },

    cotacaoTitulo: {
        fontSize:   '13px',
        fontWeight: '600',
        color:      '#93C5FD',
        margin:     0,
    },

    cotacaoGrid: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '10px',
    },

    infoItem: {
        display:   'flex',
        gap:       '8px',
        alignItems:'flex-start',
    },

    infoTitulo: {
        fontSize:   '10px',
        fontWeight: '600',
        color:      'rgba(255,255,255,0.4)',
        margin:     0,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    },

    infoTexto: {
        fontSize:   '12px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     '2px 0 0',
    },

    infoSub: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.3)',
        margin:   '1px 0 0',
    },

    cotacaoAviso: {
        display:    'flex',
        gap:        '8px',
        alignItems: 'flex-start',
        padding:    '8px 10px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius:'8px',
    },

    cotacaoAvisoTexto: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.40)',
        margin:     0,
        lineHeight: 1.5,
    },

    // Painel de verificação da blockchain
    blockchainCard: {
        background:   'rgba(124,58,237,0.05)',
        border:       '1px solid rgba(124,58,237,0.18)',
        borderRadius: '12px',
        padding:      '14px',
        display:      'flex',
        flexDirection:'column',
        gap:          '10px',
    },
    blockchainTopo: {
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            '10px',
    },
    blockchainTitulo: {
        fontSize:   '13px',
        fontWeight: '600',
        color:      '#C4B5FD',
        margin:     0,
    },
    blockchainSub: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.35)',
        margin:     '3px 0 0',
        lineHeight: 1.5,
        maxWidth:   '320px',
    },
    btnVerificar: {
        background:   'rgba(124,58,237,0.15)',
        border:       '1px solid rgba(124,58,237,0.35)',
        borderRadius: '8px',
        color:        '#C4B5FD',
        fontSize:     '12px',
        fontWeight:   '600',
        padding:      '7px 12px',
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        fontFamily:   'inherit',
        flexShrink:   0,
    },
    blockchainStatus: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        flexWrap:   'wrap',
    },
    blockchainBadge: {
        fontSize:     '11px',
        fontWeight:   '700',
        padding:      '3px 9px',
        borderRadius: '20px',
    },
    blockchainInfo: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.35)',
    },

    // Botões de ação depósito/saque
    botoesAcao: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '10px',
    },

    botaoAcao: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '4px',
        padding:       '14px',
        borderRadius:  '10px',
        cursor:        'pointer',
        outline:       'none',
        transition:    'all 0.18s',
        fontFamily:    'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    // Formulário de depósito / saque
    formCard: {
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding:      '16px',
        display:      'flex',
        flexDirection:'column',
        gap:          '12px',
    },

    formTitulo: {
        fontSize:   '14px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    formDica: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.30)',
        margin:    0,
    },

    inputGroup: {
        display:    'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.05)',
        border:     '1px solid rgba(255,255,255,0.10)',
        borderRadius:'8px',
        overflow:   'hidden',
    },

    inputPrefix: {
        padding:    '0 12px',
        fontSize:   '13px',
        fontWeight: '700',
        color:      '#F59E0B',
        background: 'rgba(245,158,11,0.08)',
        borderRight:'1px solid rgba(255,255,255,0.08)',
        alignSelf:  'stretch',
        display:    'flex',
        alignItems: 'center',
    },

    input: {
        flex:        1,
        padding:     '12px',
        background:  'transparent',
        border:      'none',
        outline:     'none',
        color:       '#F8FAFC',
        fontSize:    '16px',
        fontWeight:  '600',
        fontFamily:  'inherit',
    },

    erroTexto: {
        fontSize:  '12px',
        color:     '#FCA5A5',
        margin:    0,
    },

    btnTudo: {
        background:   'transparent',
        border:       '1px solid rgba(245,158,11,0.25)',
        borderRadius: '6px',
        color:        '#F59E0B',
        fontSize:     '11px',
        padding:      '6px 10px',
        cursor:       'pointer',
        fontFamily:   'inherit',
        alignSelf:    'flex-start',
    },

    // Preview de cálculo
    preview: {
        background:   'rgba(255,255,255,0.03)',
        border:       '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px',
        padding:      '12px',
        display:      'flex',
        flexDirection:'column',
        gap:          '8px',
    },

    linhaPreview: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
    },

    previewDivisor: {
        height:     '1px',
        background: 'rgba(255,255,255,0.06)',
    },

    labelMetodo: {
        fontSize:      '11px',
        color:         'rgba(255,255,255,0.35)',
        margin:        0,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    metodos: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
    },

    metodoPag: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '4px',
        padding:       '10px',
        borderRadius:  '8px',
        cursor:        'pointer',
        outline:       'none',
        fontFamily:    'inherit',
        transition:    'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    badgePix: {
        fontSize:     '9px',
        background:   'rgba(34,197,94,0.2)',
        color:        '#4ADE80',
        padding:      '1px 5px',
        borderRadius: '4px',
        fontWeight:   '600',
    },

    btnConfirmar: {
        width:        '100%',
        padding:      '13px',
        border:       'none',
        borderRadius: '10px',
        fontSize:     '14px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    // PIX QR Code panel
    pixCard: {
        background:    '#111827',
        border:        '1px solid rgba(34,197,94,0.30)',
        borderRadius:  '14px',
        padding:       '16px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    pixHeader: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
    },

    pixTitulo: {
        fontSize:   '14px',
        fontWeight: '700',
        color:      '#4ADE80',
        margin:     0,
    },

    pixSub: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.40)',
        margin:   '2px 0 0',
    },

    pixFechar: {
        marginLeft:   'auto',
        background:   'transparent',
        border:       'none',
        color:        'rgba(255,255,255,0.4)',
        fontSize:     '20px',
        cursor:       'pointer',
        lineHeight:   1,
        padding:      '0 4px',
    },

    pixResumo: {
        textAlign: 'center',
    },

    qrWrap: {
        display:        'flex',
        justifyContent: 'center',
    },

    qrImg: {
        width:        '180px',
        height:       '180px',
        borderRadius: '8px',
        border:       '3px solid rgba(255,255,255,0.08)',
    },

    pixCopiaWrap: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    pixCodigoTexto: {
        fontSize:     '9px',
        color:        'rgba(255,255,255,0.40)',
        background:   'rgba(255,255,255,0.04)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding:      '8px',
        wordBreak:    'break-all',
        margin:       0,
        lineHeight:   1.5,
        maxHeight:    '60px',
        overflowY:    'auto',
    },

    pixBtnCopiar: {
        padding:      '10px',
        borderRadius: '8px',
        fontSize:     '13px',
        fontWeight:   '600',
        cursor:       'pointer',
        fontFamily:   'inherit',
        transition:   'all 0.2s',
        WebkitTapHighlightColor: 'transparent',
    },

    pixAviso: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.30)',
        textAlign:  'center',
        margin:     0,
    },
};