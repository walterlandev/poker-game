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

        return () => {
            socket.off('wallet:deposito_confirmado');
            socket.off('wallet:deposito_iniciado');
        };
    }, [socket, onFeedback]);


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
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '8px 0 0' }}>
                                Carregando QR Code...
                            </p>
                        </div>
                    )}

                    <div style={estilos.qrcodeResumo}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                            ₿C {fmtBC(calculo?.bcRecebido || 0)} · {fichasMesa} fichas
                        </span>
                        <span style={{ color: '#F59E0B', fontWeight: '700', fontSize: '15px' }}>
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
                    R$ 1,00 = <strong style={{ color: '#F59E0B' }}>₿C 1.000</strong> = <strong style={{ color: '#A78BFA' }}>1 ficha</strong> na mesa
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
                                    background: ativo ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                                    border:     ativo ? '1px solid rgba(245,158,11,0.50)' : '1px solid rgba(255,255,255,0.08)',
                                    color:      ativo ? '#F59E0B' : 'rgba(255,255,255,0.6)',
                                }}
                            >
                                <span style={{ fontSize: '13px', fontWeight: '700' }}>{v.label}</span>
                                <span style={{ fontSize: '10px', color: ativo ? '#F59E0B' : 'rgba(255,255,255,0.3)' }}>
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
                        cor="#F59E0B"
                    />
                    <div style={estilos.previewDivisor} />
                    <LinhaPreview label="Total cobrado"             valor={`R$ ${fmt(calculo.totalBRL)}`}           destaque />
                    <LinhaPreview
                        label="Saldo após depósito"
                        valor={`₿C ${fmtBC(saldoAtual + calculo.bcRecebido)}`}
                        cor="#4ADE80"
                    />
                </div>
            )}

            {/* ---- Método de pagamento ---- */}
            {calculo && (
                <>
                    <p style={estilos.labelMetodo}>Pagar com</p>
                    <div style={estilos.metodos}>
                        {[
                            { id: 'pix',    icone: '📱', label: 'PIX',    badge: 'Recomendado' },
                            { id: 'cartao', icone: '💳', label: 'Cartão', badge: null },
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => setMetodo(m.id)}
                                style={{
                                    ...estilos.btnMetodo,
                                    background: metodo === m.id ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                                    border:     metodo === m.id ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color:      metodo === m.id ? '#A78BFA' : 'rgba(255,255,255,0.5)',
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
                    background: calculo ? 'linear-gradient(135deg, #7C3AED, #4F46E5)' : 'rgba(255,255,255,0.08)',
                    color:      calculo ? '#fff' : 'rgba(255,255,255,0.3)',
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
                color:      'rgba(255,255,255,0.45)',
                fontWeight: destaque ? '500' : '400',
            }}>
                {label}
            </span>
            <span style={{
                fontSize:   destaque ? '14px' : '13px',
                fontWeight: destaque ? '700' : '500',
                color:      cor || '#F8FAFC',
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
        background:   'rgba(59,130,246,0.08)',
        border:       '1px solid rgba(59,130,246,0.2)',
        borderRadius: '8px',
    },

    avisoTexto: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.5)',
        margin:     0,
        lineHeight: 1.5,
    },

    secaoLabel: {
        fontSize:      '11px',
        fontWeight:    '600',
        color:         'rgba(255,255,255,0.35)',
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
        background:   'rgba(255,255,255,0.05)',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        overflow:     'hidden',
    },

    inputPrefix: {
        padding:     '0 12px',
        fontSize:    '14px',
        fontWeight:  '700',
        color:       '#F59E0B',
        background:  'rgba(245,158,11,0.08)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
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
        color:      '#F8FAFC',
        fontSize:   '16px',
        fontWeight: '600',
        fontFamily: 'inherit',
    },

    inputSufixo: {
        padding:   '0 12px',
        fontSize:  '11px',
        color:     '#A78BFA',
        fontWeight:'600',
        whiteSpace:'nowrap',
    },

    erroTexto: {
        fontSize:  '11px',
        color:     '#FCA5A5',
        margin:    '4px 0 0',
    },

    // Preview
    preview: {
        background:    'rgba(255,255,255,0.03)',
        border:        '1px solid rgba(255,255,255,0.07)',
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
        color:      '#A78BFA',
        lineHeight:  1,
    },

    previewFichasLabel: {
        fontSize:   '14px',
        fontWeight: '600',
        color:      '#F8FAFC',
        margin:     0,
    },

    previewFichasSub: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.35)',
        margin:    '2px 0 0',
    },

    previewDivisor: {
        height:     '1px',
        background: 'rgba(255,255,255,0.06)',
    },

    // Método de pagamento
    labelMetodo: {
        fontSize:      '11px',
        color:         'rgba(255,255,255,0.35)',
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
        background:   'rgba(34,197,94,0.2)',
        color:        '#4ADE80',
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
        color:     'rgba(255,255,255,0.25)',
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
        color:      '#F8FAFC',
        margin:     0,
    },

    estadoSub: {
        fontSize:  '13px',
        color:     'rgba(255,255,255,0.40)',
        margin:    0,
    },

    // QR Code
    qrcodeBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '14px',
        background:     '#111827',
        border:         '1px solid rgba(255,255,255,0.08)',
        borderRadius:   '14px',
        padding:        '20px 16px',
    },

    qrcodeTitulo: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    qrcodeSub: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.40)',
        margin:    0,
        textAlign: 'center',
    },

    qrcodeImg: {
        width:        '200px',
        height:       '200px',
        borderRadius: '12px',
        border:       '3px solid rgba(255,255,255,0.1)',
    },

    qrcodePlaceholder: {
        width:          '200px',
        height:         '200px',
        borderRadius:   '12px',
        border:         '2px dashed rgba(255,255,255,0.15)',
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
        background:     'rgba(255,255,255,0.04)',
        borderRadius:   '8px',
    },

    btnCopiarPix: {
        width:        '100%',
        padding:      '11px',
        background:   'rgba(34,197,94,0.12)',
        border:       '1px solid rgba(34,197,94,0.30)',
        borderRadius: '8px',
        color:        '#4ADE80',
        fontSize:     '13px',
        fontWeight:   '600',
        cursor:       'pointer',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    qrcodeAviso: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.30)',
        margin:    0,
        textAlign: 'center',
    },

    btnCancelarQr: {
        background:   'transparent',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.35)',
        fontSize:     '12px',
        padding:      '8px 20px',
        cursor:       'pointer',
        fontFamily:   'inherit',
    },
};
