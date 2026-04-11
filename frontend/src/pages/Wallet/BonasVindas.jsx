/* ================================================================
   ARQUIVO: frontend/src/pages/Wallet/BonasVindas.jsx

   CONCEITO GERAL:
   Dois exports:

   1. ModalBoasVindas (default)
      Modal que aparece uma única vez no 1º acesso do jogador.
      Apresenta o bônus de ₿C 10.000, explica as regras e
      credita via socket.emit('wallet:resgatar_bonus').

   2. BadgeBonus (named export)
      Componente pequeno para usar dentro do WalletCard,
      mostrando o saldo de bônus separado do saldo real,
      com ícone e tooltip explicando que não pode ser sacado.

   REGRAS DO BÔNUS:
     → Só concedido no 1º acesso (backend controla via flag bonusResgatado)
     → Pode jogar em qualquer mesa
     → Não pode ser sacado nem enviado P2P
     → Some permanentemente se o jogador perder tudo
     → Não expira por tempo

   MUDANÇAS DESTA VERSÃO:
     → Timeout de 5s: fecha automaticamente se backend não responder
     → Botão "Pular por agora" para não ficar preso no modal
     → Se não tiver socket, fecha imediatamente
     → handlePular limpa listeners do socket

   PROPS ModalBoasVindas:
     nomeJogador → string
     socket      → Socket.io
     onResgatado → fn() : chamado após resgate bem-sucedido

   PROPS BadgeBonus:
     saldoBonus  → number : saldo atual de bônus em ₿C
     saldoReal   → number : saldo real em ₿C (para mostrar separado)
================================================================ */

import { useState, useEffect, useRef } from 'react';
import { BONUS, fmtBC, fmt, detalheSaldo, temBonus } from './walletUtils';


// ================================================================
// EXPORT 1: MODAL DE BOAS-VINDAS (aparece no 1º acesso)
// ================================================================

