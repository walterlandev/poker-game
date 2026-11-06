/* ================================================================
   ARQUIVO: frontend/src/ErrorBoundary.jsx

   Rede de segurança no topo da árvore: se algum componente lançar
   uma exceção (ex.: "insertBefore"/"removeChild" quando uma extensão
   ou o tradutor do navegador mexe no DOM gerenciado pelo React), em
   vez de deixar a tela preta mostramos uma mensagem curta e um botão
   "Recarregar". A sessão do Firebase fica salva no navegador, então
   recarregar não desloga o jogador.

   Estilos 100% inline de propósito: nada de <style> dentro de
   componente (regra do projeto — ver CLAUDE.md) e este componente
   precisa funcionar mesmo se o CSS global não tiver carregado.
================================================================ */

import { Component } from 'react';

const estilos = {
    tela: {
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        background: '#0b0f14', color: '#e8edf2', textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
    },
    titulo: { fontSize: 20, fontWeight: 700 },
    texto:  { fontSize: 14, opacity: 0.8, maxWidth: 320, lineHeight: 1.4 },
    botao:  {
        padding: '12px 28px', fontSize: 16, fontWeight: 700, border: 'none',
        borderRadius: 10, background: '#f5b400', color: '#111', cursor: 'pointer',
    },
};

export default class ErrorBoundary extends Component {
    state = { erro: null };

    static getDerivedStateFromError(erro) {
        return { erro };
    }

    componentDidCatch(erro, info) {
        console.error('ErrorBoundary capturou:', erro, info?.componentStack);
    }

    render() {
        if (!this.state.erro) return this.props.children;
        return (
            <div style={estilos.tela} role="alert" translate="no">
                <div style={estilos.titulo}>Algo deu errado na tela</div>
                <div style={estilos.texto}>
                    Sua sessão continua salva. Recarregue para voltar ao jogo.
                </div>
                <button style={estilos.botao} onClick={() => window.location.reload()}>
                    Recarregar
                </button>
            </div>
        );
    }
}
