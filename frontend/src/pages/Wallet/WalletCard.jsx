/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/WalletCard.jsx

   CONCEITO GERAL:
   Ações da carteira (dentro da tela única de Wallet/index.jsx):
     → linha curta de cotação e taxas, com "Detalhes" que expande
     → três ações grandes: Depositar, Sacar, Enviar; abre UM
       formulário por vez, inline
     → depósito: valor e resumo em R$, depois QR Code e copia e cola
     → saque: usa só o saldo REAL (o bônus não é sacável), estado
       "aguardando PIX" enquanto pendente
     → enviar: SendBC inline

   FLUXO DE SEGURANÇA:
     Depósito → PinConfirm → socket.emit('wallet:depositar')
     Saque    → PinConfirm → socket.emit('wallet:sacar')
     O backend valida o PIN e executa — o frontend nunca credita sozinho.

   PROPS:
     saldoReal   → number  : saldo real (sacável) em ₿C
     saldoBonus  → number  : saldo de bônus (só para jogar) em ₿C
     sacadoHoje  → number  : ₿C já sacados hoje
     usuario     → object  : { uid, nome }
     socket      → Socket.io
     onFeedback  → fn(tipo, msg) : exibe feedback no index pai
================================================================ */

import { useState, useMemo, useEffect } from 'react';
import PinConfirm from './PinConfirm';
import SendBC     from './SendBC';
import Icone      from '../../components/Icone';
import {
    calcularDeposito,
    calcularSaque,
    validarDeposito,
    validarSaqueReal,
    fmt,
    fmtBC,
    LIMITES,
    TAXAS,
    COTACAO,
} from './walletUtils';


// ================================================================
// BLOCO 1: COMPONENTE PRINCIPAL
// ================================================================

