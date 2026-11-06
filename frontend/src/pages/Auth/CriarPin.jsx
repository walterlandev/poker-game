/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/CriarPin.jsx

   CONCEITO GERAL:
   Tela obrigatória exibida imediatamente após o cadastro.
   O jogador define sua senha de segurança (PIN) antes de
   entrar no lobby.

   O PIN protege operações sensíveis da carteira:
     → Saques
     → Envio de ₿C para outros jogadores
     → Futuramente: alterações no perfil financeiro

   REGRAS DO PIN:
     → Mínimo 6 caracteres
     → Deve conter pelo menos 1 letra maiúscula
     → Deve conter pelo menos 1 número
     → Deve conter pelo menos 1 símbolo especial (!@#$%^&*)
     → Confirmação obrigatória (digitar duas vezes)

   SEGURANÇA:
     → O PIN nunca é enviado em texto claro ao backend
     → O backend recebe o PIN e salva como hash bcrypt
     → Nunca é possível recuperar o PIN original do banco
     → Para redefinir: o jogador precisa confirmar o email

   PROPS:
     usuario     → object: dados do jogador recém-cadastrado
     socket      → Socket.io: para emitir o PIN ao backend
     onConcluido → fn(): chamada após PIN criado com sucesso
================================================================ */

import { useState, useCallback, useRef, useEffect } from 'react';
import { auth } from '../../services/firebase-config';

const TIMEOUT_SOCKET_MS = 10000;
const TIMEOUT_PIN_MS    = 15000;


// ================================================================
// Garante que o socket está conectado E autenticado no servidor.
// O servidor ignora 'wallet:criar_pin' em silêncio se o socket ainda
// não passou por 'autenticar' — por isso não dá pra confiar que o
// App.jsx já fez isso (durante o cadastro ele só conecta no fim).
// Rejeita com Error se não conseguir dentro do prazo.
// ================================================================
function garantirSocketAutenticado(socket, usuario) {
    return new Promise((resolve, reject) => {
        let finalizado = false;
        let timer = null;

        function limpar() {
            clearTimeout(timer);
            socket.off('connect',     aoConectar);
            socket.off('autenticado', aoAutenticar);
            socket.off('erro',        aoErro);
        }
        function terminar(err) {
            if (finalizado) return;
            finalizado = true;
            limpar();
            if (err) reject(err); else resolve();
        }

        async function enviarAutenticar() {
            try {
                const idToken = await auth.currentUser?.getIdToken();
                const avatar  = usuario?.avatar?.startsWith('data:') ? '' : (usuario?.avatar || '');
                socket.emit('autenticar', {
                    uid:  usuario?.uid,
                    nome: usuario?.nome,
                    avatar,
                    idToken,
                });
            } catch {
                terminar(new Error('Não foi possível validar sua sessão. Tente novamente.'));
            }
        }

        function aoConectar()   { enviarAutenticar(); }
        function aoAutenticar() { terminar(null); }
        function aoErro(e)      { terminar(new Error(e?.mensagem || 'Falha ao autenticar.')); }

        socket.on('autenticado', aoAutenticar);
        socket.on('erro',        aoErro);
        timer = setTimeout(
            () => terminar(new Error('Sem resposta do servidor. Verifique sua conexão e tente novamente.')),
            TIMEOUT_SOCKET_MS
        );

        if (socket.connected) {
            enviarAutenticar();
        } else {
            socket.on('connect', aoConectar);
            socket.connect();
        }
    });
}


// ================================================================
// BLOCO 1: VALIDAÇÃO DO PIN
// ================================================================

function validarPin(pin) {
    const erros = [];

    if (pin.length < 6)
        erros.push('Mínimo 6 caracteres');
    if (!/[A-Z]/.test(pin))
        erros.push('Pelo menos 1 letra maiúscula');
    if (!/[0-9]/.test(pin))
        erros.push('Pelo menos 1 número');
    if (!/[^A-Za-z0-9]/.test(pin))
        erros.push('Pelo menos 1 símbolo (!@#$%^&*)');

    return erros;
}

function forcaPin(pin) {
    let pontos = 0;
    if (pin.length >= 6)              pontos++;
    if (pin.length >= 10)             pontos++;
    if (/[A-Z]/.test(pin))            pontos++;
    if (/[0-9]/.test(pin))            pontos++;
    if (/[^A-Za-z0-9]/.test(pin))     pontos++;

    const niveis = [
        { label: 'Muito fraco', cor: '#EF4444' },
        { label: 'Fraco',       cor: '#F97316' },
        { label: 'Razoável',    cor: '#F59E0B' },
        { label: 'Forte',       cor: '#22C55E' },
        { label: 'Muito forte', cor: '#7C3AED' },
    ];

    return niveis[Math.min(pontos, niveis.length - 1)];
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function CriarPin({ usuario, socket, onConcluido }) {

    const [pin,         setPin        ] = useState('');
    const [confirmar,   setConfirmar  ] = useState('');
    const [verPin,      setVerPin     ] = useState(false);
    const [verConfirmar,setVerConfirmar] = useState(false);
    const [erros,       setErros      ] = useState([]);
    const [erroConfirm, setErroConfirm] = useState('');
    const [erroGeral,   setErroGeral  ] = useState('');
    const [salvando,    setSalvando   ] = useState(false);
    const [concluido,   setConcluido  ] = useState(false);

    const montado = useRef(true);
    useEffect(() => {
        montado.current = true;
        return () => { montado.current = false; };
    }, []);

    const forca      = pin.length > 0 ? forcaPin(pin) : null;
    const errosPin   = validarPin(pin);
    const pinValido  = errosPin.length === 0;
    const pinsBatem  = pin === confirmar && confirmar.length > 0;


    // ----------------------------------------------------------------
    // Atualiza PIN e valida em tempo real
    // ----------------------------------------------------------------
    function handlePin(valor) {
        setPin(valor);
        if (erros.length > 0) setErros([]);
        if (erroGeral) setErroGeral('');
    }

    function handleConfirmar(valor) {
        setConfirmar(valor);
        if (erroConfirm) setErroConfirm('');
    }


    // ----------------------------------------------------------------
    // Salva o PIN via socket
    // ----------------------------------------------------------------
    const handleSalvar = useCallback(async () => {
        // Valida formato
        const errosFormato = validarPin(pin);
        if (errosFormato.length > 0) {
            setErros(errosFormato);
            return;
        }

        // Valida confirmação
        if (pin !== confirmar) {
            setErroConfirm('Os PINs não conferem.');
            return;
        }

        if (!socket) {
            setErroGeral('Conexão não disponível. Tente novamente.');
            return;
        }

        setSalvando(true);
        setErroGeral('');

        try {
            await garantirSocketAutenticado(socket, usuario);
        } catch (e) {
            if (!montado.current) return;
            setSalvando(false);
            setErroGeral(e.message);
            return;
        }

        // Aguarda a resposta com prazo — nunca fica em "Salvando..." para sempre
        let timer = null;
        function limpar() {
            clearTimeout(timer);
            socket.off('wallet:pin_criado', aoCriar);
            socket.off('wallet:pin_erro',   aoErro);
        }
        function aoCriar() {
            limpar();
            if (!montado.current) return;
            setSalvando(false);
            setConcluido(true);
            // Aguarda 1.5s para mostrar o sucesso antes de avançar
            setTimeout(() => onConcluido(), 1500);
        }
        function aoErro(err) {
            limpar();
            if (!montado.current) return;
            setSalvando(false);
            setErroGeral(err?.mensagem || 'Erro ao salvar PIN. Tente novamente.');
        }
        socket.on('wallet:pin_criado', aoCriar);
        socket.on('wallet:pin_erro',   aoErro);
        timer = setTimeout(() => {
            limpar();
            if (!montado.current) return;
            setSalvando(false);
            setErroGeral('O servidor não respondeu. Toque em "Criar PIN" para tentar de novo.');
        }, TIMEOUT_PIN_MS);

        // Emite ao backend — o backend faz o hash com bcrypt
        socket.emit('wallet:criar_pin', { uid: usuario?.uid, pin });

    }, [pin, confirmar, socket, usuario, onConcluido]);


    // ================================================================
    // RENDERIZAÇÃO — TELA DE SUCESSO
    // ================================================================
    if (concluido) {
        return (
            <div style={estilos.container}>
                <div style={estilos.sucessoBox}>
                    <span style={{ fontSize: '48px' }}>🔐</span>
                    <p style={estilos.sucessoTitulo}>PIN criado!</p>
                    <p style={estilos.sucessoSub}>
                        Sua carteira está protegida. Entrando no jogo...
                    </p>
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
                <div style={estilos.iconeBox}>🔐</div>
                <h2 style={estilos.titulo}>Crie seu PIN de segurança</h2>
                <p style={estilos.subtitulo}>
                    O PIN protege sua carteira ₿C. Você vai usá-lo para
                    saques e transferências.
                </p>
            </div>

            {/* ---- Requisitos ---- */}
            <div style={estilos.requisitos}>
                {[
                    { texto: 'Mínimo 6 caracteres',         ok: pin.length >= 6 },
                    { texto: '1 letra maiúscula (A-Z)',      ok: /[A-Z]/.test(pin) },
                    { texto: '1 número (0-9)',               ok: /[0-9]/.test(pin) },
                    { texto: '1 símbolo (!@#$%^&*)',         ok: /[^A-Za-z0-9]/.test(pin) },
                ].map((req, i) => (
                    <div key={i} style={estilos.requisitoItem}>
                        <span style={{
                            fontSize: '13px',
                            color:    req.ok ? '#22C55E' : 'rgba(255,255,255,0.25)',
                        }}>
                            {req.ok ? '✓' : '○'}
                        </span>
                        <span style={{
                            fontSize: '12px',
                            color:    req.ok ? '#22C55E' : 'rgba(255,255,255,0.40)',
                            textDecoration: req.ok ? 'line-through' : 'none',
                        }}>
                            {req.texto}
                        </span>
                    </div>
                ))}
            </div>

            {/* ---- Campo PIN ---- */}
            <div style={estilos.campo}>
                <label style={estilos.label}>PIN de segurança</label>
                <div style={estilos.inputContainer}>
                    <input
                        type={verPin ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={pin}
                        onChange={e => handlePin(e.target.value)}
                        disabled={salvando}
                        style={{
                            ...estilos.input,
                            borderColor: erros.length > 0
                                ? 'rgba(239,68,68,0.5)'
                                : pinValido && pin.length > 0
                                    ? 'rgba(34,197,94,0.5)'
                                    : 'rgba(255,255,255,0.1)',
                        }}
                        autoComplete="new-password"
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

                {/* Barra de força */}
                {pin.length > 0 && forca && (
                    <div style={{ marginTop: '6px' }}>
                        <div style={estilos.forcaContainer}>
                            {[0,1,2,3,4].map(i => (
                                <div key={i} style={{
                                    ...estilos.forcaSegmento,
                                    background: i < forcaPin(pin) ? forca.cor : 'rgba(255,255,255,0.08)',
                                }} />
                            ))}
                        </div>
                        <span style={{ fontSize: '10px', color: forca.cor, marginTop: '3px', display: 'block' }}>
                            {forca.label}
                        </span>
                    </div>
                )}
            </div>

            {/* ---- Campo confirmar PIN ---- */}
            <div style={estilos.campo}>
                <label style={estilos.label}>Confirmar PIN</label>
                <div style={estilos.inputContainer}>
                    <input
                        type={verConfirmar ? 'text' : 'password'}
                        placeholder="Digite o PIN novamente"
                        value={confirmar}
                        onChange={e => handleConfirmar(e.target.value)}
                        disabled={salvando}
                        style={{
                            ...estilos.input,
                            paddingRight: '40px',
                            borderColor:  erroConfirm
                                ? 'rgba(239,68,68,0.5)'
                                : pinsBatem
                                    ? 'rgba(34,197,94,0.5)'
                                    : 'rgba(255,255,255,0.1)',
                        }}
                        autoComplete="new-password"
                    />
                    <button
                        type="button"
                        onClick={() => setVerConfirmar(v => !v)}
                        style={estilos.btnOlho}
                        tabIndex={-1}
                    >
                        {verConfirmar ? '🙈' : '👁️'}
                    </button>
                </div>
                {erroConfirm && <p style={estilos.erroTexto}>{erroConfirm}</p>}
                {pinsBatem && <p style={{ fontSize: '11px', color: '#22C55E', margin: '2px 0 0' }}>✓ PINs conferem</p>}
            </div>

            {/* ---- Aviso de segurança ---- */}
            <div style={estilos.aviso}>
                <span style={{ fontSize: '13px' }}>⚠️</span>
                <p style={estilos.avisoTexto}>
                    Guarde seu PIN em local seguro. Não é possível recuperá-lo
                    sem verificação por email. Nunca compartilhe com ninguém.
                </p>
            </div>

            {/* ---- Erro geral ---- */}
            {erroGeral && (
                <div style={estilos.erroGeral}>{erroGeral}</div>
            )}

            {/* ---- Botão salvar ---- */}
            <button
                onClick={handleSalvar}
                disabled={!pinValido || !pinsBatem || salvando}
                style={{
                    ...estilos.btnSalvar,
                    opacity: pinValido && pinsBatem && !salvando ? 1 : 0.4,
                    cursor:  pinValido && pinsBatem && !salvando ? 'pointer' : 'not-allowed',
                }}
            >
                {salvando ? 'Salvando...' : '🔐 Criar PIN e entrar no jogo'}
            </button>

        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    container: {
        padding:       '24px 20px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '16px',
    },

    cabecalho: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    iconeBox: {
        fontSize: '36px',
        lineHeight: 1,
    },

    titulo: {
        fontSize:   '20px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    subtitulo: {
        fontSize:   '13px',
        color:      'rgba(255,255,255,0.40)',
        margin:     0,
        lineHeight: 1.5,
    },

    // Requisitos do PIN
    requisitos: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
        padding:       '12px',
        background:    'rgba(255,255,255,0.03)',
        border:        '1px solid rgba(255,255,255,0.06)',
        borderRadius:  '10px',
    },

    requisitoItem: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    campo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    label: {
        fontSize:      '11px',
        fontWeight:    '500',
        color:         'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    inputContainer: {
        position: 'relative',
    },

    input: {
        width:        '100%',
        padding:      '11px 40px 11px 12px',
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        '#F8FAFC',
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
        color:    '#FCA5A5',
        margin:   0,
    },

    // Barra de força do PIN
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

    // Aviso de segurança
    aviso: {
        display:      'flex',
        gap:          '8px',
        alignItems:   'flex-start',
        padding:      '10px 12px',
        background:   'rgba(245,158,11,0.06)',
        border:       '1px solid rgba(245,158,11,0.15)',
        borderRadius: '8px',
    },

    avisoTexto: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.40)',
        margin:     0,
        lineHeight: 1.5,
    },

    erroGeral: {
        padding:      '10px 12px',
        background:   'rgba(239,68,68,0.1)',
        border:       '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        fontSize:     '13px',
        color:        '#FCA5A5',
    },

    btnSalvar: {
        width:        '100%',
        padding:      '14px',
        background:   'linear-gradient(135deg, #7C3AED, #4F46E5)',
        border:       'none',
        borderRadius: '10px',
        color:        'white',
        fontSize:     '15px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        fontFamily:   'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    // Tela de sucesso
    sucessoBox: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '12px',
        padding:        '40px 20px',
        textAlign:      'center',
    },

    sucessoTitulo: {
        fontSize:   '22px',
        fontWeight: '800',
        color:      '#4ADE80',
        margin:     0,
    },

    sucessoSub: {
        fontSize:   '13px',
        color:      'rgba(255,255,255,0.45)',
        margin:     0,
        lineHeight: 1.5,
    },
};