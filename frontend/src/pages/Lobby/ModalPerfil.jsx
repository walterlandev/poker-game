/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalPerfil.jsx

   CONCEITO GERAL:
   Modal de edição do perfil do jogador.
   Permite editar: nome, email, telefone, foto de perfil.
   Também oferece opção de recuperação de senha por email.

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

   Estilos em styles/ranking-admin.css (prefixos jan- e pf-).

   PROPS:
     usuario   → { uid, nome, email, avatar, telefone, temasComprados }
     onFechar  → fecha o modal
     onAtualizar → callback quando perfil é salvo com sucesso
================================================================ */

import { useState, useRef, useEffect } from 'react';
import {
    getAuth,
    updateProfile,
    sendPasswordResetEmail,
    updateEmail,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase-config';
import Icone from '../../components/Icone';
import '../../styles/ranking-admin.css';

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

export default function ModalPerfil({ usuario, socket, onFechar, onAtualizar }) {

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
    const janelaRef    = useRef(null);
    const [fotoLocal,   setFotoLocal  ] = useState(null); // base64 — só pra pré-visualização
    const [fotoArquivo, setFotoArquivo] = useState(null); // File — o que de fato sobe pro servidor
    const [carregandoFoto, setCarregandoFoto] = useState(false);

    // Foco na janela ao abrir e Esc para fechar
    useEffect(() => {
        janelaRef.current?.focus();
        function aoTeclar(e) { if (e.key === 'Escape') onFechar(); }
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [onFechar]);

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
        setFotoArquivo(file); // guarda o arquivo de verdade — sobe pro servidor ao salvar

        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result;
            setFotoLocal(base64);
            setAvatar(base64); // só pra pré-visualização enquanto não salva
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
        }).catch(() => mostrarFeedback('erro', 'Não foi possível copiar o ID.'));
    }

    // ----------------------------------------------------------------
    // Sobe a foto pro próprio servidor (não Firebase Storage — exige
    // plano pago). Devolve uma URL pública de verdade, que os outros
    // jogadores na mesa também conseguem carregar.
    // ----------------------------------------------------------------
    function uploadAvatarViaServidor(base64) {
        return new Promise((resolve, reject) => {
            if (!socket) { reject(new Error('Sem conexão com o servidor.')); return; }

            function onOk({ avatarUrl }) {
                cleanup();
                resolve(avatarUrl);
            }
            function onErro({ mensagem }) {
                cleanup();
                reject(new Error(mensagem || 'Erro ao enviar a foto.'));
            }
            function cleanup() {
                socket.off('avatar_atualizado', onOk);
                socket.off('avatar_erro',       onErro);
            }

            socket.once('avatar_atualizado', onOk);
            socket.once('avatar_erro',       onErro);
            socket.emit('upload_avatar', { imagemBase64: base64 });

            setTimeout(() => { cleanup(); reject(new Error('Tempo esgotado ao enviar a foto.')); }, 15000);
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

            // Se escolheu uma foto do dispositivo, sobe pro servidor primeiro
            // — assim o avatar final é uma URL de verdade (não base64), que
            // os outros jogadores na mesa também conseguem ver.
            let avatarFinal = avatar;
            if (fotoArquivo) {
                avatarFinal = await uploadAvatarViaServidor(fotoLocal);
            }

            // 1. Atualiza nome e avatar no Firebase Auth
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

            // 3. Atualiza perfil no Firestore (avatarFinal já é URL, nunca base64)
            const ref = doc(db, 'jogadores', user.uid);
            await updateDoc(ref, {
                nome:     nome.trim(),
                avatar:   avatarFinal,
                telefone: telefone.trim(),
                email:    email.trim(),
            });

            setFotoArquivo(null);
            mostrarFeedback('sucesso', 'Perfil atualizado.');

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
            <div onClick={onFechar} className="jan-veu" />

            <div className="jan-pos">
                <div
                    ref={janelaRef}
                    tabIndex={-1}
                    className="jan pf"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="titulo-perfil"
                >

                    <div className="jan-cab">
                        <h2 id="titulo-perfil">Meu perfil</h2>
                        <button type="button" onClick={onFechar} className="jan-fechar" aria-label="Fechar">
                            <Icone nome="fechar" />
                        </button>
                    </div>

                    <div className="pf-corpo">

                        {/* Foto */}
                        <fieldset className="pf-sec">
                            <legend>Foto</legend>

                            <input
                                ref={inputFotoRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFotoEscolhida}
                                className="so-leitor"
                                tabIndex={-1}
                                aria-hidden="true"
                            />

                            <div className="pf-foto-linha">
                                <img
                                    src={avatar}
                                    alt="Sua foto atual"
                                    className="pf-foto"
                                    onError={e => { e.target.src = '/avata01.png'; }}
                                />
                                <div className="pf-foto-txt">
                                    <button type="button" onClick={handleEscolherFoto} disabled={carregandoFoto} className="pf-btn">
                                        <Icone nome="cima" />
                                        {carregandoFoto ? 'Carregando...' : 'Enviar uma foto'}
                                    </button>
                                    {fotoLocal
                                        ? <p className="ok" role="status">Foto carregada. Toque em Salvar para confirmar.</p>
                                        : <p>Imagem de até 2 MB, ou escolha um avatar abaixo.</p>}
                                </div>
                            </div>

                            <div className="pf-avatares" role="radiogroup" aria-label="Avatares prontos">
                                {AVATARES.map((url, i) => (
                                    <button
                                        key={url}
                                        type="button"
                                        role="radio"
                                        aria-checked={avatar === url && !fotoLocal}
                                        aria-label={`Avatar ${i + 1}`}
                                        onClick={() => { setAvatar(url); setFotoLocal(null); }}
                                        className="pf-avatar-op"
                                    >
                                        <img src={url} alt="" onError={e => { e.target.style.display = 'none'; }} />
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        {/* ID do jogador */}
                        <div className="pf-id">
                            <div className="pf-id-txt">
                                <span>Seu ID, para receber ₿C</span>
                                <code>{usuario?.uid || '—'}</code>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopiarId}
                                className={`pf-btn${idCopiado ? ' copiado' : ''}`}
                                aria-label="Copiar ID"
                            >
                                <Icone nome={idCopiado ? 'check' : 'copiar'} />
                                {idCopiado ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>

                        {/* Dados */}
                        <div className="pf-sec">
                            <Campo
                                id="pf-nome" label="Nome de usuário" valor={nome} onChange={setNome}
                                placeholder="Seu nome no jogo" autoComplete="nickname"
                            />
                            <Campo
                                id="pf-email" label="Email" valor={email} onChange={setEmail}
                                placeholder="seu@email.com" tipo="email" autoComplete="email"
                            />
                            <Campo
                                id="pf-tel" label="Telefone" valor={telefone} onChange={setTelefone}
                                placeholder="(00) 00000-0000" tipo="tel" autoComplete="tel"
                            />
                        </div>

                        {/* Temas comprados */}
                        {temasComprados.length > 0 && (
                            <div className="pf-sec">
                                <h3>Temas desbloqueados</h3>
                                <ul className="pf-temas">
                                    {temasComprados.map(temaId => {
                                        const ativo = usuario?.tema === temaId;
                                        return (
                                            <li key={temaId} className={`pf-tema${ativo ? ' ativo' : ''}`}>
                                                {NOMES_TEMAS[temaId] || temaId}
                                                {ativo && <span className="em-uso">em uso</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* Recuperar senha */}
                        <button type="button" onClick={handleRecuperarSenha} disabled={enviandoSenha} className="pf-link">
                            <Icone nome="cadeado" />
                            {enviandoSenha ? 'Enviando...' : 'Enviar link de recuperação de senha'}
                        </button>

                    </div>

                    <div className="pf-rodape">
                        {feedback && (
                            <p className={`jan-aviso ${feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}`} role={feedback.tipo === 'sucesso' ? 'status' : 'alert'}>
                                <Icone nome={feedback.tipo === 'sucesso' ? 'check' : 'alerta'} />
                                <span>{feedback.mensagem}</span>
                            </p>
                        )}
                        <div className="pf-rodape-btns">
                            <button type="button" onClick={onFechar} className="jan-btn neutro">
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSalvar} disabled={salvando} aria-busy={salvando} className="jan-btn principal">
                                {salvando ? 'Salvando...' : 'Salvar alterações'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}

// Campo de texto com rótulo ligado ao input
function Campo({ id, label, valor, onChange, placeholder, tipo = 'text', autoComplete }) {
    return (
        <div className="jan-campo">
            <label htmlFor={id}>{label}</label>
            <div className="jan-entrada">
                <input
                    id={id}
                    type={tipo}
                    value={valor}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    name={id}
                    autoComplete={autoComplete}
                    spellCheck={false}
                    inputMode={tipo === 'tel' ? 'tel' : tipo === 'email' ? 'email' : undefined}
                />
            </div>
        </div>
    );
}
