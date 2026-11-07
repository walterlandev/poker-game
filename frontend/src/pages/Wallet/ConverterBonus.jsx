/* ================================================================
   ARQUIVO: frontend/src/pages/Wallet/ConverterBonus.jsx

   Troca saldo REAL por bônus, só nesse sentido: 1 ₿C real vira
   10 ₿C de bônus (o bônus nunca volta a ser real nem pode ser sacado).
   Pede o PIN. O servidor recalcula tudo (planejarConversaoBonus em
   backend/moeda.js); a conta aqui é só a prévia.

   PROPS:
     saldoReal  → number
     socket     → Socket.io
     onFeedback → fn(tipo, mensagem)
================================================================ */

import { useState, useEffect } from 'react';
import PinConfirm from './PinConfirm';
import { fmtBC } from './walletUtils';

// Espelho de TAXA_CONVERSAO_BONUS (backend/moeda.js), só para a prévia.
const TAXA_CONVERSAO_BONUS = 10;

export default function ConverterBonus({ saldoReal = 0, socket, onFeedback }) {
    const [valor,      setValor     ] = useState('');
    const [erro,       setErro      ] = useState(null);
    const [pinAberto,  setPinAberto ] = useState(false);
    const [convertendo, setConvertendo] = useState(false);

    const v        = Number(valor);
    const valido   = Number.isInteger(v) && v >= 1;
    const bonus    = valido ? v * TAXA_CONVERSAO_BONUS : 0;

    useEffect(() => {
        if (!socket) return undefined;
        const onOk = ({ real, bonus: b }) => {
            setConvertendo(false);
            setValor('');
            onFeedback?.('sucesso', `Pronto: ₿C ${fmtBC(real)} de saldo real viraram ₿C ${fmtBC(b)} de bônus.`);
        };
        const onErro = ({ mensagem }) => {
            setConvertendo(false);
            setErro(mensagem || 'Erro ao converter.');
        };
        socket.on('wallet:conversao_ok',   onOk);
        socket.on('wallet:conversao_erro', onErro);
        return () => {
            socket.off('wallet:conversao_ok',   onOk);
            socket.off('wallet:conversao_erro', onErro);
        };
    }, [socket, onFeedback]);

    function handleSubmit() {
        if (!valido) { setErro('Informe um valor inteiro de pelo menos ₿C 1.'); return; }
        if (v > saldoReal) { setErro(`Saldo real insuficiente. Você tem ₿C ${fmtBC(saldoReal)}.`); return; }
        setErro(null);
        setPinAberto(true);
    }

    function handlePin(pin) {
        setPinAberto(false);
        setConvertendo(true);
        socket?.emit('wallet:converter_bonus', { valor: v, pin });
    }

    return (
        <section className="cart-form" aria-labelledby="cart-conv-titulo">
            <div className="cart-form-cab">
                <h3 id="cart-conv-titulo">Trocar saldo real por bônus</h3>
                <span className="cart-form-dica num">Real disponível ₿C {fmtBC(saldoReal)}</span>
            </div>

            <label className="cart-campo-rot" htmlFor="cart-conv-valor">Quanto do saldo real</label>
            <div className={`cart-campo${erro ? ' com-erro' : ''}`}>
                <span className="cart-campo-pre">₿C</span>
                <input
                    id="cart-conv-valor"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={valor}
                    onChange={e => { setValor(e.target.value); setErro(null); }}
                    aria-invalid={!!erro}
                    disabled={convertendo}
                />
                {saldoReal > 0 && (
                    <button type="button" className="cart-campo-acao texto" onClick={() => setValor(String(saldoReal))} disabled={convertendo}>
                        Tudo
                    </button>
                )}
            </div>
            {erro && <p className="cart-erro" role="alert">{erro}</p>}

            {valido && (
                <dl className="cart-resumo">
                    <div className="cart-resumo-linha">
                        <dt>Sai do saldo real</dt>
                        <dd className="num">₿C {fmtBC(v)}</dd>
                    </div>
                    <div className="cart-resumo-linha destaque positivo">
                        <dt>Entra no bônus (×{TAXA_CONVERSAO_BONUS})</dt>
                        <dd className="num">₿C {fmtBC(bonus)}</dd>
                    </div>
                </dl>
            )}

            <button
                type="button"
                onClick={handleSubmit}
                disabled={!valido || convertendo}
                aria-busy={convertendo || undefined}
                className="btn btn-principal cart-btn-cheio"
            >
                {convertendo ? 'Convertendo…' : valido ? `Trocar por ₿C ${fmtBC(bonus)} de bônus` : 'Informe o valor'}
            </button>
            <p className="cart-nota">
                Sem volta: o bônus serve só para jogar nas mesas de bônus. Ele não pode ser sacado, enviado nem virar saldo real de novo.
            </p>

            {pinAberto && (
                <PinConfirm
                    titulo="Confirmar troca por bônus"
                    descricao={`₿C ${fmtBC(v)} real → ₿C ${fmtBC(bonus)} de bônus (sem volta)`}
                    onConfirmar={handlePin}
                    onCancelar={() => setPinAberto(false)}
                />
            )}
        </section>
    );
}
