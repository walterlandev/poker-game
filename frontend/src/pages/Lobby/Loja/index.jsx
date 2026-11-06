/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/index.jsx

   MUDANÇAS DESTA VERSÃO:
     → Passa usuario e socket para PacotesBC (integração real MP)
     → onFeedback centralizado na Loja e repassado para filhos
     → TemasCartas recebe temas comprados do perfil real
     → Saldo exibe real + bônus separados
     → CORREÇÃO: TemasCartas agora recebe socket e onFeedback
       para aguardar confirmação real do backend antes do feedback

   PROPS:
     usuario → { uid, nome, saldo, saldoBonus, tema, temasComprados }
     socket  → instância do Socket.io
================================================================ */

import { useState } from 'react';
import PacotesBC    from './PacotesBC';
import TemasCartas  from './TemasCartas';

const TABS_LOJA = [
    { id: 'bc',    label: '₿C Bitchager', icone: '💰' },
    { id: 'temas', label: 'Temas',         icone: '🎨' },
];


export default function Loja({ usuario, socket }) {

    const [tabAtiva, setTabAtiva] = useState('bc');
    const [feedback, setFeedback] = useState(null);

    function mostrarFeedback(tipo, mensagem) {
        setFeedback({ tipo, mensagem });
        setTimeout(() => setFeedback(null), 4000);
    }

    // Saldo total (real + bônus) para exibição
    const saldoTotal  = (usuario?.saldo || 0) + (usuario?.saldoBonus || 0);
    const temBonus    = (usuario?.saldoBonus || 0) > 0;

    return (
        <div style={estilos.container}>

            {/* ---- Cabeçalho ---- */}
            <div style={estilos.cabecalho}>
                <div>
                    <h2 style={estilos.titulo}>Loja</h2>
                    <p style={estilos.subtitulo}>
                        Saldo:{' '}
                        <span style={{ color: 'var(--cor-destaque-texto)', fontWeight: '700' }}>
                            ₿C {Number(saldoTotal).toLocaleString('pt-BR')}
                        </span>
                        {temBonus && (
                            <span style={{ color: 'var(--cor-destaque-texto)', fontSize: '11px', opacity: 0.7 }}>
                                {' '}(₿C {Number(usuario.saldoBonus).toLocaleString('pt-BR')} bônus)
                            </span>
                        )}
                    </p>
                </div>
                <span style={{ fontSize: '36px', opacity: 0.6 }}>🏪</span>
            </div>

            {/* ---- Feedback ---- */}
            {feedback && (
                <div style={{
                    ...estilos.feedback,
                    background: feedback.tipo === 'sucesso' ? 'var(--cor-positivo-suave)' : 'var(--cor-perigo-suave)',
                    border:     feedback.tipo === 'sucesso' ? '1px solid var(--cor-positivo)' : '1px solid var(--cor-perigo-linha)',
                    color:      feedback.tipo === 'sucesso' ? 'var(--cor-positivo-texto)' : 'var(--cor-perigo-texto)',
                }}>
                    {feedback.tipo === 'sucesso' ? '✓' : '✕'} {feedback.mensagem}
                </div>
            )}

            {/* ---- Tabs (mobile) ---- */}
            <div className="loja-tabs">
                {TABS_LOJA.map(tab => {
                    const ativa = tabAtiva === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setTabAtiva(tab.id)}
                            style={{
                                ...estilos.tab,
                                background: ativa ? 'var(--cor-destaque-suave)' : 'transparent',
                                border:     ativa ? '1px solid var(--cor-destaque-linha)' : '1px solid var(--cor-superficie)',
                                color:      ativa ? 'var(--cor-destaque-texto)' : 'var(--cor-texto-3)',
                                fontWeight: ativa ? '600' : '400',
                            }}
                        >
                            {tab.icone} {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ---- Corpo ---- */}
            <div className="loja-corpo">

                {/* Coluna ₿C */}
                <div className="loja-col" style={{ display: tabAtiva === 'bc' ? 'block' : 'none' }}>
                    <p style={estilos.colunaTitle}>💰 Pacotes Bitchager</p>
                    <PacotesBC
                        saldoAtual={saldoTotal}
                        usuario={usuario}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                </div>

                {/* Coluna Temas */}
                <div className="loja-col" style={{ display: tabAtiva === 'temas' ? 'block' : 'none' }}>
                    <p style={estilos.colunaTitle}>🎨 Temas das Cartas</p>
                    {/*
                        CORREÇÃO: antes passava onComprar/onAtivar inline que davam
                        feedback imediato sem esperar o backend.
                        Agora TemasCartas recebe socket e onFeedback diretamente
                        e gerencia os eventos tema:comprado/tema:ativado/tema:erro.
                    */}
                    <TemasCartas
                        saldoAtual={saldoTotal}
                        temaAtual={usuario?.tema || 'classico'}
                        temasComprados={usuario?.temasComprados || []}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                </div>

            </div>

        </div>
    );
}


const estilos = {
    container:   { display: 'flex', flexDirection: 'column', gap: '14px' },
    cabecalho:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    titulo:      { fontSize: '20px', fontWeight: '700', color: 'var(--cor-texto)', margin: 0 },
    subtitulo:   { fontSize: '13px', color: 'var(--cor-texto-3)', margin: '4px 0 0' },
    feedback:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500' },
    tab:         { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', cursor: 'pointer', outline: 'none', fontFamily: 'var(--fonte)', fontSize: '13px', WebkitTapHighlightColor: 'transparent' },
    colunaTitle: { fontSize: '12px', fontWeight: '600', color: 'var(--cor-texto-3)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' },
};
