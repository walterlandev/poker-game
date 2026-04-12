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

            <style>{`
                .loja-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
                .loja-corpo { display: flex; flex-direction: column; gap: 14px; }
                @media (min-width: 768px) {
                    .loja-tabs { display: none; }
                    .loja-corpo { flex-direction: row; align-items: flex-start; gap: 20px; }
                    .loja-col { flex: 1; display: block !important; }
                }
            `}</style>

            {/* ---- Cabeçalho ---- */}
            <div style={estilos.cabecalho}>
                <div>
                    <h2 style={estilos.titulo}>Loja</h2>
                    <p style={estilos.subtitulo}>
                        Saldo:{' '}
                        <span style={{ color: '#F59E0B', fontWeight: '700' }}>
                            ₿C {Number(saldoTotal).toLocaleString('pt-BR')}
                        </span>
                        {temBonus && (
                            <span style={{ color: '#F59E0B', fontSize: '11px', opacity: 0.7 }}>
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
                    background: feedback.tipo === 'sucesso' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border:     feedback.tipo === 'sucesso' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    color:      feedback.tipo === 'sucesso' ? '#4ADE80' : '#FCA5A5',
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
                                background: ativa ? 'rgba(124,58,237,0.15)' : 'transparent',
                                border:     ativa ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.06)',
                                color:      ativa ? '#A78BFA' : 'rgba(255,255,255,0.4)',
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
    titulo:      { fontSize: '20px', fontWeight: '700', color: '#F8FAFC', margin: 0 },
    subtitulo:   { fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' },
    feedback:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500' },
    tab:         { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', cursor: 'pointer', outline: 'none', fontFamily: 'sans-serif', fontSize: '13px', WebkitTapHighlightColor: 'transparent' },
    colunaTitle: { fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' },
};
