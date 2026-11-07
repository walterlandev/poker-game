/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/Cadastro.jsx

   CONCEITO GERAL:
   Tela de cadastro de nova conta. O jogador pode se cadastrar:
     → Com Google    : preenchimento automático de nome e foto
     → Com email/senha: preenchimento manual

   DIFERENÇA DO ARQUIVO ANTERIOR:
   Removemos a inicialização do Firebase daqui.
   Agora importamos auth e db do firebase-config.js central.
   Isso evita inicializar o Firebase múltiplas vezes.

   CAMPOS DO FORMULÁRIO:
     → Nome de usuário (como vai aparecer na mesa)
     → Email
     → Senha (mínimo 6 caracteres)
     → Confirmar senha

   APÓS CADASTRO:
   1. Cria a conta no Firebase Auth
   2. Salva o perfil no Firestore com saldo inicial de ₿C 2.000
   3. Chama onAutenticado(usuario) → App.jsx mostra o Lobby

   PROPS:
     onAutenticado  → function(usuario): cadastro bem-sucedido
     onIrParaLogin  → function(): voltar para tela de login
================================================================ */

import { useState } from 'react';
import Icone      from '../../components/Icone';
import GoogleLogo from '../../components/GoogleLogo';

// Importa auth e db do arquivo central — Firebase já inicializado lá
import { auth, db } from '../../services/firebase-config';

import {
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithPopup,
    GoogleAuthProvider,
} from 'firebase/auth';

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { BONUS } from '../Wallet/walletUtils';

// Configura o provedor do Google para o login via popup
const googleProvider = new GoogleAuthProvider();


// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

