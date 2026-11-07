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
import {
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
} from 'firebase/auth';
import Icone from '../../components/Icone';
import { auth } from '../../services/firebase-config';

// "Esqueci o PIN": o jogador entra de novo (Google ou senha) e o servidor
// confere que o login é recente e da mesma conta antes de trocar o PIN.
function entrouComGoogle() {
    return !!auth.currentUser?.providerData?.some(p => p.providerId === 'google.com');
}


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
    // 'alterar' (sabe o PIN atual) | 'esqueci' (confirma identidade)
    const [modo,         setModo        ] = useState('alterar');
    const [senhaConta,   setSenhaConta  ] = useState('');
    const [verSenha,     setVerSenha    ] = useState(false);
    const [erroSenha,    setErroSenha   ] = useState('');
    const esqueci   = modo === 'esqueci';
    const usaGoogle = entrouComGoogle();

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


    // ----------------------------------------------------------------
    // Esqueci o PIN: confirma a identidade e grava o novo PIN
    // ----------------------------------------------------------------
    const handleRedefinir = useCallback(async () => {
        const erros = validarPin(pinNovo);
        if (erros.length > 0) { setErrosNovo(erros); return; }
        if (pinNovo !== confirmar) { setErroConfirm('Os PINs não conferem.'); return; }
        if (!usaGoogle && !senhaConta) { setErroSenha('Informe a senha da sua conta.'); return; }
        if (!socket || !auth.currentUser) { setErroGeral('Conexão não disponível.'); return; }

        setSalvando(true);
        setErroGeral('');
        try {
            if (usaGoogle) {
                await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
            } else {
                const cred = EmailAuthProvider.credential(auth.currentUser.email, senhaConta);
                await reauthenticateWithCredential(auth.currentUser, cred);
            }
            const idToken = await auth.currentUser.getIdToken(true);

            const limpar = () => {
                socket.off('wallet:pin_redefinido', onOk);
                socket.off('wallet:pin_erro', onErro);
            };
            const onOk = () => {
                limpar();
                setSalvando(false);
                setConcluido(true);
                setTimeout(() => onConcluido(), 1500);
            };
            const onErro = (err) => {
                limpar();
                setSalvando(false);
                setErroGeral(err?.mensagem || 'Erro ao redefinir PIN.');
            };
            socket.on('wallet:pin_redefinido', onOk);
            socket.on('wallet:pin_erro', onErro);
            socket.emit('wallet:redefinir_pin', { idToken, pinNovo });
        } catch (e) {
            setSalvando(false);
            const codigo = e?.code || '';
            if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request') return;
            if (codigo === 'auth/invalid-credential' || codigo === 'auth/wrong-password') {
                setErroSenha('Senha incorreta.');
            } else if (codigo === 'auth/user-mismatch') {
                setErroGeral('Use a mesma conta Google com que você entrou no site.');
            } else if (codigo === 'auth/too-many-requests') {
                setErroGeral('Muitas tentativas. Aguarde alguns minutos.');
            } else {
                setErroGeral('Não foi possível confirmar sua identidade.');
            }
        }
    }, [pinNovo, confirmar, usaGoogle, senhaConta, socket, onConcluido]);

    const trocarModo = (novo) => {
        setModo(novo);
        setPinAtual(''); setErroAtual(''); setSenhaConta(''); setErroSenha(''); setErroGeral('');
    };


    // ================================================================
    // TELA DE SUCESSO
    // ================================================================
    if (concluido) {
        return (
            <div className="cart-vazio" role="status">
                <span className="cart-pin-icone" aria-hidden="true"><Icone nome="check" tamanho={22} /></span>
                <p className="titulo">{esqueci ? 'PIN redefinido' : 'PIN alterado'}</p>
                <p className="sub">Seu novo PIN já está ativo.</p>
            </div>
        );
    }

    const requisitos = [
        { texto: 'Mínimo 6 caracteres',      ok: pinNovo.length >= 6 },
        { texto: '1 letra maiúscula (A-Z)',  ok: /[A-Z]/.test(pinNovo) },
        { texto: '1 número (0-9)',           ok: /[0-9]/.test(pinNovo) },
        { texto: '1 símbolo (!@#$%^&*)',     ok: /[^A-Za-z0-9]/.test(pinNovo) },
    ];
    const pontosForca = pontosPin(pinNovo);
    const podeSalvar  = (esqueci ? (usaGoogle || senhaConta) : pinAtual) && novoValido && pinsBatem && !salvando;

    return (
        <div className="cart-form sem-borda">
            <p className="cart-nota">O PIN protege depósitos, saques e envios da sua carteira ₿C.</p>

            {!esqueci && (
                <>
                    <CampoPin
                        id="pin-atual" rotulo="PIN atual" valor={pinAtual} ver={verAtual} setVer={setVerAtual}
                        onChange={v => { setPinAtual(v); setErroAtual(''); }} erro={erroAtual}
                        desabilitado={salvando} autoComplete="current-password" placeholder="Seu PIN atual…"
                    />
                    <button type="button" className="cart-link" onClick={() => trocarModo('esqueci')} disabled={salvando}>
                        Esqueci o PIN
                    </button>
                </>
            )}

            {esqueci && (
                <>
                    <p className="cart-nota">
                        {usaGoogle
                            ? 'Para criar um PIN novo, confirme que é você entrando de novo com o Google ao salvar.'
                            : 'Para criar um PIN novo, confirme que é você com a senha da sua conta.'}
                    </p>
                    {!usaGoogle && (
                        <CampoPin
                            id="senha-conta" rotulo="Senha da conta" valor={senhaConta} ver={verSenha} setVer={setVerSenha}
                            onChange={v => { setSenhaConta(v); setErroSenha(''); }} erro={erroSenha}
                            desabilitado={salvando} autoComplete="current-password" placeholder="Sua senha de login…"
                            rotuloVer="senha"
                        />
                    )}
                    <button type="button" className="cart-link" onClick={() => trocarModo('alterar')} disabled={salvando}>
                        Lembrei o PIN
                    </button>
                </>
            )}

            <CampoPin
                id="pin-novo" rotulo="Novo PIN" valor={pinNovo} ver={verNovo} setVer={setVerNovo}
                onChange={v => { setPinNovo(v); setErrosNovo([]); }} erro={errosNovo.length > 0 ? errosNovo.join(', ') + '.' : ''}
                ok={novoValido && pinNovo.length > 0}
                desabilitado={salvando} autoComplete="new-password" placeholder="Novo PIN seguro…"
            />
            <ul className="cart-requisitos">
                {requisitos.map(r => (
                    <li key={r.texto} className={r.ok ? 'ok' : ''}>
                        <Icone nome={r.ok ? 'check' : 'info'} tamanho={14} />{r.texto}
                    </li>
                ))}
            </ul>
            {pinNovo.length > 0 && forca && (
                <div className="cart-forca" aria-label={`Força do PIN: ${forca.label}`}>
                    <div className="seg">
                        {[0, 1, 2, 3, 4].map(i => <i key={i} style={i < pontosForca ? { background: forca.cor } : undefined} />)}
                    </div>
                    <span style={{ color: forca.cor }}>{forca.label}</span>
                </div>
            )}

            <CampoPin
                id="pin-confirmar" rotulo="Confirmar novo PIN" valor={confirmar} ver={verConfirmar} setVer={setVerConfirmar}
                onChange={v => { setConfirmar(v); setErroConfirm(''); }} erro={erroConfirm} ok={pinsBatem}
                desabilitado={salvando} autoComplete="new-password" placeholder="Repita o novo PIN…"
            />
            {pinsBatem && <p className="cart-nota positivo">Os PINs conferem.</p>}

            {erroGeral && <p className="cart-erro" role="alert">{erroGeral}</p>}

            <div className="cart-botoes">
                <button type="button" onClick={onCancelar} className="btn btn-neutro" disabled={salvando}>
                    Cancelar
                </button>
                <button type="button" onClick={esqueci ? handleRedefinir : handleSalvar} disabled={!podeSalvar} aria-busy={salvando || undefined} className="btn btn-principal">
                    {salvando ? 'Salvando…' : esqueci ? 'Confirmar e salvar PIN' : 'Salvar novo PIN'}
                </button>
            </div>
        </div>
    );
}