export default function WalletCard({ saldoReal = 0, sacadoHoje = 0, usuario, socket, onFeedback, acaoInicial = null }) {

    // Ação em foco: 'deposito' | 'saque' | 'enviar' | null
    const [acao, setAcao] = useState(acaoInicial);

    // Detalhes da cotação/taxas (linha curta que expande)
    const [detalhesAbertos, setDetalhesAbertos] = useState(false);

    // Operação enviada ao servidor e ainda sem resposta: trava o botão
    const [processando, setProcessando] = useState(null); // 'deposito' | 'saque' | null

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

    // Escuta confirmação de depósito (DEV auto-confirma; PROD via webhook)
    useEffect(() => {
        if (!socket) return;

        const onIniciado = (data) => {
            setProcessando(null);
            if (data.simulado) {
                onFeedback('sucesso', `Depósito de teste: ₿C ${fmtBC(data.bcCreditar)} entram no saldo real em alguns segundos.`);
            } else {
                setAcao(null);   // o formulário dá lugar ao QR Code
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
            setProcessando(null);
            onFeedback('sucesso', `Depósito confirmado: ₿C ${fmtBC(bcCreditar)} no saldo real.`);
        };

        // Saque fica pendente até o PIX de saída ser (de fato) enviado —
        // ver backend/wallet/wallet-manager.js (wallet:sacar/confirmarSaque).
        const onSaquePendente = (data) => {
            setProcessando(null);
            setAcao(null);       // o formulário dá lugar ao estado "aguardando PIX"
            setSaquePendente(data);
        };

        const onSaqueConfirmado = ({ brlLiquido }) => {
            setSaquePendente(null);
            onFeedback('sucesso', `Saque confirmado: R$ ${fmt(brlLiquido)} enviados por PIX.`);
        };

        // Sem isso, PIN errado / falha no depósito ou saque não mostrava
        // nada — o formulário só fechava em silêncio, sem o jogador saber
        // que a operação não foi concluída.
        const onErro = ({ mensagem }) => {
            setProcessando(null);
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
        const val = validarSaqueReal(v, saldoReal, sacadoHoje);
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

        setProcessando(tipo);
        setTimeout(() => setProcessando(atual => (atual === tipo ? null : atual)), 15000);

        setPinAberto(false);
        setAcaoPendente(null);
        setValorDeposito('');
        setValorSaque('');
        // O formulário fica aberto mostrando "Gerando PIX…"/"Enviando pedido…"
        // até a resposta; o QR Code/estado pendente aparece logo abaixo.

        // Feedback real vem via socket: wallet:deposito_iniciado/confirmado
        // (depósito) ou wallet:saque_pendente/confirmado (saque) — nunca
        // fingir sucesso aqui antes do servidor confirmar de verdade.
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    const podeSacarTudo = saldoReal >= LIMITES.SAQUE_MIN_BC;

    return (
        <div className="cart-acoes-bloco">

            {/* ---- Cotação e taxas: linha curta que expande ---- */}
            <div className="cart-cotacao">
                <p className="num">
                    R$ 1 = ₿C {fmtBC(COTACAO.BC_POR_REAL)}
                    <span aria-hidden="true"> · </span>depósito {TAXAS.DEPOSITO * 100}%
                    <span aria-hidden="true"> · </span>saque {TAXAS.SAQUE * 100}%
                </p>
                <button
                    type="button"
                    className="cart-link"
                    aria-expanded={detalhesAbertos}
                    aria-controls="cart-cotacao-detalhes"
                    onClick={() => setDetalhesAbertos(v => !v)}
                >
                    {detalhesAbertos ? 'Fechar' : 'Detalhes'}
                </button>
            </div>
            {detalhesAbertos && (
                <div id="cart-cotacao-detalhes" className="cart-detalhes">
                    <p>A ₿C é a ficha do jogo. Cada R$ 1 depositado vira ₿C {fmtBC(COTACAO.BC_POR_REAL)} para jogar nas mesas. A cotação é fixa.</p>
                    <p>No depósito, a taxa de {TAXAS.DEPOSITO * 100}% é cobrada em R$ além do valor. No saque, a taxa de {TAXAS.SAQUE * 100}% é descontada do valor que você recebe. Enviar ₿C para outro jogador custa {TAXAS.ENVIO * 100}% (mínimo ₿C {fmtBC(TAXAS.ENVIO_MIN)}).</p>
                    <p>Só o saldo real pode ser sacado ou enviado. O bônus serve apenas para jogar nas mesas e não vira dinheiro.</p>
                    <p>Saque mínimo de ₿C {fmtBC(LIMITES.SAQUE_MIN_BC)} e limite diário de ₿C {fmtBC(LIMITES.SAQUE_MAX_DIARIO_BC)}.</p>
                </div>
            )}

            {/* ---- Três ações grandes ---- */}
            <div className="cart-acoes" role="group" aria-label="Ações da carteira">
                <BotaoAcao icone="baixo"  label="Depositar" ativo={acao === 'deposito'} onClick={() => toggleAcao('deposito')} />
                <BotaoAcao icone="cima"   label="Sacar"     ativo={acao === 'saque'}    onClick={() => toggleAcao('saque')} />
                <BotaoAcao icone="enviar" label="Enviar"    ativo={acao === 'enviar'}   onClick={() => toggleAcao('enviar')} />
            </div>

            {/* ---- Depósito ---- */}
            {acao === 'deposito' && (
                <section className="cart-form" aria-labelledby="cart-dep-titulo">
                    <div className="cart-form-cab">
                        <h3 id="cart-dep-titulo">Depositar via PIX</h3>
                        <span className="cart-form-dica num">
                            R$ {fmt(LIMITES.DEPOSITO_MIN_BRL)} a R$ {fmt(LIMITES.DEPOSITO_MAX_BRL)} por depósito
                        </span>
                    </div>

                    <label className="cart-campo-rot" htmlFor="cart-dep-valor">Valor em reais</label>
                    <div className={`cart-campo${erroDeposito ? ' com-erro' : ''}`}>
                        <span className="cart-campo-pre">R$</span>
                        <input
                            id="cart-dep-valor"
                            type="number"
                            inputMode="decimal"
                            min="1"
                            max="500"
                            step="1"
                            placeholder="0,00"
                            value={valorDeposito}
                            onChange={e => { setValorDeposito(e.target.value); setErroDeposito(null); }}
                            aria-invalid={!!erroDeposito}
                        />
                    </div>
                    {erroDeposito && <p className="cart-erro" role="alert">{erroDeposito}</p>}

                    {previewDeposito && (
                        <dl className="cart-resumo">
                            <LinhaPreview label="Valor do depósito" valor={`R$ ${fmt(previewDeposito.valorBRL)}`} />
                            <LinhaPreview label={`Taxa (${previewDeposito.taxaPerc}%)`} valor={`+ R$ ${fmt(previewDeposito.taxaBRL)}`} />
                            <LinhaPreview label="Total a pagar" valor={`R$ ${fmt(previewDeposito.totalBRL)}`} destaque />
                            <LinhaPreview label="Entra no saldo real" valor={`₿C ${fmtBC(previewDeposito.bcRecebido)}`} tom="positivo" />
                        </dl>
                    )}

                    <button
                        type="button"
                        onClick={handleSubmitDeposito}
                        disabled={!previewDeposito || processando === 'deposito'}
                        aria-busy={processando === 'deposito' || undefined}
                        className="btn btn-principal cart-btn-cheio"
                    >
                        {processando === 'deposito'
                            ? 'Gerando PIX…'
                            : previewDeposito ? `Gerar PIX de R$ ${fmt(previewDeposito.totalBRL)}` : 'Informe o valor'}
                    </button>
                    <p className="cart-nota">Você confirma com o PIN e recebe o QR Code e o código copia e cola aqui mesmo.</p>
                </section>
            )}

            {/* ---- Saque ---- */}
            {acao === 'saque' && (
                <section className="cart-form" aria-labelledby="cart-saq-titulo">
                    <div className="cart-form-cab">
                        <h3 id="cart-saq-titulo">Sacar para sua chave PIX</h3>
                        <span className="cart-form-dica num">
                            Real disponível ₿C {fmtBC(saldoReal)}
                        </span>
                    </div>

                    <label className="cart-campo-rot" htmlFor="cart-saq-valor">Valor em ₿C</label>
                    <div className={`cart-campo${erroSaque ? ' com-erro' : ''}`}>
                        <span className="cart-campo-pre">₿C</span>
                        <input
                            id="cart-saq-valor"
                            type="number"
                            inputMode="numeric"
                            min={LIMITES.SAQUE_MIN_BC}
                            step="1000"
                            placeholder="0"
                            value={valorSaque}
                            onChange={e => { setValorSaque(e.target.value); setErroSaque(null); }}
                            aria-invalid={!!erroSaque}
                        />
                        {podeSacarTudo && (
                            <button type="button" className="cart-campo-acao texto" onClick={() => setValorSaque(String(saldoReal))}>
                                Tudo
                            </button>
                        )}
                    </div>

                    <label className="cart-campo-rot" htmlFor="cart-saq-chave">Chave PIX que vai receber</label>
                    <div className="cart-campo">
                        <input
                            id="cart-saq-chave"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="CPF, e-mail, telefone ou chave aleatória…"
                            value={chavePix}
                            onChange={e => { setChavePix(e.target.value); setErroSaque(null); }}
                        />
                    </div>
                    {erroSaque && <p className="cart-erro" role="alert">{erroSaque}</p>}

                    <div className="cart-limite" aria-label="Limite diário de saque">
                        <div className="rot num">
                            <span>Sacado hoje ₿C {fmtBC(sacadoHoje)}</span>
                            <span>Resta ₿C {fmtBC(restanteDiario)}</span>
                        </div>
                        <div className="barra"><i style={{ width: `${percDiario}%` }} className={percDiario > 80 ? 'alto' : ''} /></div>
                    </div>

                    {previewSaque && (
                        <dl className="cart-resumo">
                            <LinhaPreview label="Sai do saldo real" valor={`₿C ${fmtBC(previewSaque.bcDebitado)}`} />
                            <LinhaPreview label="Equivale a" valor={`R$ ${fmt(previewSaque.brlBruto)}`} />
                            <LinhaPreview label={`Taxa (${previewSaque.taxaPerc}%)`} valor={`− R$ ${fmt(previewSaque.taxaBRL)}`} />
                            <LinhaPreview label="Você recebe" valor={`R$ ${fmt(previewSaque.brlLiquido)}`} tom="positivo" destaque />
                        </dl>
                    )}

                    <button
                        type="button"
                        onClick={handleSubmitSaque}
                        disabled={!previewSaque || !chavePix.trim() || processando === 'saque' || !!saquePendente}
                        aria-busy={processando === 'saque' || undefined}
                        className="btn btn-principal cart-btn-cheio"
                    >
                        {processando === 'saque'
                            ? 'Enviando pedido…'
                            : previewSaque ? `Sacar e receber R$ ${fmt(previewSaque.brlLiquido)}` : 'Informe o valor'}
                    </button>
                    <p className="cart-nota">O bônus não pode ser sacado: só o saldo real sai da carteira.</p>
                </section>
            )}

            {/* ---- Enviar ₿C (inline) ---- */}
            {acao === 'enviar' && (
                <SendBC
                    saldo={saldoReal}
                    usuario={usuario}
                    socket={socket}
                    onFeedback={onFeedback}
                />
            )}

            {/* ---- Saque pendente (aguardando PIX de saída) ---- */}
            {saquePendente && (
                <section className="cart-estado" role="status" aria-live="polite">
                    <span className="cart-estado-icone" aria-hidden="true"><Icone nome="relogio" /></span>
                    <div>
                        <h3>Saque pendente, aguardando PIX</h3>
                        <p className="num">
                            R$ {fmt(saquePendente.brlLiquido)} para a chave <b translate="no">{saquePendente.chavePix}</b>.
                            Isso pode levar alguns instantes; o saldo é atualizado quando o PIX for confirmado.
                        </p>
                    </div>
                </section>
            )}

            {/* ---- PIX do depósito: QR Code e copia e cola ---- */}
            {pixPendente && (
                <section className="cart-pix" aria-labelledby="cart-pix-titulo">
                    <div className="cart-form-cab">
                        <h3 id="cart-pix-titulo">Pague o PIX para concluir</h3>
                        <button type="button" onClick={() => setPixPendente(null)} className="modal-icone-btn" aria-label="Fechar PIX">
                            <Icone nome="fechar" tamanho={18} />
                        </button>
                    </div>
                    <p className="cart-pix-resumo num">
                        R$ {fmt(pixPendente.totalBRL)} <span aria-hidden="true">→</span> ₿C {fmtBC(pixPendente.bcCreditar)} no saldo real
                    </p>

                    {pixPendente.qrCode && (
                        <div className="cart-qr">
                            <img
                                src={`data:image/png;base64,${pixPendente.qrCode}`}
                                alt="QR Code do PIX para pagar o depósito"
                                width={200}
                                height={200}
                            />
                        </div>
                    )}

                    {pixPendente.pixCopiaECola && (
                        <div className="cart-copia">
                            <label className="cart-campo-rot" htmlFor="cart-pix-codigo">PIX copia e cola</label>
                            <div className="cart-copia-linha">
                                <input id="cart-pix-codigo" readOnly value={pixPendente.pixCopiaECola} className="num" onFocus={e => e.target.select()} />
                                <button
                                    type="button"
                                    className={`btn ${pixCopiado ? 'btn-neutro' : 'btn-principal'}`}
                                    onClick={() => {
                                        navigator.clipboard.writeText(pixPendente.pixCopiaECola);
                                        setPixCopiado(true);
                                        setTimeout(() => setPixCopiado(false), 2500);
                                    }}
                                >
                                    <Icone nome={pixCopiado ? 'check' : 'copiar'} tamanho={16} />
                                    {pixCopiado ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="cart-nota" role="status" aria-live="polite">
                        Aguardando o pagamento. Depois de pagar, o saldo é creditado em segundos.
                    </p>
                </section>
            )}

            {/* ---- PIN ---- */}
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
// SUBCOMPONENTES
// ================================================================

function BotaoAcao({ icone, label, ativo, onClick }) {
    return (
        <button type="button" onClick={onClick} className="cart-acao" aria-pressed={ativo}>
            <span className="cart-acao-icone" aria-hidden="true"><Icone nome={icone} tamanho={22} /></span>
            <span>{label}</span>
        </button>
    );
}

function LinhaPreview({ label, valor, tom, destaque }) {
    return (
        <div className={`cart-resumo-linha${destaque ? ' destaque' : ''}${tom ? ' ' + tom : ''}`}>
            <dt>{label}</dt>
            <dd className="num">{valor}</dd>
        </div>
    );
}
