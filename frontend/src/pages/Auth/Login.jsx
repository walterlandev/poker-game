/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/Login.jsx

   CONCEITO GERAL:
   Tela de login com duas opções:
     → Google    : um clique, sem digitar nada
     → Email/senha: para quem prefere conta própria

   FIREBASE AUTH:
   Usamos o Firebase Authentication para gerenciar login.
   O Firebase cuida de tudo: tokens, sessão, segurança.
   Nós só chamamos as funções e reagimos ao resultado.

   DIFERENÇA DO ARQUIVO ANTERIOR:
   Removemos a inicialização do Firebase daqui.
   Agora importamos auth e db do firebase-config.js central.
   Isso evita inicializar o Firebase múltiplas vezes.

   FUNÇÕES DO FIREBASE USADAS:
     signInWithPopup            → abre popup do Google para login
     signInWithEmailAndPassword → login com email e senha
     GoogleAuthProvider         → configura o provedor do Google

   APÓS LOGIN COM SUCESSO:
   Chamamos onAutenticado(usuario) com os dados do Firebase.
   O App.jsx recebe e mostra o Lobby.

   PROPS:
     onAutenticado    → function(usuario): login bem-sucedido
     onIrParaCadastro → function(): ir para tela de cadastro
================================================================ */

import { useState } from 'react';

// Importa auth e db do arquivo central — Firebase já inicializado lá
import { auth, db } from '../../services/firebase-config';

import {
    signInWithPopup,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
} from 'firebase/auth';

import { doc, getDoc, setDoc } from 'firebase/firestore';

// Configura o provedor do Google para o login via popup
const googleProvider = new GoogleAuthProvider();


// ================================================================
// BLOCO 1: FUNÇÕES DE AUTENTICAÇÃO
//
// buscarOuCriarPerfil:
//   Após login, busca o perfil do jogador no Firestore.
//   Se não existir (primeiro login), cria um perfil novo
//   com saldo inicial de ₿C 2.000 e rank zerado.
//
// Por que salvar no Firestore além do Firebase Auth?
//   O Firebase Auth guarda apenas dados de autenticação
//   (email, nome, foto do Google).
//   Dados do jogo (saldo ₿C, rank, tema) ficam no Firestore
//   onde podemos ler e escrever livremente.
// ================================================================