// Mesmos critérios de forcaPin, só para desenhar os segmentos
function pontosPin(pin) {
    let p = 0;
    if (pin.length >= 6)          p++;
    if (pin.length >= 10)         p++;
    if (/[A-Z]/.test(pin))        p++;
    if (/[0-9]/.test(pin))        p++;
    if (/[^A-Za-z0-9]/.test(pin)) p++;
    return p;
}

function CampoPin({ id, rotulo, valor, ver, setVer, onChange, erro, ok, desabilitado, autoComplete, placeholder, rotuloVer = 'PIN' }) {
    return (
        <>
            <label className="cart-campo-rot" htmlFor={id}>{rotulo}</label>
            <div className={`cart-campo${erro ? ' com-erro' : ok ? ' com-ok' : ''}`}>
                <input
                    id={id}
                    type={ver ? 'text' : 'password'}
                    placeholder={placeholder}
                    value={valor}
                    onChange={e => onChange(e.target.value)}
                    disabled={desabilitado}
                    autoComplete={autoComplete}
                    aria-invalid={!!erro}
                    aria-describedby={erro ? `${id}-erro` : undefined}
                />
                <button type="button" onClick={() => setVer(v => !v)} className="cart-campo-acao" aria-label={ver ? `Ocultar ${rotuloVer}` : `Mostrar ${rotuloVer}`} aria-pressed={ver}>
                    <Icone nome="olho" tamanho={18} />
                </button>
            </div>
            {erro && <p id={`${id}-erro`} className="cart-erro" role="alert">{erro}</p>}
        </>
    );
}
