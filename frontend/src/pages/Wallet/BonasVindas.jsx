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
import { BONUS, fmtBC, detalheSaldo, temBonus } from './walletUtils';
import Icone from '../../components/Icone';


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
        <div className="modal-veu cart-pin-veu">
            <div className="cart-pin cart-bonus" role="dialog" aria-modal="true" aria-labelledby="bonus-titulo">

                {etapa === 'apresentacao' && (
                    <>
                        <span className="cart-pin-icone" aria-hidden="true"><Icone nome="presente" tamanho={22} /></span>
                        <h2 id="bonus-titulo">Bem-vindo, {nomeJogador}</h2>
                        <p className="cart-nota">Um bônus para você começar a jogar.</p>

                        <div className="cart-bonus-valor">
                            <b className="num">₿C {fmtBC(BONUS.VALOR_BC)}</b>
                            <span>de bônus, só para jogar</span>
                        </div>

                        <ul className="cart-regras">
                            <RegraItem ok texto="Use em qualquer mesa do jogo" />
                            <RegraItem ok texto="Vale enquanto você tiver saldo de bônus" />
                            <RegraItem texto="Não pode ser sacado" />
                            <RegraItem texto="Não pode ser enviado a outro jogador" />
                            <RegraItem aviso texto="Some se você perder tudo nas mesas" />
                        </ul>

                        {erro && <p className="cart-erro" role="alert">{erro}</p>}

                        <button type="button" onClick={handleResgatar} className="btn btn-principal cart-btn-cheio">
                            Resgatar bônus
                        </button>
                        <button type="button" onClick={handlePular} className="btn btn-fantasma cart-btn-cheio">
                            Pular por agora
                        </button>
                        <p className="cart-nota">O bônus é concedido uma única vez por jogador.</p>
                    </>
                )}

                {etapa === 'resgatando' && (
                    <div className="cart-vazio" role="status">
                        <span className="roda-carregando" aria-hidden="true" />
                        <p className="titulo">Creditando seu bônus…</p>
                        <p className="sub">Isso leva até 5 segundos.</p>
                        <button type="button" onClick={handlePular} className="btn btn-fantasma">Pular por agora</button>
                    </div>
                )}

                {etapa === 'resgatado' && (
                    <div className="cart-vazio" role="status">
                        <span className="cart-pin-icone" aria-hidden="true"><Icone nome="check" tamanho={22} /></span>
                        <p className="titulo">Bônus creditado</p>
                        <p className="sub num">₿C {fmtBC(BONUS.VALOR_BC)} entraram no seu saldo de bônus, que serve para jogar.</p>
                        <button type="button" onClick={onResgatado} className="btn btn-principal">
                            <Icone nome="mesas" tamanho={18} />Ir para as mesas
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


// ================================================================
// EXPORT 2: BADGE DE BÔNUS (saldo real e bônus lado a lado)
// ================================================================

export function BadgeBonus({ saldoBonus, saldoReal }) {
    const detalhe = detalheSaldo(saldoReal, saldoBonus);
    if (!temBonus(saldoBonus)) return null;
    return (
        <div className="cart-badge-bonus">
            <div className="linha"><span>Saldo real</span><b className="num">₿C {fmtBC(saldoReal)}</b></div>
            <div className="linha"><span title={BONUS.DESCRICAO}>Bônus</span><b className="num">₿C {fmtBC(saldoBonus)}</b></div>
            <div className="barra" aria-hidden="true">
                <i className="real" style={{ width: `${100 - detalhe.percBonus}%` }} />
                <i className="bonus" style={{ width: `${detalhe.percBonus}%` }} />
            </div>
            <p className="cart-nota num">{100 - detalhe.percBonus}% real, {detalhe.percBonus}% bônus</p>
        </div>
    );
}


function RegraItem({ texto, ok, aviso }) {
    return (
        <li className={ok ? 'ok' : aviso ? 'aviso' : 'nao'}>
            <Icone nome={ok ? 'check' : aviso ? 'alerta' : 'fechar'} tamanho={16} />
            <span>{texto}</span>
        </li>
    );
}
