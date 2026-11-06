/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/PacotesBC.jsx

   CONCEITO GERAL:
   O jogador escolhe quanto quer depositar:
     → Valores predefinidos: R$ 1, R$ 10, R$ 20, R$ 50, R$ 100
     → Ou digita qualquer valor no campo livre

   CONVERSÃO:
     R$ 1,00  =  ₿C 1.000  (na carteira)
     ₿C 1.000 =  1 ficha    (na mesa de jogo)

   Exemplo com R$ 20:
     Paga: R$ 22,00 (R$ 20 + 10% de taxa)
     Recebe: ₿C 20.000 na carteira
     Na mesa aparece como: 20 fichas

   CORREÇÃO DESTA VERSÃO:
     → handleComprar agora abre PinConfirm antes de emitir
       wallet:depositar. O backend exige PIN válido — antes
       estava enviando pin: null causando erro silencioso.

   PROPS:
     saldoAtual → number: saldo atual do jogador em ₿C
     usuario    → object: { uid, nome }
     socket     → Socket.io
     onFeedback → fn(tipo, msg)
================================================================ */

import { useState, useEffect, useMemo } from 'react';
import { calcularDeposito, fmt, fmtBC, TAXAS, LIMITES } from '../../Wallet/walletUtils';
import PinConfirm from '../../Wallet/PinConfirm';


// ================================================================
// BLOCO 1: VALORES PREDEFINIDOS
// ================================================================

