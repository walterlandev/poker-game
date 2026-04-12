/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalPerfil.jsx

   CONCEITO GERAL:
   Modal de edição do perfil do jogador.
   Permite editar: nome, email, telefone, foto de perfil.
   Também oferece opção de recuperação de senha por email.

   ADIÇÕES DESTA VERSÃO:
   → Upload de foto do dispositivo (PC ou celular)
   → ID do jogador exibido e copiável (para transferência ₿C)
   → Temas comprados exibidos no perfil

   AVATARES DISPONÍVEIS:
   avata01.png até avata10.png na pasta /public/
   O jogador escolhe clicando em um dos avatares
   OU faz upload de uma foto do dispositivo.

   FIREBASE:
   → updateProfile()  — atualiza nome e foto no Firebase Auth
   → updateEmail()    — atualiza email (requer reautenticação)
   → sendPasswordResetEmail() — envia email de recuperação
   → Firestore — atualiza perfil na coleção 'jogadores'

   PROPS:
     usuario   → { uid, nome, email, avatar, telefone, temasComprados }
     onFechar  → fecha o modal
     onAtualizar → callback quando perfil é salvo com sucesso
================================================================ */

import { useState, useRef } from 'react';
import {
    getAuth,
    updateProfile,
    sendPasswordResetEmail,
    updateEmail,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase-config';

// Lista de avatares disponíveis em /public/
const AVATARES = [
    '/avata01.png', '/avata02.png', '/avata03.png', '/avata04.png',
    '/avata05.png', '/avata06.png', '/avata07.png', '/avata08.png',
    '/avata09.png', '/avata10.png',
];

// Nomes legíveis dos temas
const NOMES_TEMAS = {
    classico:    'Clássico',
    quatroCores: '4 Cores',
    royal:       'Royal',
    neon:        'Neon',
    dourado:     'Dourado',
    minimalista: 'Minimalista',
};

export default function ModalPerfil({ usuario, onFechar, onAtualizar }) {

    const auth = getAuth();

    const [nome,      setNome     ] = useState(usuario?.nome      || '');
    const [email,     setEmail    ] = useState(usuario?.email     || auth.currentUser?.email || '');
    const [telefone,  setTelefone ] = useState(usuario?.telefone  || '');
    const [avatar,    setAvatar   ] = useState(usuario?.avatar    || '/avata01.png');
    const [salvando,  setSalvando ] = useState(false);
    const [feedback,  setFeedback ] = useState(null);
    const [enviandoSenha, setEnviandoSenha] = useState(false);
    const [idCopiado, setIdCopiado] = useState(false);

    // ── Upload de foto ──
    const inputFotoRef = useRef(null);
    const [fotoLocal,   setFotoLocal  ] = useState(null); // base64 da foto carregada
    const [carregandoFoto, setCarregandoFoto] = useState(false);

    function mostrarFeedback(tipo, mensagem) {
        setFeedback({ tipo, mensagem });
        setTimeout(() => setFeedback(null), 4000);
    }

    // ----------------------------------------------------------------
    // Abre o seletor de arquivo
    // ----------------------------------------------------------------
    function handleEscolherFoto() {
        inputFotoRef.current?.click();
    }

    // ----------------------------------------------------------------
    // Processa a foto escolhida — converte para base64
    // ----------------------------------------------------------------
    function handleFotoEscolhida(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Valida tipo
        if (!file.type.startsWith('image/')) {
            mostrarFeedback('erro', 'Selecione uma imagem válida.');
            return;
        }

        // Valida tamanho (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            mostrarFeedback('erro', 'Imagem muito grande. Máximo 2MB.');
            return;
        }

        setCarregandoFoto(true);

        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result;
            setFotoLocal(base64);
            setAvatar(base64); // usa a foto local como avatar
            setCarregandoFoto(false);
        };
        reader.onerror = () => {
            mostrarFeedback('erro', 'Erro ao carregar imagem.');
            setCarregandoFoto(false);
        };
        reader.readAsDataURL(file);

        // Limpa o input para permitir reselecionar a mesma foto
        e.target.value = '';
    }

    // ----------------------------------------------------------------
    // Copia ID do jogador para a área de transferência
    // ----------------------------------------------------------------
    function handleCopiarId() {
        if (!usuario?.uid) return;
        navigator.clipboard.writeText(usuario.uid).then(() => {
            setIdCopiado(true);
            setTimeout(() => setIdCopiado(false), 2000);
        });
    }

    // ----------------------------------------------------------------
    // Salva as alterações no Firebase Auth + Firestore
    // ----------------------------------------------------------------
    async function handleSalvar() {
        if (!nome.trim()) {
            mostrarFeedback('erro', 'O nome não pode estar vazio.');
            return;
        }

        setSalvando(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Usuário não autenticado.');

            // Avatar final: foto local (base64) ou url do avatar selecionado
            const avatarFinal = avatar;

            // 1. Atualiza nome e avatar no Firebase Auth
            // Nota: Firebase Auth não aceita base64 em photoURL,
            // então usamos a URL do avatar padrão se for base64
            const photoURLParaAuth = avatarFinal.startsWith('data:')
                ? (usuario?.avatar || '/avata01.png')
                : avatarFinal;

            await updateProfile(user, {
                displayName: nome.trim(),
                photoURL:    photoURLParaAuth,
            });

            // 2. Atualiza email se mudou
            if (email.trim() && email !== user.email) {
                await updateEmail(user, email.trim());
            }

            // 3. Atualiza perfil no Firestore (aceita base64)
            const ref = doc(db, 'jogadores', user.uid);
            await updateDoc(ref, {
                nome:     nome.trim(),
                avatar:   avatarFinal,
                telefone: telefone.trim(),
                email:    email.trim(),
            });

            mostrarFeedback('sucesso', 'Perfil atualizado com sucesso!');

            onAtualizar?.({
                ...usuario,
                nome:     nome.trim(),
                avatar:   avatarFinal,
                telefone: telefone.trim(),
                email:    email.trim(),
            });

        } catch (e) {
            console.error('Erro ao salvar perfil:', e);
            if (e.code === 'auth/requires-recent-login') {
                mostrarFeedback('erro', 'Para alterar o email, faça logout e login novamente.');
            } else {
                mostrarFeedback('erro', 'Erro ao salvar. Tente novamente.');
            }
        } finally {
            setSalvando(false);
        }
    }

    // ----------------------------------------------------------------
    // Envia email de recuperação de senha
    // ----------------------------------------------------------------
    async function handleRecuperarSenha() {
        const emailParaEnviar = email || auth.currentUser?.email;
        if (!emailParaEnviar) {
            mostrarFeedback('erro', 'Informe um email válido.');
            return;
        }

        setEnviandoSenha(true);
        try {
            await sendPasswordResetEmail(auth, emailParaEnviar);
            mostrarFeedback('sucesso', `Email de recuperação enviado para ${emailParaEnviar}`);
        } catch {
            mostrarFeedback('erro', 'Não foi possível enviar o email.');
        } finally {
            setEnviandoSenha(false);
        }
    }

    const temasComprados = usuario?.temasComprados || [];

    return (
        <>
            {/* Overlay */}
            <div onClick={onFechar} style={estilos.overlay} />

            {/* Modal */}
            <div style={estilos.modal}>

                {/* Header */}
                <div style={estilos.header}>
                    <h2 style={estilos.titulo}>Meu Perfil</h2>
                    <button onClick={onFechar} style={estilos.btnFechar}>✕</button>
                </div>

                <div style={estilos.corpo}>

                    {/* Feedback */}
                    {feedback && (
                        <div style={{
                            ...estilos.feedback,
                            background: feedback.tipo === 'sucesso'
                                ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: feedback.tipo === 'sucesso'
                                ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
                            color: feedback.tipo === 'sucesso' ? '#4ADE80' : '#FCA5A5',
                        }}>
                            {feedback.tipo === 'sucesso' ? '✓' : '✕'} {feedback.mensagem}
                        </div>
                    )}

                    {/* Avatar atual + botão de upload */}
                    <div style={estilos.avatarSecao}>

                        {/* Input file escondido */}
                        <input
                            ref={inputFotoRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFotoEscolhida}
                            style={{ display: 'none' }}
                        />

                        {/* Avatar com botão de câmera sobreposto */}
                        <div style={estilos.avatarWrapper}>
                            <img
                                src={avatar}
                                alt="Avatar"
                                style={estilos.avatarAtual}
                                onError={e => { e.target.src = '/avata01.png'; }}
                            />
                            <button
                                onClick={handleEscolherFoto}
                                style={estilos.btnCamera}
                                title="Carregar foto do dispositivo"
                            >
                                {carregandoFoto ? '⏳' : '📷'}
                            </button>
                        </div>

                        {/* Botão explícito de upload */}
                        <button onClick={handleEscolherFoto} style={estilos.btnUpload}>
                            📁 Carregar foto do dispositivo
                        </button>

                        {fotoLocal && (
                            <p style={estilos.fotoLocalAviso}>
                                ✓ Foto carregada — clique em Salvar para confirmar
                            </p>
                        )}

                        <p style={estilos.labelSecao}>Ou escolha um avatar</p>
                        <div style={estilos.avatarGrid}>
                            {AVATARES.map(url => (
                                <div
                                    key={url}
                                    onClick={() => { setAvatar(url); setFotoLocal(null); }}
                                    style={{
                                        ...estilos.avatarOpcao,
                                        border: avatar === url && !fotoLocal
                                            ? '2px solid #7C3AED'
                                            : '2px solid transparent',
                                        boxShadow: avatar === url && !fotoLocal
                                            ? '0 0 8px rgba(124,58,237,0.5)'
                                            : 'none',
                                    }}
                                >
                                    <img src={url} alt="avatar"
                                        style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'8px' }}
                                        onError={e => { e.target.style.display='none'; }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ID DO JOGADOR */}
                    <div style={estilos.idCard}>
                        <div style={estilos.idTextos}>
                            <p style={estilos.idLabel}>🆔 Seu ID — use para receber ₿C</p>
                            <p style={estilos.idValor}>{usuario?.uid || '—'}</p>
                        </div>
                        <button onClick={handleCopiarId} style={{
                            ...estilos.btnCopiar,
                            background: idCopiado ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.15)',
                            border:     idCopiado ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(124,58,237,0.3)',
                            color:      idCopiado ? '#4ADE80' : '#A78BFA',
                        }}>
                            {idCopiado ? '✓ Copiado!' : '📋 Copiar'}
                        </button>
                    </div>

                    {/* Campos de edição */}
                    <div style={estilos.campos}>

                        <Campo
                            label="Nome de usuário"
                            valor={nome}
                            onChange={setNome}
                            placeholder="Seu nome no jogo"
                            icone="👤"
                        />

                        <Campo
                            label="Email"
                            valor={email}
                            onChange={setEmail}
                            placeholder="seu@email.com"
                            tipo="email"
                            icone="✉️"
                        />

                        <Campo
                            label="Telefone"
                            valor={telefone}
                            onChange={setTelefone}
                            placeholder="(00) 00000-0000"
                            tipo="tel"
                            icone="📱"
                        />

                    </div>

                    {/* TEMAS COMPRADOS */}
                    {temasComprados.length > 0 && (
                        <div style={estilos.temasSecao}>
                            <p style={estilos.labelSecao}>🎨 Temas desbloqueados</p>
                            <div style={estilos.temasGrid}>
                                {temasComprados.map(temaId => (
                                    <div
                                        key={temaId}
                                        style={{
                                            ...estilos.temaBadge,
                                            border: usuario?.tema === temaId
                                                ? '1px solid rgba(124,58,237,0.6)'
                                                : '1px solid rgba(255,255,255,0.10)',
                                            background: usuario?.tema === temaId
                                                ? 'rgba(124,58,237,0.15)'
                                                : 'rgba(255,255,255,0.04)',
                                        }}
                                    >
                                        <span style={{ fontSize: '13px' }}>🎨</span>
                                        <span style={{
                                            fontSize:   '12px',
                                            fontWeight: usuario?.tema === temaId ? '600' : '400',
                                            color:      usuario?.tema === temaId ? '#A78BFA' : 'rgba(255,255,255,0.6)',
                                        }}>
                                            {NOMES_TEMAS[temaId] || temaId}
                                        </span>
                                        {usuario?.tema === temaId && (
                                            <span style={estilos.temaBadgeAtivo}>ativo</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recuperar senha */}
                    <button
                        onClick={handleRecuperarSenha}
                        disabled={enviandoSenha}
                        style={estilos.btnSenha}
                    >
                        {enviandoSenha ? 'Enviando...' : '🔑 Enviar link de recuperação de senha'}
                    </button>

                </div>

                {/* Footer */}
                <div style={estilos.footer}>
                    <button onClick={onFechar} style={estilos.btnCancelar}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSalvar}
                        disabled={salvando}
                        style={{
                            ...estilos.btnSalvar,
                            opacity: salvando ? 0.7 : 1,
                        }}
                    >
                        {salvando ? 'Salvando...' : '✓ Salvar alterações'}
                    </button>
                </div>

            </div>
        </>
    );
}

// Campo de input reutilizável
function Campo({ label, valor, onChange, placeholder, tipo = 'text', icone }) {
    return (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            <label style={estilosC.label}>
                {icone} {label}
            </label>
            <input
                type={tipo}
                value={valor}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={estilosC.input}
            />
        </div>
    );
}

const estilosC = {
    label: { fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:'500' },
    input: {
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding:      '10px 12px',
        color:        '#F8FAFC',
        fontSize:     '14px',
        fontFamily:   'sans-serif',
        outline:      'none',
        width:        '100%',
        boxSizing:    'border-box',
    },
};

const estilos = {
    overlay: {
        position: 'fixed', inset:0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200, backdropFilter:'blur(4px)',
    },
    modal: {
        position:      'fixed',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        background:    '#111827',
        border:        '1px solid rgba(255,255,255,0.1)',
        borderRadius:  '16px',
        width:         '90%',
        maxWidth:      '480px',
        maxHeight:     '90vh',
        display:       'flex',
        flexDirection: 'column',
        zIndex:        201,
        overflow:      'hidden',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
    },
    header: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '16px 20px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        flexShrink:     0,
    },
    titulo: { fontSize:'18px', fontWeight:'700', margin:0 },
    btnFechar: {
        background:'rgba(255,255,255,0.06)', border:'none',
        borderRadius:'8px', color:'rgba(255,255,255,0.6)',
        fontSize:'16px', width:'32px', height:'32px',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    },
    corpo: {
        flex:1, overflowY:'auto', padding:'16px 20px',
        display:'flex', flexDirection:'column', gap:'16px',
    },
    feedback: {
        display:'flex', alignItems:'center', gap:'8px',
        padding:'10px 14px', borderRadius:'8px',
        fontSize:'13px', fontWeight:'500',
    },
    avatarSecao: {
        display:'flex', flexDirection:'column', alignItems:'center', gap:'10px',
    },

    // Avatar com botão de câmera sobreposto
    avatarWrapper: {
        position: 'relative',
        display:  'inline-block',
    },
    avatarAtual: {
        width:'80px', height:'80px', borderRadius:'50%',
        border:'3px solid #7C3AED', objectFit:'cover',
        boxShadow:'0 0 16px rgba(124,58,237,0.4)',
        display: 'block',
    },
    btnCamera: {
        position:       'absolute',
        bottom:         '0',
        right:          '0',
        width:          '28px',
        height:         '28px',
        borderRadius:   '50%',
        background:     '#7C3AED',
        border:         '2px solid #111827',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         'pointer',
        fontSize:       '14px',
        padding:        0,
    },

    // Botão explícito de upload
    btnUpload: {
        background:   'rgba(124,58,237,0.10)',
        border:       '1px solid rgba(124,58,237,0.30)',
        borderRadius: '8px',
        color:        '#A78BFA',
        fontSize:     '12px',
        fontWeight:   '500',
        padding:      '7px 14px',
        cursor:       'pointer',
        fontFamily:   'sans-serif',
        WebkitTapHighlightColor: 'transparent',
    },

    fotoLocalAviso: {
        fontSize:  '11px',
        color:     '#4ADE80',
        margin:    0,
    },

    labelSecao: {
        fontSize:'12px', color:'rgba(255,255,255,0.4)',
        margin:0, textTransform:'uppercase', letterSpacing:'0.06em',
    },
    avatarGrid: {
        display:'grid', gridTemplateColumns:'repeat(5, 1fr)',
        gap:'8px', width:'100%',
    },
    avatarOpcao: {
        width:'100%', aspectRatio:'1',
        borderRadius:'10px', overflow:'hidden',
        cursor:'pointer', transition:'border 0.2s, box-shadow 0.2s',
    },

    // ID do jogador
    idCard: {
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        padding:      '12px 14px',
        background:   'rgba(124,58,237,0.06)',
        border:       '1px solid rgba(124,58,237,0.20)',
        borderRadius: '10px',
    },
    idTextos: { flex: 1, minWidth: 0 },
    idLabel: {
        fontSize:     '11px',
        color:        'rgba(255,255,255,0.40)',
        margin:       0,
        marginBottom: '3px',
    },
    idValor: {
        fontSize:   '11px',
        color:      '#A78BFA',
        margin:     0,
        fontFamily: 'monospace',
        wordBreak:  'break-all',
    },
    btnCopiar: {
        flexShrink:   0,
        padding:      '7px 12px',
        borderRadius: '8px',
        cursor:       'pointer',
        fontSize:     '12px',
        fontWeight:   '600',
        fontFamily:   'sans-serif',
        transition:   'all 0.2s',
        whiteSpace:   'nowrap',
    },

    campos: {
        display:'flex', flexDirection:'column', gap:'12px',
    },

    // Temas comprados
    temasSecao: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },
    temasGrid: {
        display:  'flex',
        flexWrap: 'wrap',
        gap:      '6px',
    },
    temaBadge: {
        display:      'flex',
        alignItems:   'center',
        gap:          '5px',
        padding:      '5px 10px',
        borderRadius: '20px',
        transition:   'all 0.15s',
    },
    temaBadgeAtivo: {
        fontSize:     '9px',
        background:   'rgba(124,58,237,0.25)',
        color:        '#A78BFA',
        padding:      '1px 5px',
        borderRadius: '4px',
        fontWeight:   '600',
    },

    btnSenha: {
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.6)',
        fontSize:     '13px',
        padding:      '10px',
        cursor:       'pointer',
        fontFamily:   'sans-serif',
        textAlign:    'left',
        width:        '100%',
    },
    footer: {
        display:'flex', gap:'10px',
        padding:'14px 20px',
        borderTop:'1px solid rgba(255,255,255,0.08)',
        flexShrink:0,
    },
    btnCancelar: {
        flex:1, padding:'12px',
        background:'rgba(255,255,255,0.06)',
        border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:'10px', color:'rgba(255,255,255,0.6)',
        fontSize:'14px', cursor:'pointer', fontFamily:'sans-serif',
    },
    btnSalvar: {
        flex:2, padding:'12px',
        background:'linear-gradient(135deg,#7C3AED,#4F46E5)',
        border:'none', borderRadius:'10px',
        color:'white', fontSize:'14px', fontWeight:'600',
        cursor:'pointer', fontFamily:'sans-serif',
    },
};
