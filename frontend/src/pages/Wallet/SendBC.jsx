/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/SendBC.jsx

   CONCEITO GERAL:
   Permite que o jogador transfira ₿C para outro jogador.
   Fluxo:
     1. Jogador digita nome/uid do destinatário
     2. Sistema busca e confirma que o destinatário existe
     3. Jogador informa o valor em ₿C
     4. Preview mostra taxa + total debitado
     5. PinConfirm solicita PIN de segurança
     6. socket.emit('wallet:enviar') → backend executa

   SEGURANÇA:
     → PIN obrigatório antes de qualquer envio
     → Validação de saldo + limites via walletUtils
     → Backend re-valida tudo antes de executar
     → Jogador não pode enviar para si mesmo

   PROPS:
     saldo      → number  : saldo atual do remetente em ₿C
     usuario    → object  : { uid, nome }
     socket     → Socket.io
     onFeedback → fn(tipo, msg)
================================================================ */

import { useState, useRef, useCallback } from 'react';
import PinConfirm from './PinConfirm';
import {
    calcularEnvio,
    validarEnvio,
    fmtBC,
    fmt,
    bcParaBRL,
    LIMITES,
    TAXAS,
} from './walletUtils';


// ================================================================
// BLOCO 1: ESTADOS DO FLUXO
// ================================================================
// idle       → tela inicial, busca de destinatário
// buscando   → aguardando resposta do socket sobre o destinatário
// confirmando→ destinatário encontrado, jogador informa o valor
// pin        → valor confirmado, aguarda PIN
// enviando   → PIN confirmado, aguardando resposta do backend

