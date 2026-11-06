/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalSenha.jsx

   CONCEITO GERAL:
   Modal simples para o jogador digitar a senha de uma mesa privada.
   Aparece quando o jogador clica em "Entrar" em uma mesa com 🔒.

   COMPORTAMENTOS:
     → Foco automático no input ao abrir
     → Enter no teclado confirma a senha
     → Mostra/esconde a senha com botão de olho
     → Erro se tentar confirmar com campo vazio

   PROPS:
     onConfirmar → function(senha): chamada com a senha digitada
     onFechar    → function(): fecha o modal sem entrar
================================================================ */

import { useState, useEffect, useRef } from 'react';


export default function ModalSenha({ onConfirmar, onFechar }) {

    const [senha,       setSenha      ] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [erro,        setErro       ] = useState('');

    // useRef: referência direta ao elemento DOM do input
    // Usado para dar foco automático ao abrir o modal
    const inputRef = useRef(null);


    // ----------------------------------------------------------------
    // Foco automático ao montar o componente
    // useEffect com array vazio = roda só uma vez ao montar
    // ----------------------------------------------------------------
    useEffect(() => {
        // Pequeno delay para garantir que o modal está visível
        const t = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(t);
    }, []);


    // ----------------------------------------------------------------
    // Confirma a senha
    // ----------------------------------------------------------------
    function handleConfirmar() {
        if (!senha.trim()) {
            setErro('Digite a senha da mesa.');
            return;
        }
        onConfirmar(senha.trim());
    }


    // ----------------------------------------------------------------
    // Enter no teclado confirma
    // ----------------------------------------------------------------
    function handleKeyDown(e) {
        if (e.key === 'Enter') handleConfirmar();
        if (e.key === 'Escape') onFechar();
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <>
            {/* Overlay */}
            <div onClick={onFechar} style={estilos.overlay} />

            {/* Modal centralizado — diferente do ModalCriarMesa que sobe de baixo */}
            <div style={estilos.modal}>

                {/* Ícone de cadeado */}
                <div style={estilos.iconeContainer}>
                    <span style={estilos.icone}>🔒</span>
                </div>

                {/* Título */}
                <h3 style={estilos.titulo}>Mesa Privada</h3>
                <p style={estilos.subtitulo}>
                    Digite a senha para entrar nesta mesa
                </p>

                {/* Input de senha */}
                <div style={estilos.inputContainer}>
                    <input
                        ref={inputRef}
                        type={mostrarSenha ? 'text' : 'password'}
                        placeholder="Senha da mesa"
                        value={senha}
                        onChange={e => {
                            setSenha(e.target.value);
                            if (erro) setErro('');
                        }}
                        onKeyDown={handleKeyDown}
                        maxLength={20}
                        style={{
                            ...estilos.input,
                            borderColor: erro
                                ? 'var(--cor-perigo-linha)'
                                : 'var(--cor-linha)',
                        }}
                    />

                    {/* Botão mostrar/esconder senha */}
                    <button
                        onClick={() => setMostrarSenha(v => !v)}
                        style={estilos.btnOlho}
                        aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                        tabIndex={-1}
                    >
                        {mostrarSenha ? '🙈' : '👁️'}
                    </button>
                </div>

                {/* Mensagem de erro */}
                {erro && (
                    <p style={estilos.erro}>{erro}</p>
                )}

                {/* Botões de ação */}
                <div style={estilos.botoes}>
                    <button onClick={onFechar} style={estilos.btnCancelar}>
                        Cancelar
                    </button>
                    <button onClick={handleConfirmar} style={estilos.btnEntrar}>
                        Entrar
                    </button>
                </div>

            </div>
        </>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    overlay: {
        position:   'fixed',
        inset:      0,
        background: 'var(--cor-veu)',
        zIndex:     300,
        backdropFilter: 'blur(2px)',
    },

    // Modal centralizado na tela (diferente do bottom sheet)
    modal: {
        position:      'fixed',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        width:         'calc(100% - 40px)',
        maxWidth:      '340px',
        background:    'var(--cor-superficie)',
        borderRadius:  '16px',
        border:        '1px solid var(--cor-linha)',
        zIndex:        301,
        padding:       '24px 20px 20px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '12px',
    },

    iconeContainer: {
        width:          '56px',
        height:         '56px',
        borderRadius:   '50%',
        background:     'color-mix(in srgb, var(--cor-info) 10%, transparent)',
        border:         '1px solid color-mix(in srgb, var(--cor-info) 20%, transparent)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        marginBottom:   '4px',
    },

    icone: {
        fontSize: '24px',
    },

    titulo: {
        fontSize:   '17px',
        fontWeight: '700',
        color:      'var(--cor-texto)',
        margin:     0,
        textAlign:  'center',
    },

    subtitulo: {
        fontSize:  '13px',
        color:     'var(--cor-texto-3)',
        margin:    0,
        textAlign: 'center',
        lineHeight: 1.4,
    },

    // Container do input + botão de olho
    inputContainer: {
        position:  'relative',
        width:     '100%',
        marginTop: '4px',
    },

    input: {
        width:        '100%',
        padding:      '11px 40px 11px 12px',
        background:   'var(--cor-superficie)',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '8px',
        color:        'var(--cor-texto)',
        fontSize:     '15px',
        outline:      'none',
        boxSizing:    'border-box',
        letterSpacing: '0.05em',
        transition:   'border-color 0.2s',
    },

    // Botão de mostrar/esconder senha
    btnOlho: {
        position:       'absolute',
        right:          '10px',
        top:            '50%',
        transform:      'translateY(-50%)',
        background:     'none',
        border:         'none',
        cursor:         'pointer',
        fontSize:       '16px',
        padding:        '4px',
        lineHeight:     1,
        WebkitTapHighlightColor: 'transparent',
    },

    erro: {
        fontSize:  '12px',
        color:     'var(--cor-perigo-texto)',
        margin:    '-4px 0 0',
        alignSelf: 'flex-start',
    },

    // Container dos dois botões
    botoes: {
        display:             'grid',
        gridTemplateColumns: '1fr 1.5fr',
        gap:                 '8px',
        width:               '100%',
        marginTop:           '4px',
    },

    btnCancelar: {
        padding:      '11px',
        background:   'var(--cor-superficie)',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '8px',
        color:        'var(--cor-texto-2)',
        fontSize:     '14px',
        fontWeight:   '500',
        cursor:       'pointer',
        WebkitTapHighlightColor: 'transparent',
    },

    btnEntrar: {
        padding:      '11px',
        background:   'var(--cor-destaque)',
        border:       'none',
        borderRadius: '8px',
        color:        'var(--cor-texto-inverso)',
        fontSize:     '14px',
        fontWeight:   '600',
        cursor:       'pointer',
        WebkitTapHighlightColor: 'transparent',
    },
};
