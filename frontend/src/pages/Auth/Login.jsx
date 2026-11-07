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
import Icone      from '../../components/Icone';
import GoogleLogo from '../../components/GoogleLogo';

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

    // Primeiro acesso — cria o perfil igual ao do Cadastro, com tudo
    // zerado. O bônus de boas-vindas é resgatado depois na Carteira
    // (wallet:resgatar_bonus). As regras do Firestore recusam perfil novo
    // com saldo diferente de zero.
    const novoPerfil = {
        uid:            userFirebase.uid,
        nome:           userFirebase.displayName || 'Jogador',
        email:          userFirebase.email,
        avatar:         userFirebase.photoURL || '',
        saldo:          0,
        saldoBonus:     0,
        sacadoHoje:     0,
        bonusResgatado: false,
        rankPontos:     0,
        tema:           'classico',
        temasComprados: [],
        criadoEm:       new Date().toISOString(),
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


    return (
        <div className="auth-form">
            <div className="auth-cab">
                <h1>Entrar</h1>
                <p>Que bom te ver de volta.</p>
            </div>

            <button type="button" onClick={handleGoogle} disabled={carregando} className="btn auth-google">
                <GoogleLogo />
                {carregando ? 'Entrando…' : 'Continuar com Google'}
            </button>

            <div className="auth-ou" aria-hidden="true"><span>ou com email</span></div>

            <form onSubmit={handleEmailSenha} className="auth-campos" noValidate>
                <label className="cart-campo-rot" htmlFor="login-email">Email</label>
                <div className="cart-campo">
                    <input
                        id="login-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        placeholder="voce@exemplo.com…"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={carregando}
                        autoComplete="email"
                        spellCheck={false}
                    />
                </div>

                <label className="cart-campo-rot" htmlFor="login-senha">Senha</label>
                <div className="cart-campo">
                    <input
                        id="login-senha"
                        name="senha"
                        type={verSenha ? 'text' : 'password'}
                        placeholder="Sua senha…"
                        value={senha}
                        onChange={e => setSenha(e.target.value)}
                        disabled={carregando}
                        autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setVerSenha(v => !v)} className="cart-campo-acao" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={verSenha}>
                        <Icone nome="olho" tamanho={18} />
                    </button>
                </div>

                {erro && <p className="cart-erro" role="alert">{erro}</p>}
                {resetEnviado && (
                    <p className="cart-nota positivo" role="status">
                        Enviamos o link de redefinição para {email}. Confira sua caixa de entrada.
                    </p>
                )}

                <button type="button" onClick={handleEsqueceuSenha} className="cart-link auth-esqueci">
                    Esqueci a senha
                </button>

                <button type="submit" disabled={carregando} aria-busy={carregando || undefined} className="btn btn-principal cart-btn-cheio">
                    {carregando ? 'Entrando…' : 'Entrar'}
                </button>
            </form>

            <p className="auth-troca">
                Ainda não tem conta?{' '}
                <button type="button" onClick={onIrParaCadastro} className="cart-link">Criar conta</button>
            </p>
        </div>
    );
}
