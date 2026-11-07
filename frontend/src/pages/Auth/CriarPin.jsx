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
import Icone from '../../components/Icone';
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
        { label: 'Muito fraco', cor: 'var(--cor-perigo-texto)' },
        { label: 'Fraco',       cor: 'var(--cor-perigo-rotulo)' },
        { label: 'Razoável',    cor: 'var(--cor-destaque-texto)' },
        { label: 'Forte',       cor: 'var(--cor-positivo-texto)' },
        { label: 'Muito forte', cor: 'var(--cor-destaque)' },
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
            <div className="cart-vazio" role="status">
                <span className="cart-pin-icone" aria-hidden="true"><Icone nome="check" tamanho={22} /></span>
                <p className="titulo">PIN criado</p>
                <p className="sub">Sua carteira está protegida. Entrando no jogo…</p>
            </div>
        );
    }

    const requisitos = [
        { texto: 'Mínimo 6 caracteres',     ok: pin.length >= 6 },
        { texto: '1 letra maiúscula (A-Z)', ok: /[A-Z]/.test(pin) },
        { texto: '1 número (0-9)',          ok: /[0-9]/.test(pin) },
        { texto: '1 símbolo (!@#$%^&*)',    ok: /[^A-Za-z0-9]/.test(pin) },
    ];
    let pontos = 0;
    if (pin.length >= 6)          pontos++;
    if (pin.length >= 10)         pontos++;
    if (/[A-Z]/.test(pin))        pontos++;
    if (/[0-9]/.test(pin))        pontos++;
    if (/[^A-Za-z0-9]/.test(pin)) pontos++;

    // ================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // ================================================================
    return (
        <div className="auth-form">
            <div className="auth-cab">
                <h1>Crie seu PIN de segurança</h1>
                <p>O PIN protege sua carteira ₿C. Você vai usá-lo em depósitos, saques e envios.</p>
            </div>

            <div className="auth-campos">
                <label className="cart-campo-rot" htmlFor="cpin-pin">PIN</label>
                <div className={`cart-campo${erros.length > 0 ? ' com-erro' : pinValido && pin.length > 0 ? ' com-ok' : ''}`}>
                    <input
                        id="cpin-pin"
                        type={verPin ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres…"
                        value={pin}
                        onChange={e => handlePin(e.target.value)}
                        disabled={salvando}
                        autoComplete="new-password"
                        aria-describedby="cpin-req"
                    />
                    <button type="button" onClick={() => setVerPin(v => !v)} className="cart-campo-acao" aria-label={verPin ? 'Ocultar PIN' : 'Mostrar PIN'} aria-pressed={verPin}>
                        <Icone nome="olho" tamanho={18} />
                    </button>
                </div>
                <ul id="cpin-req" className="cart-requisitos">
                    {requisitos.map(r => (
                        <li key={r.texto} className={r.ok ? 'ok' : ''}>
                            <Icone nome={r.ok ? 'check' : 'info'} tamanho={14} />{r.texto}
                        </li>
                    ))}
                </ul>
                {pin.length > 0 && forca && (
                    <div className="cart-forca" aria-label={`Força do PIN: ${forca.label}`}>
                        <div className="seg">
                            {[0, 1, 2, 3, 4].map(i => <i key={i} style={i < pontos ? { background: forca.cor } : undefined} />)}
                        </div>
                        <span style={{ color: forca.cor }}>{forca.label}</span>
                    </div>
                )}
                {erros.length > 0 && <p className="cart-erro" role="alert">{erros.join(', ')}.</p>}

                <label className="cart-campo-rot" htmlFor="cpin-conf">Confirmar PIN</label>
                <div className={`cart-campo${erroConfirm ? ' com-erro' : pinsBatem ? ' com-ok' : ''}`}>
                    <input
                        id="cpin-conf"
                        type={verConfirmar ? 'text' : 'password'}
                        placeholder="Digite o PIN de novo…"
                        value={confirmar}
                        onChange={e => handleConfirmar(e.target.value)}
                        disabled={salvando}
                        autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setVerConfirmar(v => !v)} className="cart-campo-acao" aria-label={verConfirmar ? 'Ocultar PIN' : 'Mostrar PIN'} aria-pressed={verConfirmar}>
                        <Icone nome="olho" tamanho={18} />
                    </button>
                </div>
                {erroConfirm && <p className="cart-erro" role="alert">{erroConfirm}</p>}
                {pinsBatem && <p className="cart-nota positivo">Os PINs conferem.</p>}

                <p className="auth-aviso">
                    <Icone nome="alerta" tamanho={16} />
                    <span>Guarde o PIN em local seguro. Ele só pode ser recuperado com verificação por email. Nunca compartilhe.</span>
                </p>

                {erroGeral && <p className="cart-erro" role="alert">{erroGeral}</p>}

                <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={!pinValido || !pinsBatem || salvando}
                    aria-busy={salvando || undefined}
                    className="btn btn-principal cart-btn-cheio"
                >
                    {salvando ? 'Salvando…' : 'Criar PIN e entrar'}
                </button>
            </div>
        </div>
    );
}
