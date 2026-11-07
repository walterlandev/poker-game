/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/PinConfirm.jsx

   CONCEITO GERAL:
   Modal de segurança que solicita o PIN do jogador
   antes de executar qualquer ação sensível da carteira:
     → Depósito
     → Saque
     → Envio de ₿C

   FLUXO:
     1. Modal abre com título e descrição da ação pendente
     2. Jogador digita o PIN no campo de texto
     3. Pode mostrar/ocultar com botão de olho
     4. Ao clicar Confirmar, onConfirmar(pin) é chamado
     5. Backend valida o PIN real — aqui só validamos formato

   SEGURANÇA:
     → PIN oculto por padrão (type=password)
     → ESC ou clique no fundo cancela a ação
     → autoComplete="off" para evitar preenchimento automático
     → O bloqueio por tentativas erradas é feito no SERVIDOR
       (backend/wallet/wallet-manager.js, verificarPin) — um limite
       só no cliente não protegia nada de verdade, já que o modal
       remonta do zero a cada tentativa.

   PROPS:
     titulo      → string : título da ação (ex: "Confirmar saque")
     descricao   → string : resumo do que vai acontecer
     onConfirmar → fn(pin: string) : chamado com o PIN digitado
     onCancelar  → fn() : chamado ao cancelar
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import Icone from '../../components/Icone';


// ================================================================
// CONSTANTES
// ================================================================

const PIN_MIN = 4;

// ================================================================
// COMPONENTE PRINCIPAL
// ================================================================

export default function PinConfirm({ titulo, descricao, onConfirmar, onCancelar }) {

    const [pin,      setPin     ] = useState('');
    const [verPin,   setVerPin  ] = useState(false);
    const [erro,     setErro    ] = useState(null);
    const [agitando, setAgitando] = useState(false);

    const inputRef = useRef(null);

    // Foca o input ao abrir
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // ----------------------------------------------------------------
    // Fechar com ESC
    // ----------------------------------------------------------------
    useEffect(() => {
        function handleKey(e) {
            if (e.key === 'Escape') onCancelar();
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onCancelar]);

    // ----------------------------------------------------------------
    // Animação de erro
    // ----------------------------------------------------------------
    const agitar = useCallback(() => {
        setAgitando(true);
        setTimeout(() => setAgitando(false), 500);
    }, []);

    // ----------------------------------------------------------------
    // Confirma o PIN — a validação de tentativas/bloqueio é toda do
    // servidor; aqui só checamos o formato antes de enviar.
    // ----------------------------------------------------------------
    const handleConfirmar = useCallback(() => {
        if (!pin || pin.length < PIN_MIN) {
            agitar();
            setErro(`PIN deve ter no mínimo ${PIN_MIN} caracteres.`);
            return;
        }
        onConfirmar(pin);
    }, [pin, agitar, onConfirmar]);

    // Confirma ao pressionar Enter
    function handleKeyDown(e) {
        if (e.key === 'Enter') handleConfirmar();
    }

    const pinValido = pin.length >= PIN_MIN;

    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div className="modal-veu cart-pin-veu" onClick={onCancelar}>
            <div
                className="cart-pin"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cart-pin-titulo"
                onClick={e => e.stopPropagation()}
            >
                <span className="cart-pin-icone" aria-hidden="true"><Icone nome="cadeado" tamanho={22} /></span>
                <h2 id="cart-pin-titulo">{titulo}</h2>
                {descricao && <p className="cart-pin-desc num">{descricao}</p>}

                <label className="cart-campo-rot" htmlFor="cart-pin-input">PIN de segurança</label>
                <div className={`cart-campo${erro ? ' com-erro' : ''}${agitando ? ' agitando' : ''}`}>
                    <input
                        id="cart-pin-input"
                        ref={inputRef}
                        type={verPin ? 'text' : 'password'}
                        value={pin}
                        onChange={e => { setPin(e.target.value); setErro(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite seu PIN…"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? 'cart-pin-erro' : undefined}
                    />
                    <button
                        type="button"
                        onClick={() => setVerPin(v => !v)}
                        className="cart-campo-acao"
                        aria-label={verPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                        aria-pressed={verPin}
                    >
                        <Icone nome="olho" tamanho={18} />
                    </button>
                </div>

                {erro && <p id="cart-pin-erro" className="cart-erro" role="alert">{erro}</p>}

                <button type="button" onClick={handleConfirmar} disabled={!pinValido} className="btn btn-principal cart-btn-cheio">
                    Confirmar
                </button>
                <button type="button" onClick={onCancelar} className="btn btn-fantasma cart-btn-cheio">
                    Cancelar
                </button>

                <p className="cart-nota">Nunca compartilhe seu PIN com ninguém.</p>
            </div>
        </div>
    );
}
