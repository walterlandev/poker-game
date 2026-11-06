/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/AlterarPin.jsx

   CONCEITO GERAL:
   Tela de alteração do PIN de segurança, acessível pelo perfil
   do jogador. O jogador precisa confirmar o PIN atual antes
   de definir um novo.

   FLUXO:
   1. Jogador digita o PIN atual
   2. Digita o novo PIN (com requisitos de segurança)
   3. Confirma o novo PIN
   4. Socket emite 'wallet:alterar_pin' ao backend
   5. Backend verifica o PIN atual com bcrypt, salva o novo hash

   PROPS:
     usuario    → object: { uid, nome }
     socket     → Socket.io
     onConcluido → fn(): chamada após PIN alterado com sucesso
     onCancelar  → fn(): fecha o modal/painel
================================================================ */

import { useState, useCallback } from 'react';


// ================================================================
// BLOCO 1: VALIDAÇÃO
// ================================================================

function validarPin(pin) {
    const erros = [];
    if (pin.length < 6)               erros.push('Mínimo 6 caracteres');
    if (!/[A-Z]/.test(pin))           erros.push('Pelo menos 1 letra maiúscula');
    if (!/[0-9]/.test(pin))           erros.push('Pelo menos 1 número');
    if (!/[^A-Za-z0-9]/.test(pin))    erros.push('Pelo menos 1 símbolo (!@#$%^&*)');
    return erros;
}

