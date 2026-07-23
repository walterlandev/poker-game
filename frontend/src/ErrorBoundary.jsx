/* ================================================================
   ARQUIVO: frontend/src/ErrorBoundary.jsx

   DIAGNÓSTICO TEMPORÁRIO — remover depois de achar o bug da tela
   preta no celular. Em vez de deixar a tela preta sem informação
   nenhuma quando o React trava (erro não tratado), mostra o erro
   de verdade na própria tela, pra dar pra ler direto no celular
   sem precisar de ferramenta de desenvolvedor.
================================================================ */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { erro: null };
    }

    static getDerivedStateFromError(erro) {
        return { erro };
    }

    componentDidCatch(erro, info) {
        console.error('ErrorBoundary capturou:', erro, info);
    }

    componentDidMount() {
        window.addEventListener('error', this.onErroGlobal);
        window.addEventListener('unhandledrejection', this.onRejeicaoGlobal);
    }

    componentWillUnmount() {
        window.removeEventListener('error', this.onErroGlobal);
        window.removeEventListener('unhandledrejection', this.onRejeicaoGlobal);
    }

    onErroGlobal = (evento) => {
        this.setState({ erro: evento.error || new Error(evento.message) });
    };

    onRejeicaoGlobal = (evento) => {
        const razao = evento.reason;
        this.setState({ erro: razao instanceof Error ? razao : new Error(String(razao)) });
    };

    render() {
        if (this.state.erro) {
            return (
                <div style={estilos.container}>
                    <p style={estilos.titulo}>⚠️ Erro capturado (diagnóstico temporário)</p>
                    <p style={estilos.mensagem}>{this.state.erro.message}</p>
                    <pre style={estilos.stack}>{this.state.erro.stack}</pre>
                    <button style={estilos.botao} onClick={() => window.location.reload()}>
                        Recarregar
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const estilos = {
    container: {
        position:   'fixed',
        inset:      0,
        background: '#1a0505',
        color:      '#FCA5A5',
        padding:    '20px',
        fontFamily: 'monospace',
        fontSize:   '13px',
        overflow:   'auto',
        zIndex:     99999,
    },
    titulo:   { fontSize: '16px', fontWeight: '700', marginBottom: '12px' },
    mensagem: { fontSize: '14px', marginBottom: '12px', whiteSpace: 'pre-wrap' },
    stack:    { fontSize: '11px', opacity: 0.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    botao: {
        marginTop:    '16px',
        padding:      '10px 16px',
        background:   '#EF4444',
        color:        '#fff',
        border:       'none',
        borderRadius: '8px',
        fontSize:     '14px',
        fontWeight:   '600',
        cursor:       'pointer',
    },
};
