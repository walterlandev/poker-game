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

import { BONUS, fmtBC, detalheSaldo, temBonus } from './walletUtils';
import Icone from '../../components/Icone';


// ================================================================
// EXPORT 1: MODAL DE BOAS-VINDAS (aparece no 1º acesso)
// ================================================================

export default function ModalBoasVindas({ nomeJogador, valor = BONUS.VALOR_BC, onFechar }) {
    // O servidor credita o bônus sozinho ao entrar (promoção até 07/12/2026);
    // este modal só avisa o jogador do que ele ganhou.
    return (
        <div className="modal-veu cart-pin-veu">
            <div className="cart-pin cart-bonus" role="dialog" aria-modal="true" aria-labelledby="bonus-titulo">
                <span className="cart-pin-icone" aria-hidden="true"><Icone nome="presente" tamanho={22} /></span>
                <h2 id="bonus-titulo">Bem-vindo, {nomeJogador}</h2>
                <p className="cart-nota">Você ganhou um bônus para começar a jogar.</p>

                <div className="cart-bonus-valor">
                    <b className="num">₿C {fmtBC(valor)}</b>
                    <span>de bônus, já na sua carteira</span>
                </div>

                <ul className="cart-regras">
                    <RegraItem ok texto="Use nas mesas e torneios de bônus" />
                    <RegraItem ok texto="Vale enquanto você tiver saldo de bônus" />
                    <RegraItem texto="Não pode ser sacado" />
                    <RegraItem texto="Não pode ser enviado a outro jogador" />
                    <RegraItem aviso texto="Some se você perder tudo nas mesas" />
                </ul>

                <button type="button" onClick={onFechar} className="btn btn-principal cart-btn-cheio">
                    <Icone nome="mesas" tamanho={18} />Ir para as mesas
                </button>
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