// Cria o perfil do jogador no Firestore após cadastro
//
// Sem saldo real de graça aqui — o bônus de boas-vindas de verdade
// (₿C 10.000, não sacável) é o do ModalBoasVindas/wallet:resgatar_bonus,
// que já dispara sozinho no primeiro acesso (usuario.bonusResgatado
// !== true). Um `saldo: 2000` direto aqui dava ₿C real SACÁVEL de graça
// pra qualquer cadastro novo, sem nenhum depósito por trás — bug
// encontrado em auditoria, removido.
async function criarPerfil(userFirebase, nomePersonalizado) {
    const perfil = {
        uid:            userFirebase.uid,
        nome:           nomePersonalizado || userFirebase.displayName || 'Jogador',
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

    await setDoc(doc(db, 'jogadores', userFirebase.uid), perfil);
    return { perfil, novoCadastro: true };
}

// Busca perfil existente (para login com Google de conta já cadastrada)
// Retorna também se era um cadastro novo ou uma conta já existente —
// importante pra saber se deve pedir criação de PIN ou ir direto ao Lobby.
async function buscarOuCriarPerfil(userFirebase, nomePersonalizado) {
    const ref  = doc(db, 'jogadores', userFirebase.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        return { perfil: { uid: userFirebase.uid, ...snap.data() }, novoCadastro: false };
    }
    return criarPerfil(userFirebase, nomePersonalizado);
}

// Validações do formulário
// Retorna objeto de erros por campo — vazio = tudo ok
function validarForm(form) {
    const erros = {};

    if (!form.nome.trim() || form.nome.trim().length < 3) {
        erros.nome = 'Nome deve ter pelo menos 3 caracteres.';
    }

    if (form.nome.trim().length > 20) {
        erros.nome = 'Nome deve ter no máximo 20 caracteres.';
    }

    // Regex simples para validar email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        erros.email = 'Email inválido.';
    }

    if (form.senha.length < 6) {
        erros.senha = 'Senha deve ter pelo menos 6 caracteres.';
    }

    if (form.senha !== form.confirmarSenha) {
        erros.confirmarSenha = 'As senhas não conferem.';
    }

    return erros;
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Cadastro({ onAutenticado, onLoginExistente, onIrParaLogin }) {

    // Estado do formulário em um único objeto
    // Padrão: um useState por formulário em vez de um por campo
    const [form, setForm] = useState({
        nome:           '',
        email:          '',
        senha:          '',
        confirmarSenha: '',
    });

    // Erros de validação por campo
    const [erros, setErros] = useState({});

    // Erro geral do servidor
    const [erroGeral, setErroGeral] = useState('');

    // Estado de carregamento
    const [carregando, setCarregando] = useState(false);

    // Controle de visibilidade das senhas
    const [verSenha,     setVerSenha    ] = useState(false);
    const [verConfirmar, setVerConfirmar] = useState(false);


    // ----------------------------------------------------------------
    // Atualiza um campo do formulário
    // Limpa o erro do campo ao digitar
    // ----------------------------------------------------------------
    function atualizar(campo, valor) {
        setForm(f => ({ ...f, [campo]: valor }));
        if (erros[campo]) {
            setErros(e => ({ ...e, [campo]: null }));
        }
        if (erroGeral) setErroGeral('');
    }


    // ----------------------------------------------------------------
    // Cadastro com Google
    // ----------------------------------------------------------------
    async function handleGoogle() {
        setCarregando(true);
        setErroGeral('');

        try {
            const resultado = await signInWithPopup(auth, googleProvider);
            const { perfil, novoCadastro } = await buscarOuCriarPerfil(resultado.user);

            // Conta já existia (ex: clicou "Cadastrar com Google" de novo por
            // engano) → vai direto pro Lobby. Só cadastro novo passa pelo
            // fluxo de criação de PIN — senão travava em "PIN já existe".
            if (novoCadastro) {
                onAutenticado(perfil);
            } else {
                (onLoginExistente || onAutenticado)(perfil);
            }

        } catch (e) {
            if (e.code === 'auth/popup-closed-by-user') return;
            setErroGeral('Erro ao entrar com Google. Tente novamente.');
            console.error(e);
        } finally {
            setCarregando(false);
        }
    }


    // ----------------------------------------------------------------
    // Cadastro com email e senha
    // ----------------------------------------------------------------
    async function handleCadastrar(e) {
        e.preventDefault();

        // Valida o formulário antes de enviar
        const novosErros = validarForm(form);
        if (Object.keys(novosErros).length > 0) {
            setErros(novosErros);
            return;
        }

        setCarregando(true);
        setErroGeral('');

        try {
            // 1. Cria a conta no Firebase Auth
            const resultado = await createUserWithEmailAndPassword(
                auth,
                form.email.trim(),
                form.senha
            );

            // 2. Atualiza o nome no perfil do Firebase Auth
            // Assim o nome aparece corretamente em outros serviços Firebase
            await updateProfile(resultado.user, {
                displayName: form.nome.trim(),
            });

            // 3. Salva o perfil no Firestore com os dados do jogo
            const { perfil } = await criarPerfil(resultado.user, form.nome.trim());

            // 4. Notifica o App.jsx
            onAutenticado(perfil);

        } catch (e) {
            // Traduz erros do Firebase para português
            const mensagens = {
                'auth/email-already-in-use': 'Este email já está cadastrado. Faça login.',
                'auth/invalid-email':        'Email inválido.',
                'auth/weak-password':        'Senha muito fraca. Use pelo menos 6 caracteres.',
                'auth/operation-not-allowed':'Cadastro desabilitado. Contate o suporte.',
            };
            setErroGeral(mensagens[e.code] || 'Erro ao criar conta. Tente novamente.');
            console.error(e);
        } finally {
            setCarregando(false);
        }
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div className="auth-form">
            <div className="auth-cab">
                <h1>Criar conta</h1>
                <p>Você começa com <b className="num cor-bc">₿C {BONUS.VALOR_BC.toLocaleString('pt-BR')}</b> de bônus para jogar.</p>
            </div>

            <button type="button" onClick={handleGoogle} disabled={carregando} className="btn auth-google">
                <GoogleLogo />
                {carregando ? 'Aguarde…' : 'Cadastrar com Google'}
            </button>

            <div className="auth-ou" aria-hidden="true"><span>ou com email</span></div>

            <form onSubmit={handleCadastrar} className="auth-campos" noValidate>
                <Campo id="cad-nome" label="Nome de usuário" erro={erros.nome} extra={<span className="num">{form.nome.length}/20</span>}>
                    <input
                        id="cad-nome"
                        name="nome"
                        type="text"
                        placeholder="Como vai aparecer na mesa…"
                        value={form.nome}
                        onChange={e => atualizar('nome', e.target.value)}
                        disabled={carregando}
                        maxLength={20}
                        autoComplete="username"
                        aria-invalid={!!erros.nome}
                    />
                </Campo>

                <Campo id="cad-email" label="Email" erro={erros.email}>
                    <input
                        id="cad-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        placeholder="voce@exemplo.com…"
                        value={form.email}
                        onChange={e => atualizar('email', e.target.value)}
                        disabled={carregando}
                        autoComplete="email"
                        spellCheck={false}
                        aria-invalid={!!erros.email}
                    />
                </Campo>

                <Campo id="cad-senha" label="Senha" erro={erros.senha}
                    acao={<BotaoOlho ver={verSenha} onClick={() => setVerSenha(v => !v)} rotulo="senha" />}>
                    <input
                        id="cad-senha"
                        name="senha"
                        type={verSenha ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres…"
                        value={form.senha}
                        onChange={e => atualizar('senha', e.target.value)}
                        disabled={carregando}
                        autoComplete="new-password"
                        aria-invalid={!!erros.senha}
                    />
                </Campo>
                {form.senha.length > 0 && <ForcaSenha senha={form.senha} />}

                <Campo id="cad-confirmar" label="Confirmar senha" erro={erros.confirmarSenha}
                    ok={!!form.confirmarSenha && form.confirmarSenha === form.senha}
                    acao={<BotaoOlho ver={verConfirmar} onClick={() => setVerConfirmar(v => !v)} rotulo="senha" />}>
                    <input
                        id="cad-confirmar"
                        name="confirmarSenha"
                        type={verConfirmar ? 'text' : 'password'}
                        placeholder="Digite a senha de novo…"
                        value={form.confirmarSenha}
                        onChange={e => atualizar('confirmarSenha', e.target.value)}
                        disabled={carregando}
                        autoComplete="new-password"
                        aria-invalid={!!erros.confirmarSenha}
                    />
                </Campo>

                {erroGeral && <p className="cart-erro" role="alert">{erroGeral}</p>}

                <button type="submit" disabled={carregando} aria-busy={carregando || undefined} className="btn btn-principal cart-btn-cheio">
                    {carregando ? 'Criando conta…' : 'Criar conta'}
                </button>
            </form>

            <p className="auth-troca">
                Já tem conta?{' '}
                <button type="button" onClick={onIrParaLogin} className="cart-link">Entrar</button>
            </p>
        </div>
    );
}


function Campo({ id, label, erro, ok, extra, acao, children }) {
    return (
        <>
            <label className="cart-campo-rot auth-rot" htmlFor={id}>
                <span>{label}</span>
                {extra}
            </label>
            <div className={`cart-campo${erro ? ' com-erro' : ok ? ' com-ok' : ''}`}>
                {children}
                {acao}
            </div>
            {erro && <p className="cart-erro" role="alert">{erro}</p>}
        </>
    );
}

function BotaoOlho({ ver, onClick, rotulo }) {
    return (
        <button type="button" onClick={onClick} className="cart-campo-acao" aria-label={`${ver ? 'Ocultar' : 'Mostrar'} ${rotulo}`} aria-pressed={ver}>
            <Icone nome="olho" tamanho={18} />
        </button>
    );
}

// Força da senha: comprimento, maiúscula, número e símbolo
function ForcaSenha({ senha }) {
    let pontos = 0;
    if (senha.length >= 6)           pontos++;
    if (senha.length >= 10)          pontos++;
    if (/[A-Z]/.test(senha))         pontos++;
    if (/[0-9]/.test(senha))         pontos++;
    if (/[^A-Za-z0-9]/.test(senha))  pontos++;

    const niveis = [
        { label: 'Fraca',       cor: 'var(--cor-perigo-texto)' },
        { label: 'Razoável',    cor: 'var(--cor-destaque-texto)' },
        { label: 'Boa',         cor: 'var(--cor-info)' },
        { label: 'Forte',       cor: 'var(--cor-positivo-texto)' },
        { label: 'Muito forte', cor: 'var(--cor-destaque)' },
    ];
    const nivel = niveis[Math.min(pontos, niveis.length - 1)];

    return (
        <div className="cart-forca" aria-label={`Força da senha: ${nivel.label}`}>
            <div className="seg">
                {niveis.map((n, i) => <i key={n.label} style={i < pontos ? { background: nivel.cor } : undefined} />)}
            </div>
            <span style={{ color: nivel.cor }}>{nivel.label}</span>
        </div>
    );
}
