/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/PinConfirm.jsx

   CONCEITO GERAL:
   Modal de segurança que solicita o PIN do jogador
   antes de executar qualquer ação sensível da carteira:
     → Depósito
     → Saque
     → Envio de ₿C

   FLUXO:
     1. Modal abre com título e descrição da ação pendente
     2. Jogador digita o PIN no campo de texto
     3. Pode mostrar/ocultar com botão de olho
     4. Ao clicar Confirmar, onConfirmar(pin) é chamado
     5. Backend valida o PIN real — aqui só validamos formato

   SEGURANÇA:
     → PIN oculto por padrão (type=password)
     → ESC ou clique no fundo cancela a ação
     → autoComplete="off" para evitar preenchimento automático
     → O bloqueio por tentativas erradas é feito no SERVIDOR
       (backend/wallet/wallet-manager.js, verificarPin) — um limite
       só no cliente não protegia nada de verdade, já que o modal
       remonta do zero a cada tentativa.

   PROPS:
     titulo      → string : título da ação (ex: "Confirmar saque")
     descricao   → string : resumo do que vai acontecer
     onConfirmar → fn(pin: string) : chamado com o PIN digitado
     onCancelar  → fn() : chamado ao cancelar
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';


// ================================================================
// CONSTANTES
// ================================================================

const PIN_MIN = 4;

// ================================================================
// COMPONENTE PRINCIPAL
// ================================================================

