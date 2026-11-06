/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/index.jsx

   MUDANÇAS DESTA VERSÃO:
     → Adicionada etapa 'criarPin' no fluxo de cadastro
     → Após cadastro bem-sucedido, exibe CriarPin antes do Lobby
     → Login continua igual — jogador que já tem conta não vê o PIN aqui

   CONCEITO GERAL:
   Página de autenticação — decide qual tela mostrar:
     → Login    : jogador já tem conta
     → Cadastro : jogador quer criar conta
     → CriarPin : etapa obrigatória após novo cadastro

   FLUXO:
   1. App.jsx renderiza Auth quando não há usuário logado
   2. Auth mostra Login por padrão
   3. Jogador pode alternar para Cadastro e vice-versa
   4. Após cadastro com sucesso → mostra CriarPin
   5. Após criar PIN → App.jsx recebe o usuário e mostra o Lobby

   PROPS:
     onAutenticado → function(usuario): chamada após login/cadastro+PIN
     socket        → Socket.io: necessário para salvar o PIN no backend
================================================================ */

import { useState } from 'react';
import Login    from './Login';
import Cadastro from './Cadastro';
import CriarPin from './CriarPin';


export default function Auth({ onAutenticado, socket, usuarioSemPin = null }) {

    // Controla qual tela mostrar: 'login' | 'cadastro' | 'criarPin'
    const [tela, setTela] = useState(usuarioSemPin ? 'criarPin' : 'login');

    // Guarda o usuário recém-cadastrado enquanto cria o PIN
    const [usuarioPendente, setUsuarioPendente] = useState(usuarioSemPin);


    // ----------------------------------------------------------------
    // Chamado pelo Cadastro após conta criada com sucesso.
    // Guarda o usuário e avança para a etapa de criação de PIN.
    // ----------------------------------------------------------------
    function handleCadastrado(usuario) {
        setUsuarioPendente(usuario);
        setTela('criarPin');
    }


    // ----------------------------------------------------------------
    // Chamado pelo CriarPin após PIN salvo com sucesso.
    // Agora sim o jogador entra no Lobby.
    // ----------------------------------------------------------------
    function handlePinCriado() {
        onAutenticado({ ...usuarioPendente, temPin: true });
        setUsuarioPendente(null);
    }


    return (
        <div style={estilos.pagina}>

            {/* ---- Logo do app ---- */}
            <div style={estilos.logo}>
                <span style={estilos.logoEmoji}>🃏</span>
                <h1 style={estilos.logoTitulo}>Poker Game</h1>
                <p style={estilos.logoSubtitulo}>Powered by ₿C Bitchager</p>
            </div>

            {/* ---- Indicador de etapa (apenas no cadastro com PIN) ---- */}
            {tela === 'criarPin' && (
                <div style={estilos.etapas}>
                    <Etapa numero={1} label="Conta"  concluida />
                    <div style={estilos.etapaLinha} />
                    <Etapa numero={2} label="PIN"    ativa />
                    <div style={estilos.etapaLinha} />
                    <Etapa numero={3} label="Jogar"  />
                </div>
            )}

            {/* ---- Conteúdo ---- */}
            <div style={estilos.card}>
                {tela === 'login' && (
                    <Login
                        onAutenticado={onAutenticado}
                        onIrParaCadastro={() => setTela('cadastro')}
                    />
                )}

                {tela === 'cadastro' && (
                    <Cadastro
                        onAutenticado={handleCadastrado}
                        onLoginExistente={onAutenticado}
                        onIrParaLogin={() => setTela('login')}
                    />
                )}

                {tela === 'criarPin' && (
                    <CriarPin
                        usuario={usuarioPendente}
                        socket={socket}
                        onConcluido={handlePinCriado}
                    />
                )}
            </div>

            {/* ---- Rodapé ---- */}
            <p style={estilos.rodape}>
                Ao continuar você concorda com os{' '}
                <span style={estilos.link}>Termos de Uso</span>
            </p>

        </div>
    );
}


// ================================================================
// SUBCOMPONENTE: Indicador de etapa do cadastro
// ================================================================

function Etapa({ numero, label, concluida, ativa }) {
    const cor = concluida ? 'var(--cor-positivo-texto)' : ativa ? 'var(--cor-destaque)' : 'var(--cor-linha-forte)';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
                width:          '28px',
                height:         '28px',
                borderRadius:   '50%',
                background:     cor,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '12px',
                fontWeight:     '700',
                color:          '#fff',
            }}>
                {concluida ? '✓' : numero}
            </div>
            <span style={{ fontSize: '10px', color: ativa ? 'var(--cor-destaque-texto)' : 'var(--cor-texto-3)' }}>
                {label}
            </span>
        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    pagina: {
        minHeight:      '100vh',
        background:     'var(--cor-fundo)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '20px 16px',
        fontFamily:     'var(--fonte)',
        gap:            '20px',
    },

    logo: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '6px',
    },

    logoEmoji: {
        fontSize:   '56px',
        lineHeight: 1,
    },

    logoTitulo: {
        fontSize:      '28px',
        fontWeight:    '800',
        color:         'var(--cor-texto)',
        margin:        0,
        letterSpacing: '-0.02em',
    },

    logoSubtitulo: {
        fontSize:   '12px',
        color:      'var(--cor-destaque-texto)',
        margin:     0,
        fontWeight: '500',
    },

    // Indicador de etapas do cadastro
    etapas: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    etapaLinha: {
        width:      '40px',
        height:     '1px',
        background: 'var(--cor-linha)',
    },

    card: {
        width:        '100%',
        maxWidth:     '400px',
        background:   'var(--cor-superficie)',
        border:       '1px solid var(--cor-linha)',
        borderRadius: '16px',
        overflow:     'hidden',
    },

    rodape: {
        fontSize:  '11px',
        color:     'var(--cor-texto-3)',
        textAlign: 'center',
    },

    link: {
        color:  'var(--cor-destaque)',
        cursor: 'pointer',
    },
};