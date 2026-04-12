/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalConfiguracoes.jsx

   CONCEITO GERAL:
   Modal de configurações do jogador com duas seções:
     → 🔐 Alterar PIN de segurança (usa AlterarPin.jsx)
     → 🔔 Sons do jogo (toggle on/off, salvo no localStorage)

   PROPS:
     usuario    → { uid, nome }
     socket     → Socket.io
     onFechar   → fecha o modal
================================================================ */

import { useState } from 'react';
import AlterarPin from '../Wallet/AlterarPin';

export default function ModalConfiguracoes({ usuario, socket, onFechar }) {

    const [secao,       setSecao      ] = useState(null); // null | 'pin'
    const [sons,        setSons       ] = useState(
        () => localStorage.getItem('poker_sons') !== 'false'
    );

    function toggleSons() {
        const novoValor = !sons;
        setSons(novoValor);
        localStorage.setItem('poker_sons', String(novoValor));
    }

    return (
        <>
            {/* Overlay */}
            <div onClick={onFechar} style={estilos.overlay} />

            {/* Modal */}
            <div style={estilos.modal}>

                {/* Header */}
                <div style={estilos.header}>
                    <div style={estilos.headerEsq}>
                        {secao && (
                            <button onClick={() => setSecao(null)} style={estilos.btnVoltar}>
                                ←
                            </button>
                        )}
                        <h2 style={estilos.titulo}>
                            {secao === 'pin' ? '🔐 Alterar PIN' : '⚙️ Configurações'}
                        </h2>
                    </div>
                    <button onClick={onFechar} style={estilos.btnFechar}>✕</button>
                </div>

                <div style={estilos.corpo}>

                    {/* ---- Tela principal ---- */}
                    {!secao && (
                        <>
                            {/* Segurança */}
                            <div style={estilos.grupo}>
                                <p style={estilos.grupoLabel}>Segurança</p>

                                <button
                                    onClick={() => setSecao('pin')}
                                    style={estilos.itemBtn}
                                >
                                    <div style={estilos.itemIcone}>🔐</div>
                                    <div style={estilos.itemTexto}>
                                        <p style={estilos.itemTitulo}>Alterar PIN</p>
                                        <p style={estilos.itemSub}>Mude sua senha de segurança da carteira</p>
                                    </div>
                                    <span style={estilos.seta}>›</span>
                                </button>
                            </div>

                            {/* Preferências */}
                            <div style={estilos.grupo}>
                                <p style={estilos.grupoLabel}>Preferências</p>

                                <div style={estilos.itemRow}>
                                    <div style={estilos.itemIcone}>🔔</div>
                                    <div style={estilos.itemTexto}>
                                        <p style={estilos.itemTitulo}>Sons do jogo</p>
                                        <p style={estilos.itemSub}>Efeitos sonoros nas mesas</p>
                                    </div>
                                    <button
                                        onClick={toggleSons}
                                        style={{
                                            ...estilos.toggle,
                                            background: sons
                                                ? 'linear-gradient(135deg, #7C3AED, #4F46E5)'
                                                : 'rgba(255,255,255,0.10)',
                                        }}
                                    >
                                        <div style={{
                                            ...estilos.toggleBola,
                                            transform: sons ? 'translateX(20px)' : 'translateX(2px)',
                                        }} />
                                    </button>
                                </div>
                            </div>

                            {/* Info da conta */}
                            <div style={estilos.grupo}>
                                <p style={estilos.grupoLabel}>Conta</p>
                                <div style={estilos.infoCard}>
                                    <InfoLinha label="Jogador" valor={usuario?.nome || '—'} />
                                    <InfoLinha label="UID"     valor={usuario?.uid?.slice(0, 16) + '...' || '—'} mono />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ---- Alterar PIN ---- */}
                    {secao === 'pin' && (
                        <AlterarPin
                            usuario={usuario}
                            socket={socket}
                            onConcluido={() => setSecao(null)}
                            onCancelar={() => setSecao(null)}
                        />
                    )}

                </div>
            </div>
        </>
    );
}

function InfoLinha({ label, valor, mono }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>{label}</span>
            <span style={{
                fontSize:   '12px',
                color:      'rgba(255,255,255,0.70)',
                fontFamily: mono ? 'monospace' : 'inherit',
            }}>
                {valor}
            </span>
        </div>
    );
}

const estilos = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.70)',
        zIndex: 200, backdropFilter: 'blur(4px)',
    },
    modal: {
        position:      'fixed',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        background:    '#111827',
        border:        '1px solid rgba(255,255,255,0.10)',
        borderRadius:  '16px',
        width:         '90%',
        maxWidth:      '420px',
        maxHeight:     '85vh',
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
    headerEsq: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },
    titulo: { fontSize: '17px', fontWeight: '700', margin: 0 },
    btnVoltar: {
        background:   'rgba(255,255,255,0.06)',
        border:       'none',
        borderRadius: '8px',
        color:        '#F8FAFC',
        fontSize:     '18px',
        width:        '32px',
        height:       '32px',
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontFamily:   'inherit',
    },
    btnFechar: {
        background:   'rgba(255,255,255,0.06)',
        border:       'none',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.6)',
        fontSize:     '16px',
        width:        '32px',
        height:       '32px',
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },
    corpo: {
        flex:      1,
        overflowY: 'auto',
        padding:   '16px 20px',
        display:   'flex',
        flexDirection: 'column',
        gap:       '20px',
    },
    grupo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },
    grupoLabel: {
        fontSize:      '11px',
        fontWeight:    '600',
        color:         'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin:        0,
    },
    itemBtn: {
        display:      'flex',
        alignItems:   'center',
        gap:          '12px',
        padding:      '12px 14px',
        background:   'rgba(255,255,255,0.04)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        cursor:       'pointer',
        width:        '100%',
        fontFamily:   'inherit',
        color:        '#F8FAFC',
        transition:   'background 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },
    itemRow: {
        display:      'flex',
        alignItems:   'center',
        gap:          '12px',
        padding:      '12px 14px',
        background:   'rgba(255,255,255,0.04)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
    },
    itemIcone: {
        fontSize:       '20px',
        width:          '36px',
        height:         '36px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'rgba(255,255,255,0.06)',
        borderRadius:   '8px',
        flexShrink:     0,
    },
    itemTexto: {
        flex:          1,
        textAlign:     'left',
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
    },
    itemTitulo: { fontSize: '14px', fontWeight: '600', margin: 0 },
    itemSub:    { fontSize: '11px', color: 'rgba(255,255,255,0.40)', margin: 0 },
    seta:       { fontSize: '20px', color: 'rgba(255,255,255,0.25)' },
    toggle: {
        width:        '44px',
        height:       '24px',
        borderRadius: '12px',
        border:       'none',
        cursor:       'pointer',
        position:     'relative',
        flexShrink:   0,
        transition:   'background 0.2s',
        padding:      0,
    },
    toggleBola: {
        position:     'absolute',
        top:          '2px',
        width:        '20px',
        height:       '20px',
        borderRadius: '50%',
        background:   '#fff',
        transition:   'transform 0.2s',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.3)',
    },
    infoCard: {
        padding:      '4px 14px',
        background:   'rgba(255,255,255,0.04)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
    },
};