function forcaPin(pin) {
    let pontos = 0;
    if (pin.length >= 6)           pontos++;
    if (pin.length >= 10)          pontos++;
    if (/[A-Z]/.test(pin))         pontos++;
    if (/[0-9]/.test(pin))         pontos++;
    if (/[^A-Za-z0-9]/.test(pin))  pontos++;

    const niveis = [
        { label: 'Muito fraco', cor: 'var(--cor-perigo-texto)' },
        { label: 'Fraco',       cor: '#F97316' },
        { label: 'Razoável',    cor: 'var(--cor-destaque-texto)' },
        { label: 'Forte',       cor: 'var(--cor-positivo-texto)' },
        { label: 'Muito forte', cor: 'var(--cor-destaque)' },
    ];
    return niveis[Math.min(pontos, niveis.length - 1)];
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function AlterarPin({ usuario, socket, onConcluido, onCancelar }) {

    const [pinAtual,     setPinAtual    ] = useState('');
    const [pinNovo,      setPinNovo     ] = useState('');
    const [confirmar,    setConfirmar   ] = useState('');
    const [verAtual,     setVerAtual    ] = useState(false);
    const [verNovo,      setVerNovo     ] = useState(false);
    const [verConfirmar, setVerConfirmar] = useState(false);
    const [erroAtual,    setErroAtual   ] = useState('');
    const [errosNovo,    setErrosNovo   ] = useState([]);
    const [erroConfirm,  setErroConfirm ] = useState('');
    const [erroGeral,    setErroGeral   ] = useState('');
    const [salvando,     setSalvando    ] = useState(false);
    const [concluido,    setConcluido   ] = useState(false);

    const forca     = pinNovo.length > 0 ? forcaPin(pinNovo) : null;
    const novoValido = validarPin(pinNovo).length === 0;
    const pinsBatem  = pinNovo === confirmar && confirmar.length > 0;


    // ----------------------------------------------------------------
    // Salva o novo PIN
    // ----------------------------------------------------------------
    const handleSalvar = useCallback(() => {
        let temErro = false;

        if (!pinAtual || pinAtual.length < 6) {
            setErroAtual('Informe o PIN atual.');
            temErro = true;
        }

        const erros = validarPin(pinNovo);
        if (erros.length > 0) {
            setErrosNovo(erros);
            temErro = true;
        }

        if (pinNovo !== confirmar) {
            setErroConfirm('Os PINs não conferem.');
            temErro = true;
        }

        if (pinAtual === pinNovo) {
            setErroGeral('O novo PIN deve ser diferente do atual.');
            temErro = true;
        }

        if (temErro) return;

        if (!socket) {
            setErroGeral('Conexão não disponível.');
            return;
        }

        setSalvando(true);
        setErroGeral('');

        socket.emit('wallet:alterar_pin', {
            uid:       usuario?.uid,
            pinAtual,
            pinNovo,
        });

        socket.once('wallet:pin_alterado', () => {
            setSalvando(false);
            setConcluido(true);
            setTimeout(() => onConcluido(), 1500);
        });

        socket.once('wallet:pin_erro', (err) => {
            setSalvando(false);
            if (err?.tipo === 'PIN_INCORRETO') {
                setErroAtual('PIN atual incorreto.');
            } else {
                setErroGeral(err?.mensagem || 'Erro ao alterar PIN.');
            }
        });

    }, [pinAtual, pinNovo, confirmar, socket, usuario, onConcluido]);


    // ================================================================
    // TELA DE SUCESSO
    // ================================================================
    if (concluido) {
        return (
            <div style={estilos.container}>
                <div style={estilos.sucessoBox}>
                    <span style={{ fontSize: '40px' }}>✅</span>
                    <p style={estilos.sucessoTitulo}>PIN alterado!</p>
                    <p style={estilos.sucessoSub}>Seu novo PIN já está ativo.</p>
                </div>
            </div>
        );
    }


    // ================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Cabeçalho ---- */}
            <div style={estilos.cabecalho}>
                <p style={estilos.titulo}>🔐 Alterar PIN de segurança</p>
                <p style={estilos.subtitulo}>
                    O PIN protege saques e transferências da sua carteira ₿C.
                </p>
            </div>

            {/* ---- PIN atual ---- */}
            <div style={estilos.campo}>
                <label style={estilos.label}>PIN atual</label>
                <div style={estilos.inputContainer}>
                    <input
                        type={verAtual ? 'text' : 'password'}
                        placeholder="Seu PIN atual"
                        value={pinAtual}
                        onChange={e => { setPinAtual(e.target.value); setErroAtual(''); }}
                        disabled={salvando}
                        style={{
                            ...estilos.input,
                            borderColor: erroAtual
                                ? 'var(--cor-perigo-linha)'
                                : 'var(--cor-linha)',
                        }}
                        autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setVerAtual(v => !v)} style={estilos.btnOlho} tabIndex={-1}>
                        {verAtual ? '🙈' : '👁️'}
                    </button>
                </div>
                {erroAtual && <p style={estilos.erroTexto}>{erroAtual}</p>}
            </div>

            <div style={estilos.divisor} />

            {/* ---- Novo PIN ---- */}
            <div style={estilos.campo}>
                <label style={estilos.label}>Novo PIN</label>

                {/* Requisitos */}
                <div style={estilos.requisitos}>
                    {[
                        { texto: 'Mínimo 6 caracteres',     ok: pinNovo.length >= 6 },
                        { texto: '1 letra maiúscula (A-Z)', ok: /[A-Z]/.test(pinNovo) },
                        { texto: '1 número (0-9)',           ok: /[0-9]/.test(pinNovo) },
                        { texto: '1 símbolo (!@#$%^&*)',     ok: /[^A-Za-z0-9]/.test(pinNovo) },
                    ].map((req, i) => (
                        <span key={i} style={{
                            fontSize:  '11px',
                            color:     req.ok ? 'var(--cor-positivo-texto)' : 'var(--cor-texto-3)',
                            marginRight: '10px',
                        }}>
                            {req.ok ? '✓' : '○'} {req.texto}
                        </span>
                    ))}
                </div>

                <div style={estilos.inputContainer}>
                    <input
                        type={verNovo ? 'text' : 'password'}
                        placeholder="Novo PIN seguro"
                        value={pinNovo}
                        onChange={e => { setPinNovo(e.target.value); setErrosNovo([]); }}
                        disabled={salvando}
                        style={{
                            ...estilos.input,
                            borderColor: errosNovo.length > 0
                                ? 'var(--cor-perigo-linha)'
                                : novoValido && pinNovo.length > 0
                                    ? 'var(--cor-positivo)'
                                    : 'var(--cor-linha)',
                        }}
                        autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setVerNovo(v => !v)} style={estilos.btnOlho} tabIndex={-1}>
                        {verNovo ? '🙈' : '👁️'}
                    </button>
                </div>

                {/* Barra de força */}
                {pinNovo.length > 0 && forca && (
                    <div style={{ marginTop: '4px' }}>
                        <div style={estilos.forcaContainer}>
                            {[0,1,2,3,4].map(i => (
                                <div key={i} style={{
                                    ...estilos.forcaSegmento,
                                    background: i < [0,1,2,3,4].filter(() => {
                                        let p = 0;
                                        if (pinNovo.length >= 6)          p++;
                                        if (pinNovo.length >= 10)         p++;
                                        if (/[A-Z]/.test(pinNovo))        p++;
                                        if (/[0-9]/.test(pinNovo))        p++;
                                        if (/[^A-Za-z0-9]/.test(pinNovo)) p++;
                                        return i < p;
                                    }).length ? forca.cor : 'var(--cor-linha)',
                                }} />
                            ))}
                        </div>
                        <span style={{ fontSize: '10px', color: forca.cor, display: 'block', marginTop: '2px' }}>
                            {forca.label}
                        </span>
                    </div>
                )}
            </div>

            {/* ---- Confirmar novo PIN ---- */}
            <div style={estilos.campo}>
                <label style={estilos.label}>Confirmar novo PIN</label>
                <div style={estilos.inputContainer}>
                    <input
                        type={verConfirmar ? 'text' : 'password'}
                        placeholder="Repita o novo PIN"
                        value={confirmar}
                        onChange={e => { setConfirmar(e.target.value); setErroConfirm(''); }}
                        disabled={salvando}
                        style={{
                            ...estilos.input,
                            borderColor: erroConfirm
                                ? 'var(--cor-perigo-linha)'
                                : pinsBatem
                                    ? 'var(--cor-positivo)'
                                    : 'var(--cor-linha)',
                        }}
                        autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setVerConfirmar(v => !v)} style={estilos.btnOlho} tabIndex={-1}>
                        {verConfirmar ? '🙈' : '👁️'}
                    </button>
                </div>
                {erroConfirm && <p style={estilos.erroTexto}>{erroConfirm}</p>}
                {pinsBatem && <p style={{ fontSize: '11px', color: 'var(--cor-positivo-texto)', margin: '2px 0 0' }}>✓ PINs conferem</p>}
            </div>

            {/* ---- Erro geral ---- */}
            {erroGeral && (
                <div style={estilos.erroGeral}>{erroGeral}</div>
            )}

            {/* ---- Botões ---- */}
            <div style={estilos.botoes}>
                <button onClick={onCancelar} style={estilos.btnCancelar} disabled={salvando}>
                    Cancelar
                </button>
                <button
                    onClick={handleSalvar}
                    disabled={!pinAtual || !novoValido || !pinsBatem || salvando}
                    style={{
                        ...estilos.btnSalvar,
                        opacity: pinAtual && novoValido && pinsBatem && !salvando ? 1 : 0.4,
                        cursor:  pinAtual && novoValido && pinsBatem && !salvando ? 'pointer' : 'not-allowed',
                    }}
                >
                    {salvando ? 'Salvando...' : '🔐 Salvar novo PIN'}
                </button>
            </div>

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
        gap:           '14px',
        padding:       '4px 0',
    },

    cabecalho: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '4px',
    },

    titulo: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      'var(--cor-texto)',
        margin:     0,
    },

    subtitulo: {
        fontSize:   '12px',
        color:      'var(--cor-texto-3)',
        margin:     0,
        lineHeight: 1.5,
    },

    divisor: {
        height:     '1px',
        background: 'var(--cor-superficie)',
    },

    campo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    label: {
        fontSize:      '11px',
        fontWeight:    '500',
        color:         'var(--cor-texto-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    requisitos: {
        display:   'flex',
        flexWrap:  'wrap',
        gap:       '4px',
        padding:   '8px',
        background:'var(--cor-superficie)',
        borderRadius: '6px',
    },

    inputContainer: { position: 'relative' },

    input: {
        width:        '100%',
        padding:      '11px 40px 11px 12px',
        background:   'var(--cor-superficie)',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '8px',
        color:        'var(--cor-texto)',
        fontSize:     '14px',
        outline:      'none',
        boxSizing:    'border-box',
        transition:   'border-color 0.2s',
        fontFamily:   'inherit',
    },

    btnOlho: {
        position:   'absolute',
        right:      '10px',
        top:        '50%',
        transform:  'translateY(-50%)',
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        fontSize:   '15px',
        padding:    '4px',
        lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
    },

    erroTexto: {
        fontSize: '11px',
        color:    'var(--cor-perigo-texto)',
        margin:   0,
    },

    forcaContainer: {
        display: 'flex',
        gap:     '3px',
    },

    forcaSegmento: {
        flex:         1,
        height:       '3px',
        borderRadius: '2px',
        transition:   'background 0.3s',
    },

    erroGeral: {
        padding:      '10px 12px',
        background:   'var(--cor-perigo-suave)',
        border:       '1px solid var(--cor-perigo-linha)',
        borderRadius: '8px',
        fontSize:     '13px',
        color:        'var(--cor-perigo-texto)',
    },

    botoes: {
        display: 'flex',
        gap:     '10px',
    },

    btnCancelar: {
        flex:         1,
        padding:      '12px',
        background:   'transparent',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '10px',
        color:        'var(--cor-texto-3)',
        fontSize:     '13px',
        cursor:       'pointer',
        fontFamily:   'inherit',
    },

    btnSalvar: {
        flex:         2,
        padding:      '12px',
        background:   'var(--cor-destaque)',
        border:       'none',
        borderRadius: '10px',
        color:        'var(--cor-texto-inverso)',
        fontSize:     '14px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    sucessoBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '10px',
        padding:        '30px 20px',
        textAlign:      'center',
    },

    sucessoTitulo: {
        fontSize:   '20px',
        fontWeight: '800',
        color:      'var(--cor-positivo-texto)',
        margin:     0,
    },

    sucessoSub: {
        fontSize: '13px',
        color:    'var(--cor-texto-3)',
        margin:   0,
    },
};