const VALORES_RAPIDOS = [
    { brl: 1,   label: 'R$ 1',   fichas: '1'   },
    { brl: 10,  label: 'R$ 10',  fichas: '10'  },
    { brl: 20,  label: 'R$ 20',  fichas: '20'  },
    { brl: 50,  label: 'R$ 50',  fichas: '50'  },
    { brl: 100, label: 'R$ 100', fichas: '100' },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function PacotesBC({ saldoAtual, usuario, socket, onFeedback }) {

    const [valorBRL,   setValorBRL  ] = useState('');
    const [metodo,     setMetodo    ] = useState('pix');
    const [etapa,      setEtapa     ] = useState('selecao'); // selecao | aguardando | qrcode | sucesso
    const [qrCode,     setQrCode    ] = useState(null);
    const [pixCopia,   setPixCopia  ] = useState(null);
    const [copiado,    setCopiado   ] = useState(false);
    const [erroValor,  setErroValor ] = useState('');

    // ── NOVO: controle do PIN ──────────────────────────────────────
    const [pinAberto,    setPinAberto]    = useState(false);
    const [calculoPendente, setCalculoPendente] = useState(null);
    // ─────────────────────────────────────────────────────────────

    // Valor numérico limpo
    const valorNum = parseFloat(valorBRL) || 0;

    // Cálculo em tempo real
    const calculo = useMemo(() => {
        if (!valorNum || valorNum < LIMITES.DEPOSITO_MIN_BRL) return null;
        return calcularDeposito(valorNum);
    }, [valorNum]);

    // Fichas de mesa = ₿C / 1000
    const fichasMesa = calculo ? Math.floor(calculo.bcRecebido / 1000) : 0;


    // ----------------------------------------------------------------
    // Escuta eventos do socket
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        socket.on('wallet:deposito_confirmado', ({ bcCreditar }) => {
            setEtapa('sucesso');
            onFeedback?.('sucesso', `✅ ₿C ${fmtBC(bcCreditar)} creditados! (${Math.floor(bcCreditar / 1000)} fichas)`);
            setTimeout(() => {
                setEtapa('selecao');
                setValorBRL('');
                setQrCode(null);
                setPixCopia(null);
            }, 3000);
        });

        socket.on('wallet:deposito_iniciado', (data) => {
            if (data.qrCode)        setQrCode(data.qrCode);
            if (data.pixCopiaECola) setPixCopia(data.pixCopiaECola);
            setEtapa('qrcode');
        });

        // Sem isso, PIN errado / valor inválido / falha no PIX deixava a
        // tela travada pra sempre no spinner "Gerando pagamento...".
        const onErro = ({ mensagem }) => {
            if (etapa !== 'aguardando') return;
            setEtapa('selecao');
            onFeedback?.('erro', mensagem || 'Não foi possível gerar o pagamento. Tente novamente.');
        };
        socket.on('erro', onErro);

        return () => {
            socket.off('wallet:deposito_confirmado');
            socket.off('wallet:deposito_iniciado');
            socket.off('erro', onErro);
        };
    }, [socket, onFeedback, etapa]);


    // ----------------------------------------------------------------
    // Seleciona valor rápido
    // ----------------------------------------------------------------
    function handleValorRapido(brl) {
        setValorBRL(String(brl));
        setErroValor('');
    }


    // ----------------------------------------------------------------
    // Inicia pagamento → valida → abre PIN
    // ----------------------------------------------------------------
    function handleComprar() {
        if (!usuario?.temPin) {
            onFeedback?.('erro', 'Você ainda não tem um PIN de segurança. Crie um em Configurações antes de comprar.');
            return;
        }
        if (!valorNum || valorNum < LIMITES.DEPOSITO_MIN_BRL) {
            setErroValor(`Valor mínimo: R$ ${fmt(LIMITES.DEPOSITO_MIN_BRL)}`);
            return;
        }
        if (valorNum > LIMITES.DEPOSITO_MAX_BRL) {
            setErroValor(`Valor máximo: R$ ${fmt(LIMITES.DEPOSITO_MAX_BRL)}`);
            return;
        }
        if (!calculo || !socket) return;

        // ── NOVO: guarda o cálculo e abre o PIN ───────────────────
        setCalculoPendente(calculo);
        setPinAberto(true);
        // ─────────────────────────────────────────────────────────
    }

    // ----------------------------------------------------------------
    // PIN confirmado → emite ao backend
    // ----------------------------------------------------------------
    function handlePinConfirmado(pin) {
        if (!calculoPendente || !socket) return;

        setPinAberto(false);
        setEtapa('aguardando');

        socket.emit('wallet:depositar', {
            uid:        usuario?.uid,
            valorBRL:   calculoPendente.valorBRL,
            taxaBRL:    calculoPendente.taxaBRL,
            bcEsperado: calculoPendente.bcRecebido,
            pin,
            metodo,
        });

        setCalculoPendente(null);
    }


    // ----------------------------------------------------------------
    // Copia PIX
    // ----------------------------------------------------------------
    function handleCopiarPix() {
        if (!pixCopia) return;
        navigator.clipboard.writeText(pixCopia).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    }

    function handleCancelar() {
        setEtapa('selecao');
        setQrCode(null);
        setPixCopia(null);
    }


    // ================================================================
    // AGUARDANDO
    // ================================================================
    if (etapa === 'aguardando') {
        return (
            <div style={estilos.container}>
                <div style={estilos.estadoBox}>
                    <span style={{ fontSize: '36px' }}>⏳</span>
                    <p style={estilos.estadoTitulo}>Gerando pagamento...</p>
                    <p style={estilos.estadoSub}>Conectando ao Mercado Pago</p>
                </div>
            </div>
        );
    }


    // ================================================================
    // QR CODE PIX
    // ================================================================
    if (etapa === 'qrcode') {
        return (
            <div style={estilos.container}>
                <div style={estilos.qrcodeBox}>
                    <p style={estilos.qrcodeTitulo}>📱 Pague com PIX</p>
                    <p style={estilos.qrcodeSub}>Escaneie o QR Code ou copie o código</p>

                    {qrCode ? (
                        <img
                            src={`data:image/png;base64,${qrCode}`}
                            alt="QR Code PIX"
                            style={estilos.qrcodeImg}
                        />
                    ) : (
                        <div style={estilos.qrcodePlaceholder}>
                            <span style={{ fontSize: '48px' }}>📷</span>
                            <p style={{ fontSize: '12px', color: 'var(--cor-texto-3)', margin: '8px 0 0' }}>
                                Carregando QR Code...
                            </p>
                        </div>
                    )}

                    <div style={estilos.qrcodeResumo}>
                        <span style={{ color: 'var(--cor-texto-2)', fontSize: '13px' }}>
                            ₿C {fmtBC(calculo?.bcRecebido || 0)} · {fichasMesa} fichas
                        </span>
                        <span style={{ color: 'var(--cor-destaque-texto)', fontWeight: '700', fontSize: '15px' }}>
                            R$ {fmt(calculo?.totalBRL || 0)}
                        </span>
                    </div>

                    {pixCopia && (
                        <button onClick={handleCopiarPix} style={estilos.btnCopiarPix}>
                            {copiado ? '✓ Copiado!' : '📋 Copiar código PIX'}
                        </button>
                    )}

                    <p style={estilos.qrcodeAviso}>
                        ₿C creditados automaticamente após o pagamento
                    </p>

                    <button onClick={handleCancelar} style={estilos.btnCancelarQr}>
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }


    // ================================================================
    // SUCESSO
    // ================================================================
    if (etapa === 'sucesso') {
        return (
            <div style={estilos.container}>
                <div style={estilos.estadoBox}>
                    <span style={{ fontSize: '48px' }}>🎉</span>
                    <p style={estilos.estadoTitulo}>Pagamento confirmado!</p>
                    <p style={estilos.estadoSub}>
                        {fichasMesa} fichas adicionadas à sua carteira
                    </p>
                </div>
            </div>
        );
    }


    // ================================================================
    // SELEÇÃO PRINCIPAL
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Explicação da conversão ---- */}
            <div style={estilos.avisoMoeda}>
                <span style={{ fontSize: '14px' }}>ℹ️</span>
                <p style={estilos.avisoTexto}>
                    R$ 1,00 = <strong style={{ color: 'var(--cor-destaque-texto)' }}>₿C 1.000</strong> = <strong style={{ color: 'var(--cor-destaque-texto)' }}>1 ficha</strong> na mesa
                    · Taxa: {TAXAS.DEPOSITO * 100}% · Saque a qualquer momento
                </p>
            </div>

            {/* ---- Valores rápidos ---- */}
            <div>
                <p style={estilos.secaoLabel}>Valores rápidos</p>
                <div style={estilos.valoresRapidos}>
                    {VALORES_RAPIDOS.map(v => {
                        const ativo = valorNum === v.brl;
                        return (
                            <button
                                key={v.brl}
                                onClick={() => handleValorRapido(v.brl)}
                                style={{
                                    ...estilos.btnRapido,
                                    background: ativo ? 'var(--cor-destaque-suave)' : 'var(--cor-superficie)',
                                    border:     ativo ? '1px solid var(--cor-destaque-linha)' : '1px solid var(--cor-linha)',
                                    color:      ativo ? 'var(--cor-destaque-texto)' : 'var(--cor-texto-2)',
                                }}
                            >
                                <span style={{ fontSize: '13px', fontWeight: '700' }}>{v.label}</span>
                                <span style={{ fontSize: '10px', color: ativo ? 'var(--cor-destaque-texto)' : 'var(--cor-texto-3)' }}>
                                    {v.fichas} fichas
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ---- Campo livre ---- */}
            <div>
                <p style={estilos.secaoLabel}>Ou digite o valor</p>
                <div style={estilos.inputGroup}>
                    <span style={estilos.inputPrefix}>R$</span>
                    <input
                        type="number"
                        min={LIMITES.DEPOSITO_MIN_BRL}
                        max={LIMITES.DEPOSITO_MAX_BRL}
                        step="1"
                        placeholder="0,00"
                        value={valorBRL}
                        onChange={e => {
                            setValorBRL(e.target.value);
                            setErroValor('');
                        }}
                        style={estilos.input}
                    />
                    {valorNum > 0 && (
                        <span style={estilos.inputSufixo}>
                            = {Math.floor(valorNum)} fichas
                        </span>
                    )}
                </div>
                {erroValor && <p style={estilos.erroTexto}>{erroValor}</p>}
            </div>

            {/* ---- Preview do cálculo ---- */}
            {calculo && (
                <div style={estilos.preview}>

                    {/* Fichas em destaque */}
                    <div style={estilos.previewFichas}>
                        <span style={estilos.previewFichasNum}>{fichasMesa}</span>
                        <div>
                            <p style={estilos.previewFichasLabel}>fichas na mesa</p>
                            <p style={estilos.previewFichasSub}>₿C {fmtBC(calculo.bcRecebido)} na carteira</p>
                        </div>
                    </div>

                    <div style={estilos.previewDivisor} />

                    {/* Detalhes financeiros */}
                    <LinhaPreview label="Valor depositado"          valor={`R$ ${fmt(calculo.valorBRL)}`} />
                    <LinhaPreview
                        label={`Taxa (${calculo.taxaPerc}%)`}
                        valor={`+ R$ ${fmt(calculo.taxaBRL)}`}
                        cor="var(--cor-destaque-texto)"
                    />
                    <div style={estilos.previewDivisor} />
                    <LinhaPreview label="Total cobrado"             valor={`R$ ${fmt(calculo.totalBRL)}`}           destaque />
                    <LinhaPreview
                        label="Saldo após depósito"
                        valor={`₿C ${fmtBC(saldoAtual + calculo.bcRecebido)}`}
                        cor="var(--cor-positivo-texto)"
                    />
                </div>
            )}

            {/* ---- Método de pagamento ---- */}
            {calculo && (
                <>
                    <p style={estilos.labelMetodo}>Pagar com</p>
                    <div style={estilos.metodos}>
                        {[
                            { id: 'pix',    icone: '📱', label: 'PIX',    badge: 'Recomendado', disponivel: true },
                            { id: 'cartao', icone: '💳', label: 'Cartão', badge: 'Em breve',     disponivel: false },
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => m.disponivel && setMetodo(m.id)}
                                disabled={!m.disponivel}
                                title={m.disponivel ? undefined : 'Pagamento por cartão ainda não está disponível'}
                                style={{
                                    ...estilos.btnMetodo,
                                    background: metodo === m.id ? 'var(--cor-destaque-suave)' : 'var(--cor-superficie)',
                                    border:     metodo === m.id ? '1px solid var(--cor-destaque-linha)' : '1px solid var(--cor-linha)',
                                    color:      metodo === m.id ? 'var(--cor-destaque-texto)' : 'var(--cor-texto-2)',
                                    opacity:    m.disponivel ? 1 : 0.45,
                                    cursor:     m.disponivel ? 'pointer' : 'not-allowed',
                                }}
                            >
                                <span style={{ fontSize: '18px' }}>{m.icone}</span>
                                <span style={{ fontSize: '12px', fontWeight: metodo === m.id ? '600' : '400' }}>
                                    {m.label}
                                </span>
                                {m.badge && <span style={estilos.badgePix}>{m.badge}</span>}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ---- Botão comprar ---- */}
            <button
                onClick={handleComprar}
                disabled={!calculo}
                style={{
                    ...estilos.btnConfirmar,
                    background: calculo ? 'var(--cor-destaque)' : 'var(--cor-linha)',
                    color:      calculo ? '#fff' : 'var(--cor-texto-3)',
                    cursor:     calculo ? 'pointer' : 'not-allowed',
                }}
            >
                {calculo
                    ? `${metodo === 'pix' ? '📱' : '💳'} Pagar R$ ${fmt(calculo.totalBRL)} · Receber ${fichasMesa} fichas`
                    : 'Selecione um valor'
                }
            </button>

            <p style={estilos.avisoSeguro}>
                🔒 Pagamento seguro via Mercado Pago · Fichas creditadas automaticamente
            </p>

            {/* ---- Modal de PIN ---- */}
            {pinAberto && calculoPendente && (
                <PinConfirm
                    titulo="Confirmar depósito"
                    descricao={`R$ ${fmt(calculoPendente.totalBRL)} → ₿C ${fmtBC(calculoPendente.bcRecebido)}`}
                    onConfirmar={handlePinConfirmado}
                    onCancelar={() => { setPinAberto(false); setCalculoPendente(null); }}
                />
            )}

        </div>
    );
}


// ================================================================
// SUBCOMPONENTES
// ================================================================

function LinhaPreview({ label, valor, cor, destaque }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
                fontSize:   destaque ? '13px' : '12px',
                color:      'var(--cor-texto-3)',
                fontWeight: destaque ? '500' : '400',
            }}>
                {label}
            </span>
            <span style={{
                fontSize:   destaque ? '14px' : '13px',
                fontWeight: destaque ? '700' : '500',
                color:      cor || 'var(--cor-texto)',
            }}>
                {valor}
            </span>
        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '16px',
    },

    avisoMoeda: {
        display:      'flex',
        gap:          '8px',
        alignItems:   'flex-start',
        padding:      '10px 12px',
        background:   'color-mix(in srgb, var(--cor-info) 8%, transparent)',
        border:       '1px solid color-mix(in srgb, var(--cor-info) 20%, transparent)',
        borderRadius: '8px',
    },

    avisoTexto: {
        fontSize:   '11px',
        color:      'var(--cor-texto-2)',
        margin:     0,
        lineHeight: 1.5,
    },

    secaoLabel: {
        fontSize:      '11px',
        fontWeight:    '600',
        color:         'var(--cor-texto-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin:        '0 0 8px',
    },

    // Valores rápidos
    valoresRapidos: {
        display:             'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap:                 '6px',
    },

    btnRapido: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '3px',
        padding:        '10px 4px',
        borderRadius:   '8px',
        cursor:         'pointer',
        outline:        'none',
        fontFamily:     'inherit',
        transition:     'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    // Campo livre
    inputGroup: {
        display:      'flex',
        alignItems:   'center',
        background:   'var(--cor-superficie)',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '8px',
        overflow:     'hidden',
    },

    inputPrefix: {
        padding:     '0 12px',
        fontSize:    '14px',
        fontWeight:  '700',
        color:       'var(--cor-destaque-texto)',
        background:  'var(--cor-destaque-suave)',
        borderRight: '1px solid var(--cor-linha)',
        alignSelf:   'stretch',
        display:     'flex',
        alignItems:  'center',
    },

    input: {
        flex:       1,
        padding:    '12px',
        background: 'transparent',
        border:     'none',
        outline:    'none',
        color:      'var(--cor-texto)',
        fontSize:   '16px',
        fontWeight: '600',
        fontFamily: 'inherit',
    },

    inputSufixo: {
        padding:   '0 12px',
        fontSize:  '11px',
        color:     'var(--cor-destaque-texto)',
        fontWeight:'600',
        whiteSpace:'nowrap',
    },

    erroTexto: {
        fontSize:  '11px',
        color:     'var(--cor-perigo-texto)',
        margin:    '4px 0 0',
    },

    // Preview
    preview: {
        background:    'var(--cor-superficie)',
        border:        '1px solid var(--cor-linha)',
        borderRadius:  '10px',
        padding:       '14px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    previewFichas: {
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
    },

    previewFichasNum: {
        fontSize:   '36px',
        fontWeight: '900',
        color:      'var(--cor-destaque-texto)',
        lineHeight:  1,
    },

    previewFichasLabel: {
        fontSize:   '14px',
        fontWeight: '600',
        color:      'var(--cor-texto)',
        margin:     0,
    },

    previewFichasSub: {
        fontSize:  '11px',
        color:     'var(--cor-texto-3)',
        margin:    '2px 0 0',
    },

    previewDivisor: {
        height:     '1px',
        background: 'var(--cor-superficie)',
    },

    // Método de pagamento
    labelMetodo: {
        fontSize:      '11px',
        color:         'var(--cor-texto-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin:        0,
    },

    metodos: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
    },

    btnMetodo: {
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
        background:   'var(--cor-positivo-suave)',
        color:        'var(--cor-positivo-texto)',
        padding:      '1px 5px',
        borderRadius: '4px',
        fontWeight:   '600',
    },

    btnConfirmar: {
        width:        '100%',
        padding:      '14px',
        border:       'none',
        borderRadius: '10px',
        fontSize:     '14px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    avisoSeguro: {
        fontSize:  '11px',
        color:     'var(--cor-texto-3)',
        textAlign: 'center',
        margin:    0,
    },

    // Estados
    estadoBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '12px',
        padding:        '40px 20px',
        textAlign:      'center',
    },

    estadoTitulo: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      'var(--cor-texto)',
        margin:     0,
    },

    estadoSub: {
        fontSize:  '13px',
        color:     'var(--cor-texto-3)',
        margin:    0,
    },

    // QR Code
    qrcodeBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '14px',
        background:     'var(--cor-superficie)',
        border:         '1px solid var(--cor-linha)',
        borderRadius:   '14px',
        padding:        '20px 16px',
    },

    qrcodeTitulo: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      'var(--cor-texto)',
        margin:     0,
    },

    qrcodeSub: {
        fontSize:  '12px',
        color:     'var(--cor-texto-3)',
        margin:    0,
        textAlign: 'center',
    },

    qrcodeImg: {
        width:        '200px',
        height:       '200px',
        borderRadius: '12px',
        border:       '3px solid var(--cor-linha)',
    },

    qrcodePlaceholder: {
        width:          '200px',
        height:         '200px',
        borderRadius:   '12px',
        border:         '2px dashed var(--cor-linha-forte)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
    },

    qrcodeResumo: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        width:          '100%',
        padding:        '10px 12px',
        background:     'var(--cor-superficie)',
        borderRadius:   '8px',
    },

    btnCopiarPix: {
        width:        '100%',
        padding:      '11px',
        background:   'var(--cor-positivo-suave)',
        border:       '1px solid var(--cor-positivo)',
        borderRadius: '8px',
        color:        'var(--cor-positivo-texto)',
        fontSize:     '13px',
        fontWeight:   '600',
        cursor:       'pointer',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    qrcodeAviso: {
        fontSize:  '11px',
        color:     'var(--cor-texto-3)',
        margin:    0,
        textAlign: 'center',
    },

    btnCancelarQr: {
        background:   'transparent',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '8px',
        color:        'var(--cor-texto-3)',
        fontSize:     '12px',
        padding:      '8px 20px',
        cursor:       'pointer',
        fontFamily:   'inherit',
    },
};
