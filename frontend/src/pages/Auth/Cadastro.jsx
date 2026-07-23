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
        <div style={estilos.container}>

            {/* ---- Cabeçalho ---- */}
            <div style={estilos.cabecalho}>
                <h2 style={estilos.titulo}>Criar conta</h2>
                <p style={estilos.subtitulo}>
                    Ganhe{' '}
                    <span style={{ color: '#F59E0B', fontWeight: '700' }}>
                        ₿C {BONUS.VALOR_BC.toLocaleString('pt-BR')}
                    </span>
                    {' '}de boas-vindas!
                </p>
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
                {carregando ? 'Aguarde...' : 'Cadastrar com Google'}
            </button>

            {/* ---- Divisor ---- */}
            <div style={estilos.divisor}>
                <div style={estilos.linhaDivisor} />
                <span style={estilos.textoDivisor}>ou preencha os dados</span>
                <div style={estilos.linhaDivisor} />
            </div>

            {/* ---- Formulário ---- */}
            <form onSubmit={handleCadastrar} style={estilos.form}>

                {/* Nome */}
                <Campo label="Nome de usuário" erro={erros.nome}>
                    <input
                        type="text"
                        placeholder="Como vai aparecer na mesa"
                        value={form.nome}
                        onChange={e => atualizar('nome', e.target.value)}
                        disabled={carregando}
                        maxLength={20}
                        style={{
                            ...estilos.input,
                            borderColor: erros.nome
                                ? 'rgba(239,68,68,0.5)'
                                : 'rgba(255,255,255,0.1)',
                        }}
                        autoComplete="username"
                    />
                    {/* Contador de caracteres */}
                    <span style={estilos.contador}>
                        {form.nome.length}/20
                    </span>
                </Campo>

                {/* Email */}
                <Campo label="Email" erro={erros.email}>
                    <input
                        type="email"
                        placeholder="seu@email.com"
                        value={form.email}
                        onChange={e => atualizar('email', e.target.value)}
                        disabled={carregando}
                        style={{
                            ...estilos.input,
                            borderColor: erros.email
                                ? 'rgba(239,68,68,0.5)'
                                : 'rgba(255,255,255,0.1)',
                        }}
                        autoComplete="email"
                    />
                </Campo>

                {/* Senha */}
                <Campo label="Senha" erro={erros.senha}>
                    <div style={estilos.inputContainer}>
                        <input
                            type={verSenha ? 'text' : 'password'}
                            placeholder="Mínimo 6 caracteres"
                            value={form.senha}
                            onChange={e => atualizar('senha', e.target.value)}
                            disabled={carregando}
                            style={{
                                ...estilos.input,
                                paddingRight: '40px',
                                borderColor:  erros.senha
                                    ? 'rgba(239,68,68,0.5)'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                            autoComplete="new-password"
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

                    {/* Indicador de força da senha */}
                    {form.senha.length > 0 && (
                        <ForcaSenha senha={form.senha} />
                    )}
                </Campo>

                {/* Confirmar senha */}
                <Campo label="Confirmar senha" erro={erros.confirmarSenha}>
                    <div style={estilos.inputContainer}>
                        <input
                            type={verConfirmar ? 'text' : 'password'}
                            placeholder="Digite a senha novamente"
                            value={form.confirmarSenha}
                            onChange={e => atualizar('confirmarSenha', e.target.value)}
                            disabled={carregando}
                            style={{
                                ...estilos.input,
                                paddingRight: '40px',
                                borderColor:  erros.confirmarSenha
                                    ? 'rgba(239,68,68,0.5)'
                                    : form.confirmarSenha && form.confirmarSenha === form.senha
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
                </Campo>

                {/* Erro geral */}
                {erroGeral && (
                    <div style={estilos.erroGeral}>{erroGeral}</div>
                )}

                {/* Botão cadastrar */}
                <button
                    type="submit"
                    disabled={carregando}
                    style={{
                        ...estilos.btnCadastrar,
                        opacity: carregando ? 0.7 : 1,
                    }}
                >
                    {carregando ? 'Criando conta...' : `Criar conta e ganhar ₿C ${BONUS.VALOR_BC.toLocaleString('pt-BR')}`}
                </button>

            </form>

            {/* ---- Link para login ---- */}
            <p style={estilos.linkLogin}>
                Já tem conta?{' '}
                <button onClick={onIrParaLogin} style={estilos.btnLink}>
                    Entrar
                </button>
            </p>

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE Campo
// Wrapper reutilizável para cada campo do formulário
// ================================================================

function Campo({ label, erro, children }) {
    return (
        <div style={estilos.campo}>
            <label style={estilos.label}>{label}</label>
            {children}
            {erro && <p style={estilos.erroTexto}>{erro}</p>}
        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE ForcaSenha
//
// Mostra uma barra visual indicando a força da senha.
// Critérios analisados:
//   → Comprimento (6, 10+ caracteres)
//   → Letras maiúsculas
//   → Números
//   → Caracteres especiais
// ================================================================

function ForcaSenha({ senha }) {
    let pontos = 0;
    if (senha.length >= 6)           pontos++;
    if (senha.length >= 10)          pontos++;
    if (/[A-Z]/.test(senha))         pontos++;
    if (/[0-9]/.test(senha))         pontos++;
    if (/[^A-Za-z0-9]/.test(senha))  pontos++;

    const niveis = [
        { label: 'Fraca',       cor: '#EF4444' },
        { label: 'Razoável',    cor: '#F59E0B' },
        { label: 'Boa',         cor: '#3B82F6' },
        { label: 'Forte',       cor: '#22C55E' },
        { label: 'Muito forte', cor: '#7C3AED' },
    ];

    const nivel = niveis[Math.min(pontos, niveis.length - 1)];

    return (
        <div style={{ marginTop: '6px' }}>
            {/* Barra de força */}
            <div style={estilos.forcaBarraContainer}>
                {niveis.map((n, i) => (
                    <div
                        key={i}
                        style={{
                            ...estilos.forcaSegmento,
                            background: i < pontos ? nivel.cor : 'rgba(255,255,255,0.1)',
                        }}
                    />
                ))}
            </div>
            {/* Label da força */}
            <span style={{ ...estilos.forcaLabel, color: nivel.cor }}>
                {nivel.label}
            </span>
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
        gap:           '14px',
    },

    cabecalho: {
        marginBottom: '2px',
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

    // Botão do Google
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

    // Divisor "ou preencha os dados"
    divisor: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    linhaDivisor: {
        flex:       1,
        height:     '1px',
        background: 'rgba(255,255,255,0.08)',
    },

    textoDivisor: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.25)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
    },

    // Formulário
    form: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    // Campo individual
    campo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '5px',
        position:      'relative',
    },

    // Label do campo
    label: {
        fontSize:      '11px',
        fontWeight:    '500',
        color:         'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    // Container do input com botão de olho
    inputContainer: {
        position: 'relative',
    },

    // Input de texto
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

    // Botão de mostrar/esconder senha
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

    // Contador de caracteres do nome
    contador: {
        position:  'absolute',
        right:     '10px',
        bottom:    '-18px',
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.25)',
    },

    // Texto de erro por campo
    erroTexto: {
        fontSize: '11px',
        color:    '#FCA5A5',
        margin:   0,
    },

    // Box de erro geral do servidor
    erroGeral: {
        padding:      '10px 12px',
        background:   'rgba(239,68,68,0.1)',
        border:       '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        fontSize:     '13px',
        color:        '#FCA5A5',
    },

    // Botão principal de cadastro
    btnCadastrar: {
        width:        '100%',
        padding:      '13px',
        background:   'linear-gradient(135deg, #D97706, #F59E0B)',
        border:       'none',
        borderRadius: '10px',
        color:        'white',
        fontSize:     '14px',
        fontWeight:   '600',
        cursor:       'pointer',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
        marginTop:    '4px',
    },

    // Link para ir ao login
    linkLogin: {
        fontSize:      '13px',
        color:         'rgba(255,255,255,0.4)',
        textAlign:     'center',
        margin:        0,
        paddingBottom: '4px',
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

    // Barra de força da senha
    forcaBarraContainer: {
        display: 'flex',
        gap:     '3px',
    },

    forcaSegmento: {
        flex:         1,
        height:       '3px',
        borderRadius: '2px',
        transition:   'background 0.3s',
    },

    forcaLabel: {
        fontSize:   '10px',
        fontWeight: '500',
        marginTop:  '3px',
        display:    'block',
    },
};