const ETAPA = {
    IDLE:        'idle',
    BUSCANDO:    'buscando',
    CONFIRMANDO: 'confirmando',
    PIN:         'pin',
    ENVIANDO:    'enviando',
};


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function SendBC({ saldo, usuario, socket, onFeedback }) {

    const [etapa,          setEtapa]          = useState(ETAPA.IDLE);
    const [queryDestinat,  setQueryDestinat]   = useState('');
    const [destinatario,   setDestinatario]    = useState(null);  // { uid, nome, avatar }
    const [valorEnvio,     setValorEnvio]      = useState('');
    const [mensagem,       setMensagem]        = useState('');    // mensagem opcional
    const [erroDestinat,   setErroDestinat]    = useState(null);
    const [erroValor,      setErroValor]       = useState(null);

    const timeoutBusca = useRef(null);

    const preview = (() => {
        const v = parseFloat(valorEnvio);
        return !isNaN(v) && v > 0 ? calcularEnvio(v) : null;
    })();


    // ----------------------------------------------------------------
    // Busca destinatário com debounce de 600ms
    // ----------------------------------------------------------------
    const buscarDestinatario = useCallback((query) => {
        setQueryDestinat(query);
        setDestinatario(null);
        setErroDestinat(null);

        if (timeoutBusca.current) clearTimeout(timeoutBusca.current);
        if (!query.trim() || query.trim().length < 3) {
            setEtapa(ETAPA.IDLE);
            return;
        }

        timeoutBusca.current = setTimeout(() => {
            if (!socket) return;
            setEtapa(ETAPA.BUSCANDO);

            // Remove qualquer listener de uma busca anterior ainda pendente —
            // sem isso, duas buscas em sequência rápida podiam deixar a
            // resposta da busca antiga sobrescrever a mais recente.
            socket.off('wallet:jogador_encontrado');
            socket.off('wallet:jogador_nao_encontrado');

            socket.emit('wallet:buscar_jogador', { query: query.trim() });

            socket.once('wallet:jogador_encontrado', (data) => {
                if (!data || !data.uid) {
                    setErroDestinat('Jogador não encontrado.');
                    setEtapa(ETAPA.IDLE);
                    return;
                }
                if (data.uid === usuario?.uid) {
                    setErroDestinat('Você não pode enviar ₿C para si mesmo.');
                    setEtapa(ETAPA.IDLE);
                    return;
                }
                setDestinatario(data);
                setEtapa(ETAPA.CONFIRMANDO);
            });

            socket.once('wallet:jogador_nao_encontrado', () => {
                setErroDestinat('Jogador não encontrado. Verifique o nome ou ID.');
                setEtapa(ETAPA.IDLE);
            });

        }, 600);
    }, [socket, usuario?.uid]);


    // ----------------------------------------------------------------
    // Limpa e volta ao início
    // ----------------------------------------------------------------
    function resetar() {
        setEtapa(ETAPA.IDLE);
        setQueryDestinat('');
        setDestinatario(null);
        setValorEnvio('');
        setMensagem('');
        setErroDestinat(null);
        setErroValor(null);
        if (timeoutBusca.current) clearTimeout(timeoutBusca.current);
        socket?.off('wallet:jogador_encontrado');
        socket?.off('wallet:jogador_nao_encontrado');
    }


    // ----------------------------------------------------------------
    // Valida valor e abre PIN
    // ----------------------------------------------------------------
    function handleConfirmarValor() {
        const v   = parseFloat(valorEnvio);
        const val = validarEnvio(v, saldo);
        if (!val.valido) { setErroValor(val.erro); return; }
        setErroValor(null);
        setEtapa(ETAPA.PIN);
    }


    // ----------------------------------------------------------------
    // PIN confirmado → emite evento ao backend
    // ----------------------------------------------------------------
    function handlePinConfirmado(pin) {
        if (!destinatario || !preview || !socket) return;

        setEtapa(ETAPA.ENVIANDO);

        socket.emit('wallet:enviar', {
            remetenteUid:    usuario?.uid,
            destinatarioUid: destinatario.uid,
            valorBC:         preview.bcEnviado,
            taxaBC:          preview.taxaBC,
            totalDebitado:   preview.totalDebitado,
            mensagem:        mensagem.trim() || null,
            pin,
        });

        socket.once('wallet:envio_confirmado', () => {
            onFeedback('sucesso',
                `₿C ${fmtBC(preview.bcEnviado)} enviados para ${destinatario.nome}!`
            );
            resetar();
        });

        socket.once('wallet:envio_erro', (err) => {
            onFeedback('erro', err?.mensagem || 'Erro ao enviar. Tente novamente.');
            setEtapa(ETAPA.CONFIRMANDO);
        });
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ======================================================
                CABEÇALHO
            ====================================================== */}
            <div style={estilos.cabecalho}>
                <div>
                    <p style={estilos.titulo}>➡️ Enviar ₿C</p>
                    <p style={estilos.subtitulo}>
                        Transferência instantânea entre jogadores
                    </p>
                </div>
                {/* Saldo disponível */}
                <div style={estilos.saldoChip}>
                    <span style={estilos.saldoChipLabel}>Disponível</span>
                    <span style={estilos.saldoChipValor}>₿C {fmtBC(saldo)}</span>
                </div>
            </div>

            {/* ======================================================
                INFO DE TAXAS
            ====================================================== */}
            <div style={estilos.infoTaxa}>
                <span style={{ fontSize: '13px' }}>ℹ️</span>
                <p style={estilos.infoTaxaTexto}>
                    Taxa de envio: <strong style={{ color: '#F59E0B' }}>
                        {TAXAS.ENVIO * 100}%
                    </strong> sobre o valor enviado
                    (mínimo ₿C {fmtBC(TAXAS.ENVIO_MIN)}).
                    Máximo por envio: ₿C {fmtBC(LIMITES.ENVIO_MAX_BC)}.
                </p>
            </div>


            {/* ======================================================
                ETAPA 1 — BUSCA DE DESTINATÁRIO
            ====================================================== */}
            {(etapa === ETAPA.IDLE || etapa === ETAPA.BUSCANDO) && (
                <div style={estilos.secao}>
                    <p style={estilos.secaoLabel}>Para quem enviar?</p>

                    <div style={estilos.inputGroup}>
                        <span style={estilos.inputIcone}>🔍</span>
                        <input
                            type="text"
                            placeholder="Nome ou ID do jogador"
                            value={queryDestinat}
                            onChange={e => buscarDestinatario(e.target.value)}
                            style={estilos.input}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        {queryDestinat.length > 0 && (
                            <button onClick={resetar} style={estilos.btnLimpar}>✕</button>
                        )}
                    </div>

                    {etapa === ETAPA.BUSCANDO && (
                        <p style={estilos.buscandoTexto}>⏳ Buscando jogador...</p>
                    )}

                    {erroDestinat && (
                        <p style={estilos.erroTexto}>⚠ {erroDestinat}</p>
                    )}

                    <p style={estilos.dicaBusca}>
                        Digite pelo menos 3 caracteres para buscar
                    </p>
                </div>
            )}


            {/* ======================================================
                ETAPA 2 — DESTINATÁRIO ENCONTRADO + VALOR
            ====================================================== */}
            {(etapa === ETAPA.CONFIRMANDO || etapa === ETAPA.PIN || etapa === ETAPA.ENVIANDO) && destinatario && (
                <>
                    {/* Card do destinatário */}
                    <div style={estilos.cardDestinatario}>
                        <div style={estilos.destinatarioAvatar}>
                            {destinatario.avatar
                                ? <img src={destinatario.avatar} alt="" style={estilos.avatarImg} />
                                : <span style={estilos.avatarLetra}>
                                    {destinatario.nome?.[0]?.toUpperCase() || '?'}
                                  </span>
                            }
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={estilos.destinatarioNome}>{destinatario.nome}</p>
                            <p style={estilos.destinatarioUid}>ID: {destinatario.uid}</p>
                        </div>
                        <button onClick={resetar} style={estilos.btnTrocar}>
                            Trocar
                        </button>
                    </div>

                    {/* Input de valor */}
                    <div style={estilos.secao}>
                        <p style={estilos.secaoLabel}>Quanto enviar?</p>

                        <div style={estilos.inputGroup}>
                            <span style={estilos.inputIcone}>₿C</span>
                            <input
                                type="number"
                                min={LIMITES.ENVIO_MIN_BC}
                                max={Math.min(LIMITES.ENVIO_MAX_BC, saldo)}
                                step="100"
                                placeholder="0"
                                value={valorEnvio}
                                onChange={e => {
                                    setValorEnvio(e.target.value);
                                    setErroValor(null);
                                }}
                                style={estilos.input}
                                disabled={etapa !== ETAPA.CONFIRMANDO}
                            />
                        </div>

                        {/* Atalhos de valor rápido */}
                        <div style={estilos.atalhos}>
                            {[1000, 5000, 10000, 50000].map(v => (
                                <button
                                    key={v}
                                    onClick={() => {
                                        setValorEnvio(String(v));
                                        setErroValor(null);
                                    }}
                                    disabled={v > saldo || etapa !== ETAPA.CONFIRMANDO}
                                    style={{
                                        ...estilos.btnAtalho,
                                        opacity: v > saldo ? 0.3 : 1,
                                        cursor:  v > saldo ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    ₿C {fmtBC(v)}
                                </button>
                            ))}
                        </div>

                        {erroValor && (
                            <p style={estilos.erroTexto}>⚠ {erroValor}</p>
                        )}
                    </div>

                    {/* Preview do envio */}
                    {preview && (
                        <div style={estilos.preview}>
                            <LinhaPreview
                                label="Destinatário recebe"
                                valor={`₿C ${fmtBC(preview.bcEnviado)}`}
                                cor="#22C55E"
                                destaque
                            />
                            <LinhaPreview
                                label={`Taxa de envio (${TAXAS.ENVIO * 100}%)`}
                                valor={`₿C ${fmtBC(preview.taxaBC)}`}
                                cor="#F59E0B"
                            />
                            <div style={estilos.previewDivisor} />
                            <LinhaPreview
                                label="Total debitado do seu saldo"
                                valor={`₿C ${fmtBC(preview.totalDebitado)}`}
                                destaque
                            />
                            <LinhaPreview
                                label="Equivale a"
                                valor={`R$ ${fmt(bcParaBRL(preview.totalDebitado))}`}
                                cor="rgba(255,255,255,0.35)"
                            />
                            {/* Saldo após envio */}
                            <div style={estilos.previewDivisor} />
                            <LinhaPreview
                                label="Seu saldo após envio"
                                valor={`₿C ${fmtBC(Math.max(0, saldo - preview.totalDebitado))}`}
                                cor={saldo - preview.totalDebitado < 0 ? '#EF4444' : 'rgba(255,255,255,0.5)'}
                            />
                        </div>
                    )}

                    {/* Mensagem opcional */}
                    {etapa === ETAPA.CONFIRMANDO && (
                        <div style={estilos.secao}>
                            <p style={estilos.secaoLabel}>Mensagem <span style={{ opacity: 0.4 }}>(opcional)</span></p>
                            <textarea
                                placeholder="Ex: Boa sorte na mesa! 🃏"
                                value={mensagem}
                                onChange={e => setMensagem(e.target.value.slice(0, 100))}
                                maxLength={100}
                                rows={2}
                                style={estilos.textarea}
                            />
                            <p style={estilos.contadorMensagem}>
                                {mensagem.length}/100
                            </p>
                        </div>
                    )}

                    {/* Botão de enviar */}
                    {etapa === ETAPA.CONFIRMANDO && (
                        <button
                            onClick={handleConfirmarValor}
                            disabled={!preview}
                            style={{
                                ...estilos.btnEnviar,
                                background: preview
                                    ? 'linear-gradient(135deg, #7C3AED, #6D28D9)'
                                    : 'rgba(255,255,255,0.08)',
                                color:  preview ? '#fff' : 'rgba(255,255,255,0.3)',
                                cursor: preview ? 'pointer' : 'not-allowed',
                            }}
                        >
                            {preview
                                ? `Enviar ₿C ${fmtBC(preview.bcEnviado)} para ${destinatario.nome}`
                                : 'Informe o valor'}
                        </button>
                    )}

                    {/* Estado: enviando */}
                    {etapa === ETAPA.ENVIANDO && (
                        <div style={estilos.enviandoBox}>
                            <span style={{ fontSize: '24px' }}>⏳</span>
                            <p style={estilos.enviandoTexto}>Processando envio...</p>
                        </div>
                    )}
                </>
            )}


            {/* ======================================================
                MODAL DE PIN
            ====================================================== */}
            {etapa === ETAPA.PIN && preview && destinatario && (
                <PinConfirm
                    titulo="Confirmar envio"
                    descricao={`Enviar ₿C ${fmtBC(preview.bcEnviado)} para ${destinatario.nome}`}
                    onConfirmar={handlePinConfirmado}
                    onCancelar={() => setEtapa(ETAPA.CONFIRMANDO)}
                />
            )}


            {/* ======================================================
                AVISO DE SEGURANÇA
            ====================================================== */}
            <div style={estilos.avisoSeguranca}>
                <span style={{ fontSize: '13px' }}>🔒</span>
                <p style={estilos.avisoTexto}>
                    Envios são irreversíveis após confirmação com PIN.
                    Verifique sempre o nome do destinatário antes de confirmar.
                </p>
            </div>

        </div>
    );
}


// ================================================================
// BLOCO 3: SUBCOMPONENTES
// ================================================================

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


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '14px',
    },

    cabecalho: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        gap:            '12px',
    },

    titulo: {
        fontSize:   '15px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    subtitulo: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.35)',
        margin:    '3px 0 0',
    },

    saldoChip: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        background:    'rgba(245,158,11,0.08)',
        border:        '1px solid rgba(245,158,11,0.20)',
        borderRadius:  '8px',
        padding:       '6px 10px',
        flexShrink:    0,
    },

    saldoChipLabel: {
        fontSize:  '9px',
        color:     'rgba(245,158,11,0.65)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    saldoChipValor: {
        fontSize:   '13px',
        fontWeight: '700',
        color:      '#F59E0B',
    },

    infoTaxa: {
        display:      'flex',
        gap:          '8px',
        alignItems:   'flex-start',
        padding:      '10px 12px',
        background:   'rgba(245,158,11,0.06)',
        border:       '1px solid rgba(245,158,11,0.15)',
        borderRadius: '8px',
    },

    infoTaxaTexto: {
        fontSize:   '12px',
        color:      'rgba(255,255,255,0.45)',
        margin:     0,
        lineHeight: 1.5,
    },

    secao: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    secaoLabel: {
        fontSize:   '12px',
        fontWeight: '600',
        color:      'rgba(255,255,255,0.50)',
        margin:     0,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    // Input de busca e valor
    inputGroup: {
        display:      'flex',
        alignItems:   'center',
        background:   'rgba(255,255,255,0.05)',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        overflow:     'hidden',
    },

    inputIcone: {
        padding:    '0 12px',
        fontSize:   '13px',
        fontWeight: '700',
        color:      '#A78BFA',
        background: 'rgba(124,58,237,0.08)',
        borderRight:'1px solid rgba(255,255,255,0.08)',
        alignSelf:  'stretch',
        display:    'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
    },

    input: {
        flex:       1,
        padding:    '12px',
        background: 'transparent',
        border:     'none',
        outline:    'none',
        color:      '#F8FAFC',
        fontSize:   '15px',
        fontWeight: '500',
        fontFamily: 'inherit',
        minWidth:   0,
    },

    btnLimpar: {
        padding:    '0 12px',
        background: 'transparent',
        border:     'none',
        color:      'rgba(255,255,255,0.30)',
        cursor:     'pointer',
        fontSize:   '14px',
        alignSelf:  'stretch',
        display:    'flex',
        alignItems: 'center',
        fontFamily: 'inherit',
    },

    buscandoTexto: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.35)',
        margin:    0,
    },

    erroTexto: {
        fontSize:  '12px',
        color:     '#FCA5A5',
        margin:    0,
    },

    dicaBusca: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.20)',
        margin:    0,
    },

    // Card do destinatário encontrado
    cardDestinatario: {
        display:      'flex',
        alignItems:   'center',
        gap:          '12px',
        background:   'rgba(124,58,237,0.08)',
        border:       '1px solid rgba(124,58,237,0.25)',
        borderRadius: '10px',
        padding:      '12px',
    },

    destinatarioAvatar: {
        width:          '40px',
        height:         '40px',
        borderRadius:   '50%',
        background:     'rgba(124,58,237,0.25)',
        border:         '1px solid rgba(124,58,237,0.40)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        overflow:       'hidden',
    },

    avatarImg: {
        width:  '100%',
        height: '100%',
        objectFit: 'cover',
    },

    avatarLetra: {
        fontSize:   '18px',
        fontWeight: '700',
        color:      '#A78BFA',
    },

    destinatarioNome: {
        fontSize:   '14px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    destinatarioUid: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.30)',
        margin:    '2px 0 0',
        fontFamily:'monospace',
    },

    btnTrocar: {
        background:   'transparent',
        border:       '1px solid rgba(124,58,237,0.35)',
        borderRadius: '6px',
        color:        '#A78BFA',
        fontSize:     '11px',
        fontWeight:   '600',
        padding:      '5px 10px',
        cursor:       'pointer',
        fontFamily:   'inherit',
        flexShrink:   0,
    },

    // Atalhos de valor rápido
    atalhos: {
        display: 'flex',
        gap:     '6px',
        flexWrap:'wrap',
    },

    btnAtalho: {
        background:   'rgba(255,255,255,0.05)',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '6px',
        color:        'rgba(255,255,255,0.55)',
        fontSize:     '11px',
        padding:      '5px 10px',
        fontFamily:   'inherit',
        transition:   'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    // Preview de cálculo
    preview: {
        background:    'rgba(255,255,255,0.03)',
        border:        '1px solid rgba(255,255,255,0.07)',
        borderRadius:  '10px',
        padding:       '14px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '9px',
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

    // Textarea de mensagem
    textarea: {
        background:   'rgba(255,255,255,0.05)',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        padding:      '10px 12px',
        color:        '#F8FAFC',
        fontSize:     '13px',
        fontFamily:   'inherit',
        resize:       'none',
        outline:      'none',
        lineHeight:   1.5,
        width:        '100%',
        boxSizing:    'border-box',
    },

    contadorMensagem: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.20)',
        margin:    0,
        textAlign: 'right',
    },

    // Botão principal de enviar
    btnEnviar: {
        width:        '100%',
        padding:      '14px',
        border:       'none',
        borderRadius: '10px',
        fontSize:     '14px',
        fontWeight:   '600',
        fontFamily:   'inherit',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
        lineHeight:   1.3,
    },

    // Estado enviando
    enviandoBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        padding:        '20px',
        background:     'rgba(255,255,255,0.03)',
        border:         '1px solid rgba(255,255,255,0.07)',
        borderRadius:   '10px',
    },

    enviandoTexto: {
        fontSize:  '13px',
        color:     'rgba(255,255,255,0.40)',
        margin:    0,
    },

    // Aviso de segurança no rodapé
    avisoSeguranca: {
        display:      'flex',
        gap:          '8px',
        alignItems:   'flex-start',
        padding:      '10px 12px',
        background:   'rgba(239,68,68,0.05)',
        border:       '1px solid rgba(239,68,68,0.15)',
        borderRadius: '8px',
        marginTop:    '4px',
    },

    avisoTexto: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.35)',
        margin:     0,
        lineHeight: 1.5,
    },
};