export default function PinConfirm({ titulo, descricao, onConfirmar, onCancelar }) {

    const [pin,      setPin     ] = useState('');
    const [verPin,   setVerPin  ] = useState(false);
    const [erro,     setErro    ] = useState(null);
    const [agitando, setAgitando] = useState(false);

    const inputRef = useRef(null);

    // Foca o input ao abrir
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // ----------------------------------------------------------------
    // Fechar com ESC
    // ----------------------------------------------------------------
    useEffect(() => {
        function handleKey(e) {
            if (e.key === 'Escape') onCancelar();
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onCancelar]);

    // ----------------------------------------------------------------
    // Animação de erro
    // ----------------------------------------------------------------
    const agitar = useCallback(() => {
        setAgitando(true);
        setTimeout(() => setAgitando(false), 500);
    }, []);

    // ----------------------------------------------------------------
    // Confirma o PIN — a validação de tentativas/bloqueio é toda do
    // servidor; aqui só checamos o formato antes de enviar.
    // ----------------------------------------------------------------
    const handleConfirmar = useCallback(() => {
        if (!pin || pin.length < PIN_MIN) {
            agitar();
            setErro(`PIN deve ter no mínimo ${PIN_MIN} caracteres.`);
            return;
        }
        onConfirmar(pin);
    }, [pin, agitar, onConfirmar]);

    // Confirma ao pressionar Enter
    function handleKeyDown(e) {
        if (e.key === 'Enter') handleConfirmar();
    }

    const pinValido = pin.length >= PIN_MIN;

    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.overlay} onClick={onCancelar}>

            <style>{`
                @keyframes agitar {
                    0%,100% { transform: translateX(0); }
                    20%     { transform: translateX(-8px); }
                    40%     { transform: translateX(8px); }
                    60%     { transform: translateX(-5px); }
                    80%     { transform: translateX(5px); }
                }
            `}</style>

            <div style={estilos.modal} onClick={e => e.stopPropagation()}>

                {/* Ícone */}
                <div style={estilos.iconeBox}>
                    <span style={estilos.icone}>🔐</span>
                </div>

                {/* Título e descrição */}
                <div style={estilos.textos}>
                    <p style={estilos.titulo}>{titulo}</p>
                    {descricao && (
                        <p style={estilos.descricao}>{descricao}</p>
                    )}
                </div>

                {/* Campo de PIN */}
                <div style={{
                    ...estilos.inputWrapper,
                    animation: agitando ? 'agitar 0.4s ease' : 'none',
                }}>
                    <input
                        ref={inputRef}
                        type={verPin ? 'text' : 'password'}
                        value={pin}
                        onChange={e => { setPin(e.target.value); setErro(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite seu PIN"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        style={{
                            ...estilos.input,
                            borderColor: erro
                                ? 'rgba(239,68,68,0.5)'
                                : pinValido
                                    ? 'rgba(245,158,11,0.4)'
                                    : 'rgba(255,255,255,0.12)',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setVerPin(v => !v)}
                        style={estilos.btnOlho}
                        tabIndex={-1}
                    >
                        {verPin ? '🙈' : '👁️'}
                    </button>
                </div>

                {/* Erro */}
                {erro && (
                    <p style={estilos.erroTexto}>⚠ {erro}</p>
                )}

                {/* Botão confirmar */}
                <button
                    onClick={handleConfirmar}
                    disabled={!pinValido}
                    style={{
                        ...estilos.btnConfirmar,
                        background: pinValido
                            ? 'linear-gradient(135deg, #D97706, #F59E0B)'
                            : 'rgba(255,255,255,0.06)',
                        color:  pinValido ? '#fff' : 'rgba(255,255,255,0.25)',
                        cursor: pinValido ? 'pointer' : 'not-allowed',
                    }}
                >
                    ✓ Confirmar
                </button>

                {/* Botão cancelar */}
                <button onClick={onCancelar} style={estilos.btnCancelar}>
                    Cancelar
                </button>

                {/* Aviso */}
                <p style={estilos.avisoSeguranca}>
                    🔒 Nunca compartilhe seu PIN com ninguém
                </p>

            </div>
        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    overlay: {
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.80)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         1100,
        padding:        '20px',
        backdropFilter: 'blur(6px)',
    },

    modal: {
        background:    '#0F172A',
        border:        '1px solid rgba(255,255,255,0.10)',
        borderRadius:  '20px',
        padding:       '28px 24px',
        maxWidth:      '340px',
        width:         '100%',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '16px',
        boxShadow:     '0 0 60px rgba(0,0,0,0.5)',
    },

    iconeBox: {
        width:          '56px',
        height:         '56px',
        borderRadius:   '50%',
        background:     'rgba(245,158,11,0.10)',
        border:         '1px solid rgba(245,158,11,0.25)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    icone:    { fontSize: '26px' },

    textos: {
        textAlign:     'center',
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
        width:         '100%',
    },

    titulo: {
        fontSize:   '17px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    descricao: {
        fontSize:   '13px',
        color:      'rgba(255,255,255,0.45)',
        margin:     0,
        lineHeight: 1.4,
    },

    // Campo de PIN
    inputWrapper: {
        position: 'relative',
        width:    '100%',
    },

    input: {
        width:        '100%',
        padding:      '13px 44px 13px 16px',
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.12)',
        borderRadius: '12px',
        color:        '#F8FAFC',
        fontSize:     '16px',
        fontFamily:   'inherit',
        outline:      'none',
        boxSizing:    'border-box',
        transition:   'border-color 0.2s',
        letterSpacing: '0.05em',
    },

    btnOlho: {
        position:   'absolute',
        right:      '12px',
        top:        '50%',
        transform:  'translateY(-50%)',
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        fontSize:   '18px',
        padding:    '4px',
        lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
    },

    erroTexto: {
        fontSize:  '12px',
        color:     '#FCA5A5',
        margin:    0,
        textAlign: 'center',
    },

    tentativasTexto: {
        fontSize:  '11px',
        color:     '#F59E0B',
        margin:    0,
        textAlign: 'center',
    },

    btnConfirmar: {
        width:        '100%',
        padding:      '13px',
        border:       'none',
        borderRadius: '12px',
        fontSize:     '15px',
        fontWeight:   '600',
        fontFamily:   'inherit',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
    },

    btnCancelar: {
        width:        '100%',
        padding:      '11px',
        background:   'transparent',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '10px',
        color:        'rgba(255,255,255,0.40)',
        fontSize:     '13px',
        cursor:       'pointer',
        fontFamily:   'inherit',
        transition:   'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    avisoSeguranca: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.18)',
        margin:    0,
        textAlign: 'center',
    },
};