export default function ModalBoasVindas({ nomeJogador, socket, onResgatado }) {

    const [etapa, setEtapa] = useState('apresentacao');
    const [erro,  setErro ] = useState(null);
    const timeoutRef = useRef(null);

    useEffect(() => {
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, []);

    function handleResgatar() {
        if (!socket) { onResgatado(); return; }
        setEtapa('resgatando');
        setErro(null);
        socket.emit('wallet:resgatar_bonus');
        socket.once('wallet:bonus_creditado', () => {
            clearTimeout(timeoutRef.current);
            setEtapa('resgatado');
            setTimeout(() => onResgatado(), 2000);
        });
        socket.once('wallet:bonus_erro', (err) => {
            clearTimeout(timeoutRef.current);
            setErro(err?.mensagem || 'Erro interno. Tente novamente.');
            setEtapa('apresentacao');
        });
        timeoutRef.current = setTimeout(() => {
            socket.off('wallet:bonus_creditado');
            socket.off('wallet:bonus_erro');
            onResgatado();
        }, 5000);
    }

    function handlePular() {
        clearTimeout(timeoutRef.current);
        socket?.off('wallet:bonus_creditado');
        socket?.off('wallet:bonus_erro');
        onResgatado();
    }

    return (
        <div style={estilos.overlay}>
            <div style={estilos.modal}>

                {etapa === 'apresentacao' && (
                    <>
                        <div style={estilos.iconeBox}>
                            <span style={estilos.iconeGrande}>🎁</span>
                            <div style={estilos.brilho} />
                        </div>
                        <p style={estilos.bemVindo}>Bem-vindo, {nomeJogador}!</p>
                        <p style={estilos.subtitulo}>
                            Preparamos um presente especial para você começar
                        </p>
                        <div style={estilos.valorDestaque}>
                            <span style={estilos.simboloBC}>₿C</span>
                            <span style={estilos.valorBC}>{fmtBC(BONUS.VALOR_BC)}</span>
                            <span style={estilos.valorBRL}>≈ R$ {fmt(BONUS.VALOR_BRL)}</span>
                        </div>
                        <div style={estilos.regras}>
                            <RegraItem icone="✅" texto="Use em qualquer mesa do jogo"        cor="#22C55E" />
                            <RegraItem icone="✅" texto="Válido enquanto tiver saldo"          cor="#22C55E" />
                            <RegraItem icone="❌" texto="Não pode ser sacado"                  cor="#EF4444" />
                            <RegraItem icone="❌" texto="Não pode ser enviado a outro jogador" cor="#EF4444" />
                            <RegraItem icone="⚠️" texto="Some se você perder tudo nas mesas"  cor="#F59E0B" />
                        </div>
                        {erro && <p style={estilos.erroTexto}>⚠ {erro}</p>}
                        <button onClick={handleResgatar} style={estilos.btnResgatar}>
                            🎉 Resgatar meu bônus
                        </button>
                        <button onClick={handlePular} style={estilos.btnPular}>
                            Pular por agora
                        </button>
                        <p style={estilos.rodapeAviso}>
                            Bônus concedido apenas uma vez por jogador
                        </p>
                    </>
                )}

                {etapa === 'resgatando' && (
                    <div style={estilos.centrado}>
                        <span style={{ fontSize: '40px' }}>⏳</span>
                        <p style={estilos.carregandoTexto}>Creditando seu bônus...</p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                            Aguarde até 5 segundos...
                        </p>
                        <button onClick={handlePular} style={estilos.btnPular}>
                            Pular por agora
                        </button>
                    </div>
                )}

                {etapa === 'resgatado' && (
                    <div style={estilos.centrado}>
                        <span style={{ fontSize: '50px' }}>🎊</span>
                        <p style={estilos.sucessoTitulo}>Bônus creditado!</p>
                        <p style={estilos.sucessoSub}>
                            ₿C {fmtBC(BONUS.VALOR_BC)} foram adicionados à sua carteira.
                            Boa sorte nas mesas!
                        </p>
                        <div style={estilos.sucessoValor}>
                            <span style={{ color: '#F59E0B', fontWeight: '800', fontSize: '22px' }}>
                                ₿C {fmtBC(BONUS.VALOR_BC)}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                                adicionados como bônus
                            </span>
                        </div>
                        <button onClick={onResgatado} style={estilos.btnJogar}>
                            🃏 Ir para as mesas
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}


// ================================================================
// EXPORT 2: BADGE DE BÔNUS (usado dentro do WalletCard)
// ================================================================

export function BadgeBonus({ saldoBonus, saldoReal }) {

    const [tooltip, setTooltip] = useState(false);
    const detalhe = detalheSaldo(saldoReal, saldoBonus);

    if (!temBonus(saldoBonus)) return null;

    return (
        <div style={estilos.badgeContainer}>
            <div style={estilos.badgeLinha}>
                <div style={estilos.badgePonto('#22C55E')} />
                <span style={estilos.badgeLabel}>Saldo real</span>
                <span style={estilos.badgeValorReal}>₿C {fmtBC(saldoReal)}</span>
            </div>
            <div style={estilos.badgeLinha}>
                <div style={estilos.badgePonto('#F59E0B')} />
                <span style={estilos.badgeLabel}>Bônus</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={estilos.badgeValorBonus}>₿C {fmtBC(saldoBonus)}</span>
                    <button
                        onMouseEnter={() => setTooltip(true)}
                        onMouseLeave={() => setTooltip(false)}
                        onTouchStart={() => setTooltip(p => !p)}
                        style={estilos.btnInfo}
                    >
                        ⓘ
                    </button>
                </div>
            </div>
            <div style={estilos.barraTotal}>
                <div style={{ ...estilos.barraReal,  width: `${100 - detalhe.percBonus}%` }} />
                <div style={{ ...estilos.barraBonus, width: `${detalhe.percBonus}%` }} />
            </div>
            <p style={estilos.barraLegenda}>
                {100 - detalhe.percBonus}% real · {detalhe.percBonus}% bônus
            </p>
            {tooltip && (
                <div style={estilos.tooltip}>
                    <p style={estilos.tooltipTitulo}>🎁 {BONUS.LABEL}</p>
                    <p style={estilos.tooltipTexto}>{BONUS.DESCRICAO}</p>
                    <p style={estilos.tooltipTexto}>
                        Some permanentemente se você perder tudo nas mesas.
                    </p>
                </div>
            )}
        </div>
    );
}


// ================================================================
// SUBCOMPONENTE
// ================================================================

function RegraItem({ icone, texto, cor }) {
    return (
        <div style={estilos.regraItem}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{icone}</span>
            <span style={{ ...estilos.regraTexto, color: cor }}>{texto}</span>
        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
        backdropFilter: 'blur(4px)',
    },

    modal: {
        background: '#0F172A',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: '20px',
        padding: '28px 24px',
        maxWidth: '360px', width: '100%',
        display: 'flex', flexDirection: 'column', gap: '16px',
        boxShadow: '0 0 60px rgba(245,158,11,0.10)',
        position: 'relative', overflow: 'hidden',
    },

    iconeBox: { display: 'flex', justifyContent: 'center', position: 'relative' },
    iconeGrande: { fontSize: '56px', filter: 'drop-shadow(0 0 20px rgba(245,158,11,0.5))' },
    brilho: {
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80px', height: '80px', borderRadius: '50%',
        background: 'rgba(245,158,11,0.08)', pointerEvents: 'none',
    },

    bemVindo:  { fontSize: '20px', fontWeight: '800', color: '#F8FAFC', margin: 0, textAlign: 'center' },
    subtitulo: { fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0, textAlign: 'center', lineHeight: 1.5 },

    valorDestaque: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        padding: '16px',
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: '14px',
    },

    simboloBC: { fontSize: '13px', fontWeight: '700', color: '#F59E0B' },
    valorBC:   { fontSize: '36px', fontWeight: '900', color: '#F59E0B', lineHeight: 1 },
    valorBRL:  { fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' },

    regras: {
        display: 'flex', flexDirection: 'column', gap: '8px',
        padding: '12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
    },

    regraItem:  { display: 'flex', alignItems: 'flex-start', gap: '8px' },
    regraTexto: { fontSize: '12px', lineHeight: 1.4 },
    erroTexto:  { fontSize: '12px', color: '#FCA5A5', margin: 0, textAlign: 'center' },

    btnResgatar: {
        width: '100%', padding: '14px',
        background: 'linear-gradient(135deg, #D97706, #F59E0B)',
        border: 'none', borderRadius: '12px',
        color: '#fff', fontSize: '15px', fontWeight: '700',
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: '0 4px 20px rgba(245,158,11,0.30)',
        WebkitTapHighlightColor: 'transparent',
    },

    btnPular: {
        background: 'transparent', border: 'none',
        color: 'rgba(255,255,255,0.30)', fontSize: '12px',
        cursor: 'pointer', fontFamily: 'inherit',
        padding: '4px', textAlign: 'center',
        WebkitTapHighlightColor: 'transparent',
    },

    rodapeAviso: { fontSize: '10px', color: 'rgba(255,255,255,0.20)', margin: 0, textAlign: 'center' },

    centrado: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '14px', padding: '10px 0', textAlign: 'center',
    },

    carregandoTexto: { fontSize: '14px', color: 'rgba(255,255,255,0.45)', margin: 0 },
    sucessoTitulo:   { fontSize: '22px', fontWeight: '800', color: '#4ADE80', margin: 0 },
    sucessoSub:      { fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 },

    sucessoValor: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        padding: '14px 24px',
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)',
        borderRadius: '12px',
    },

    btnJogar: {
        width: '100%', padding: '13px',
        background: 'linear-gradient(135deg, #16A34A, #22C55E)',
        border: 'none', borderRadius: '12px',
        color: '#fff', fontSize: '14px', fontWeight: '700',
        cursor: 'pointer', fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
    },

    // Badge
    badgeContainer: {
        position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px',
        padding: '10px 12px',
        background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
        borderRadius: '10px',
    },

    badgeLinha:      { display: 'flex', alignItems: 'center', gap: '7px' },
    badgePonto: (cor) => ({ width: '7px', height: '7px', borderRadius: '50%', background: cor, flexShrink: 0 }),
    badgeLabel:      { flex: 1, fontSize: '11px', color: 'rgba(255,255,255,0.40)' },
    badgeValorReal:  { fontSize: '12px', fontWeight: '700', color: '#4ADE80' },
    badgeValorBonus: { fontSize: '12px', fontWeight: '700', color: '#F59E0B' },

    btnInfo: {
        background: 'transparent', border: 'none',
        color: 'rgba(245,158,11,0.50)', cursor: 'pointer',
        fontSize: '12px', padding: '0', lineHeight: 1, fontFamily: 'inherit',
    },

    barraTotal:   { display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', gap: '1px' },
    barraReal:    { height: '100%', background: '#22C55E', borderRadius: '2px 0 0 2px', transition: 'width 0.4s ease' },
    barraBonus:   { height: '100%', background: '#F59E0B', borderRadius: '0 2px 2px 0', transition: 'width 0.4s ease' },
    barraLegenda: { fontSize: '9px', color: 'rgba(255,255,255,0.20)', margin: 0, textAlign: 'right' },

    tooltip: {
        position: 'absolute', bottom: 'calc(100% + 8px)', right: '0',
        width: '220px', background: '#1E293B',
        border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px',
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px',
        zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    },

    tooltipTitulo: { fontSize: '12px', fontWeight: '700', color: '#F59E0B', margin: 0 },
    tooltipTexto:  { fontSize: '11px', color: 'rgba(255,255,255,0.50)', margin: 0, lineHeight: 1.4 },
};