async function buscarOuCriarPerfil(userFirebase) {
    const ref  = doc(db, 'jogadores', userFirebase.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        // Jogador já existe — retorna os dados salvos
        return { uid: userFirebase.uid, ...snap.data() };
    }

    // Primeiro acesso — cria o perfil
    const novoPerfil = {
        uid:        userFirebase.uid,
        nome:       userFirebase.displayName || 'Jogador',
        email:      userFirebase.email,
        avatar:     userFirebase.photoURL || '',
        saldo:      2000,       // ₿C iniciais de boas-vindas
        rankPontos: 0,
        tema:       'classico',
        criadoEm:   new Date().toISOString(),
    };

    await setDoc(ref, novoPerfil);
    return novoPerfil;
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Login({ onAutenticado, onIrParaCadastro }) {

    // Campos do formulário de email/senha
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');

    // Controla se está processando o login (desabilita botões)
    const [carregando, setCarregando] = useState(false);

    // Mensagem de erro para o usuário
    const [erro, setErro] = useState('');

    // Mostra/esconde senha
    const [verSenha, setVerSenha] = useState(false);

    // Estado do reset de senha
    const [resetEnviado, setResetEnviado] = useState(false);


    // ----------------------------------------------------------------
    // Login com Google
    // ----------------------------------------------------------------
    async function handleGoogle() {
        setCarregando(true);
        setErro('');

        try {
            // signInWithPopup: abre uma janela popup do Google
            // O usuário escolhe a conta e o Firebase retorna os dados
            const resultado = await signInWithPopup(auth, googleProvider);

            // Busca ou cria o perfil no Firestore
            const usuario = await buscarOuCriarPerfil(resultado.user);

            // Avisa o App.jsx que o login foi bem-sucedido
            onAutenticado(usuario);

        } catch (e) {
            // Usuário fechou o popup = não é erro real
            if (e.code === 'auth/popup-closed-by-user') return;
            setErro('Erro ao entrar com Google. Tente novamente.');
            console.error(e);
        } finally {
            // finally sempre roda — garante que o loading para
            setCarregando(false);
        }
    }


    // ----------------------------------------------------------------
    // Enviar link de redefinição de senha
    // ----------------------------------------------------------------
    async function handleEsqueceuSenha() {
        if (!email) {
            setErro('Digite seu email acima para receber o link de redefinição.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setResetEnviado(true);
            setErro('');
        } catch {
            setErro('Não foi possível enviar o email. Verifique o endereço digitado.');
        }
    }


    // ----------------------------------------------------------------
    // Login com email e senha
    // ----------------------------------------------------------------
    async function handleEmailSenha(e) {
        // preventDefault: impede o comportamento padrão do form (reload da página)
        e.preventDefault();

        if (!email || !senha) {
            setErro('Preencha email e senha.');
            return;
        }

        setCarregando(true);
        setErro('');

        try {
            const resultado = await signInWithEmailAndPassword(auth, email, senha);
            const usuario   = await buscarOuCriarPerfil(resultado.user);
            onAutenticado(usuario);

        } catch (e) {
            // Traduz os códigos de erro do Firebase para português
            const mensagens = {
                'auth/invalid-credential': 'Email ou senha incorretos. Se entrou pelo Google antes, use o botão "Continuar com Google".',
                'auth/user-not-found':     'Conta não encontrada. Crie uma conta primeiro.',
                'auth/wrong-password':     'Senha incorreta.',
                'auth/invalid-email':      'Email inválido.',
                'auth/too-many-requests':  'Muitas tentativas. Aguarde alguns minutos ou redefina sua senha.',
            };
            setErro(mensagens[e.code] || 'Erro ao fazer login. Tente novamente.');
            console.error(e);
        } finally {
            setCarregando(false);
        }
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Título ---- */}
            <div style={estilos.cabecalho}>
                <h2 style={estilos.titulo}>Entrar</h2>
                <p style={estilos.subtitulo}>Bem-vindo de volta!</p>
            </div>

            {/* ---- Botão Google ---- */}
            <button
                onClick={handleGoogle}
                disabled={carregando}
                style={{
                    ...estilos.btnGoogle,
                    opacity: carregando ? 0.7 : 1,
                }}
            >
                <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
                    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
                </svg>
                {carregando ? 'Entrando...' : 'Continuar com Google'}
            </button>

            {/* ---- Divisor ---- */}
            <div style={estilos.divisor}>
                <div style={estilos.linhaDivisor} />
                <span style={estilos.textoDivisor}>ou</span>
                <div style={estilos.linhaDivisor} />
            </div>

            {/* ---- Formulário email/senha ---- */}
            <form onSubmit={handleEmailSenha} style={estilos.form}>

                {/* Email */}
                <div style={estilos.campo}>
                    <label style={estilos.label}>Email</label>
                    <input
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={carregando}
                        style={estilos.input}
                        autoComplete="email"
                    />
                </div>

                {/* Senha */}
                <div style={estilos.campo}>
                    <label style={estilos.label}>Senha</label>
                    <div style={estilos.inputContainer}>
                        <input
                            type={verSenha ? 'text' : 'password'}
                            placeholder="Sua senha"
                            value={senha}
                            onChange={e => setSenha(e.target.value)}
                            disabled={carregando}
                            style={{ ...estilos.input, paddingRight: '40px' }}
                            autoComplete="current-password"
                        />
                        <button
                            type="button"
                            onClick={() => setVerSenha(v => !v)}
                            style={estilos.btnOlho}
                            tabIndex={-1}
                        >
                            {verSenha ? '🙈' : '👁️'}
                        </button>
                    </div>
                </div>

                {/* Mensagem de erro */}
                {erro && (
                    <div style={estilos.erro}>{erro}</div>
                )}

                {/* Confirmação de reset enviado */}
                {resetEnviado && (
                    <div style={estilos.sucesso}>
                        ✓ Link de redefinição enviado para {email}. Verifique sua caixa de entrada.
                    </div>
                )}

                {/* Esqueceu a senha */}
                <button
                    type="button"
                    onClick={handleEsqueceuSenha}
                    style={estilos.btnLink}
                >
                    Esqueceu a senha?
                </button>

                {/* Botão entrar */}
                <button
                    type="submit"
                    disabled={carregando}
                    style={{
                        ...estilos.btnEntrar,
                        opacity: carregando ? 0.7 : 1,
                    }}
                >
                    {carregando ? 'Entrando...' : 'Entrar'}
                </button>

            </form>

            {/* ---- Link para cadastro ---- */}
            <p style={estilos.linkCadastro}>
                Não tem conta?{' '}
                <button onClick={onIrParaCadastro} style={estilos.btnLink}>
                    Criar conta
                </button>
            </p>

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
        marginBottom: '4px',
    },

    titulo: {
        fontSize:   '22px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    subtitulo: {
        fontSize:  '13px',
        color:     'rgba(255,255,255,0.4)',
        margin:    '4px 0 0',
    },

    btnGoogle: {
        width:          '100%',
        padding:        '12px',
        background:     '#FFFFFF',
        border:         'none',
        borderRadius:   '10px',
        color:          '#1a1a1a',
        fontSize:       '14px',
        fontWeight:     '500',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '10px',
        transition:     'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
    },

    divisor: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
    },

    linhaDivisor: {
        flex:       1,
        height:     '1px',
        background: 'rgba(255,255,255,0.08)',
    },

    textoDivisor: {
        fontSize:   '12px',
        color:      'rgba(255,255,255,0.25)',
        flexShrink: 0,
    },

    form: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    campo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    label: {
        fontSize:      '12px',
        fontWeight:    '500',
        color:         'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    inputContainer: {
        position: 'relative',
    },

    input: {
        width:        '100%',
        padding:      '11px 12px',
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        '#F8FAFC',
        fontSize:     '14px',
        outline:      'none',
        boxSizing:    'border-box',
        transition:   'border-color 0.2s',
    },

    btnOlho: {
        position:   'absolute',
        right:      '10px',
        top:        '50%',
        transform:  'translateY(-50%)',
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        fontSize:   '16px',
        padding:    '4px',
        lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
    },

    erro: {
        padding:      '10px 12px',
        background:   'rgba(239,68,68,0.1)',
        border:       '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        fontSize:     '13px',
        color:        '#FCA5A5',
    },

    sucesso: {
        padding:      '10px 12px',
        background:   'rgba(34,197,94,0.1)',
        border:       '1px solid rgba(34,197,94,0.3)',
        borderRadius: '8px',
        fontSize:     '13px',
        color:        '#4ADE80',
    },

    btnEntrar: {
        width:        '100%',
        padding:      '12px',
        background:   'linear-gradient(135deg, #7C3AED, #4F46E5)',
        border:       'none',
        borderRadius: '10px',
        color:        'white',
        fontSize:     '15px',
        fontWeight:   '600',
        cursor:       'pointer',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
        marginTop:    '4px',
    },

    linkCadastro: {
        fontSize:  '13px',
        color:     'rgba(255,255,255,0.4)',
        textAlign: 'center',
        margin:    0,
    },

    btnLink: {
        background: 'none',
        border:     'none',
        color:      '#7C3AED',
        fontSize:   '13px',
        fontWeight: '600',
        cursor:     'pointer',
        padding:    0,
        WebkitTapHighlightColor: 'transparent',
    },
};
