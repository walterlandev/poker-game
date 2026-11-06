/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/SendBC.jsx

   CONCEITO GERAL:
   Permite que o jogador transfira ₿C para outro jogador.
   Fluxo:
     1. Jogador digita nome/uid do destinatário
     2. Sistema busca e confirma que o destinatário existe
     3. Jogador informa o valor em ₿C
     4. Preview mostra taxa + total debitado
     5. PinConfirm solicita PIN de segurança
     6. socket.emit('wallet:enviar') → backend executa

   SEGURANÇA:
     → PIN obrigatório antes de qualquer envio
     → Validação de saldo + limites via walletUtils
     → Backend re-valida tudo antes de executar
     → Jogador não pode enviar para si mesmo

   PROPS:
     saldo      → number  : saldo REAL do remetente em ₿C (o bônus não pode ser enviado)
     usuario    → object  : { uid, nome }
     socket     → Socket.io
     onFeedback → fn(tipo, msg)
================================================================ */

import { useState, useRef, useCallback } from 'react';
import PinConfirm from './PinConfirm';
import Icone      from '../../components/Icone';
import {
    calcularEnvio,
    validarEnvio,
    fmtBC,
    fmt,
    bcParaBRL,
    LIMITES,
    TAXAS,
} from './walletUtils';


// ================================================================
// BLOCO 1: ESTADOS DO FLUXO
// ================================================================
// idle       → tela inicial, busca de destinatário
// buscando   → aguardando resposta do socket sobre o destinatário
// confirmando→ destinatário encontrado, jogador informa o valor
// pin        → valor confirmado, aguarda PIN
// enviando   → PIN confirmado, aguardando resposta do backend

const ETAPA = {
    IDLE:        'idle',
    BUSCANDO:    'buscando',
    CONFIRMANDO: 'confirmando',
    PIN:         'pin',
    ENVIANDO:    'enviando',
};


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function SendBC({ saldo, usuario, socket, onFeedback }) {

    const [etapa,          setEtapa]          = useState(ETAPA.IDLE);
    const [queryDestinat,  setQueryDestinat]   = useState('');
    const [destinatario,   setDestinatario]    = useState(null);  // { uid, nome, avatar }
    const [valorEnvio,     setValorEnvio]      = useState('');
    const [mensagem,       setMensagem]        = useState('');    // mensagem opcional
    const [erroDestinat,   setErroDestinat]    = useState(null);
    const [erroValor,      setErroValor]       = useState(null);

    const timeoutBusca = useRef(null);

    const preview = (() => {
        const v = parseFloat(valorEnvio);
        return !isNaN(v) && v > 0 ? calcularEnvio(v) : null;
    })();


    // ----------------------------------------------------------------
    // Busca destinatário com debounce de 600ms
    // ----------------------------------------------------------------
    const buscarDestinatario = useCallback((query) => {
        setQueryDestinat(query);
        setDestinatario(null);
        setErroDestinat(null);

        if (timeoutBusca.current) clearTimeout(timeoutBusca.current);
        if (!query.trim() || query.trim().length < 3) {
            setEtapa(ETAPA.IDLE);
            return;
        }

        timeoutBusca.current = setTimeout(() => {
            if (!socket) return;
            setEtapa(ETAPA.BUSCANDO);

            // Remove qualquer listener de uma busca anterior ainda pendente —
            // sem isso, duas buscas em sequência rápida podiam deixar a
            // resposta da busca antiga sobrescrever a mais recente.
            socket.off('wallet:jogador_encontrado');
            socket.off('wallet:jogador_nao_encontrado');

            socket.emit('wallet:buscar_jogador', { query: query.trim() });

            socket.once('wallet:jogador_encontrado', (data) => {
                if (!data || !data.uid) {
                    setErroDestinat('Jogador não encontrado.');
                    setEtapa(ETAPA.IDLE);
                    return;
                }
                if (data.uid === usuario?.uid) {
                    setErroDestinat('Você não pode enviar ₿C para si mesmo.');
                    setEtapa(ETAPA.IDLE);
                    return;
                }
                setDestinatario(data);
                setEtapa(ETAPA.CONFIRMANDO);
            });

            socket.once('wallet:jogador_nao_encontrado', () => {
                setErroDestinat('Jogador não encontrado. Verifique o nome ou ID.');
                setEtapa(ETAPA.IDLE);
            });

        }, 600);
    }, [socket, usuario?.uid]);


    // ----------------------------------------------------------------
    // Limpa e volta ao início
    // ----------------------------------------------------------------
    function resetar() {
        setEtapa(ETAPA.IDLE);
        setQueryDestinat('');
        setDestinatario(null);
        setValorEnvio('');
        setMensagem('');
        setErroDestinat(null);
        setErroValor(null);
        if (timeoutBusca.current) clearTimeout(timeoutBusca.current);
        socket?.off('wallet:jogador_encontrado');
        socket?.off('wallet:jogador_nao_encontrado');
    }


    // ----------------------------------------------------------------
    // Valida valor e abre PIN
    // ----------------------------------------------------------------
    function handleConfirmarValor() {
        if (!usuario?.temPin) {
            setErroValor('Você ainda não tem um PIN de segurança. Crie um em Configurações antes de enviar.');
            return;
        }
        const v   = parseFloat(valorEnvio);
        const val = validarEnvio(v, saldo);
        if (!val.valido) { setErroValor(val.erro); return; }
        setErroValor(null);
        setEtapa(ETAPA.PIN);
    }


    // ----------------------------------------------------------------
    // PIN confirmado → emite evento ao backend
    // ----------------------------------------------------------------
    function handlePinConfirmado(pin) {
        if (!destinatario || !preview || !socket) return;

        setEtapa(ETAPA.ENVIANDO);

        socket.emit('wallet:enviar', {
            remetenteUid:    usuario?.uid,
            destinatarioUid: destinatario.uid,
            valorBC:         preview.bcEnviado,
            taxaBC:          preview.taxaBC,
            totalDebitado:   preview.totalDebitado,
            mensagem:        mensagem.trim() || null,
            pin,
        });

        socket.once('wallet:envio_confirmado', () => {
            onFeedback('sucesso',
                `₿C ${fmtBC(preview.bcEnviado)} enviados para ${destinatario.nome}.`
            );
            resetar();
        });

        socket.once('wallet:envio_erro', (err) => {
            onFeedback('erro', err?.mensagem || 'Erro ao enviar. Tente novamente.');
            setEtapa(ETAPA.CONFIRMANDO);
        });
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <section className="cart-form" aria-labelledby="cart-env-titulo">
            <div className="cart-form-cab">
                <h3 id="cart-env-titulo">Enviar ₿C para um jogador</h3>
                <span className="cart-form-dica num">Real disponível ₿C {fmtBC(saldo)}</span>
            </div>

            {/* ---- Etapa 1: busca do destinatário ---- */}
            {(etapa === ETAPA.IDLE || etapa === ETAPA.BUSCANDO) && (
                <>
                    <label className="cart-campo-rot" htmlFor="cart-env-busca">Para quem</label>
                    <div className={`cart-campo${erroDestinat ? ' com-erro' : ''}`}>
                        <span className="cart-campo-pre" aria-hidden="true"><Icone nome="busca" tamanho={16} /></span>
                        <input
                            id="cart-env-busca"
                            type="text"
                            placeholder="Nome ou ID do jogador…"
                            value={queryDestinat}
                            onChange={e => buscarDestinatario(e.target.value)}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={!!erroDestinat}
                        />
                        {queryDestinat.length > 0 && (
                            <button type="button" className="cart-campo-acao" onClick={resetar} aria-label="Limpar busca">
                                <Icone nome="fechar" tamanho={16} />
                            </button>
                        )}
                    </div>
                    {etapa === ETAPA.BUSCANDO && <p className="cart-nota" role="status">Buscando jogador…</p>}
                    {erroDestinat && <p className="cart-erro" role="alert">{erroDestinat}</p>}
                    {etapa === ETAPA.IDLE && !erroDestinat && (
                        <p className="cart-nota">Digite pelo menos 3 caracteres.</p>
                    )}
                </>
            )}

            {/* ---- Etapa 2: destinatário encontrado + valor ---- */}
            {(etapa === ETAPA.CONFIRMANDO || etapa === ETAPA.PIN || etapa === ETAPA.ENVIANDO) && destinatario && (
                <>
                    <div className="cart-destino">
                        <span className="cart-destino-av" aria-hidden="true">
                            {destinatario.avatar
                                ? <img src={destinatario.avatar} alt="" width={40} height={40} />
                                : (destinatario.nome?.[0]?.toUpperCase() || '?')}
                        </span>
                        <span className="txt">
                            <b>{destinatario.nome}</b>
                            <span className="num">{destinatario.uid?.slice(0, 12)}…</span>
                        </span>
                        <button type="button" className="btn btn-fantasma" onClick={resetar} disabled={etapa !== ETAPA.CONFIRMANDO}>
                            Trocar
                        </button>
                    </div>

                    <label className="cart-campo-rot" htmlFor="cart-env-valor">Valor em ₿C</label>
                    <div className={`cart-campo${erroValor ? ' com-erro' : ''}`}>
                        <span className="cart-campo-pre">₿C</span>
                        <input
                            id="cart-env-valor"
                            type="number"
                            inputMode="numeric"
                            min={LIMITES.ENVIO_MIN_BC}
                            max={Math.min(LIMITES.ENVIO_MAX_BC, saldo)}
                            step="100"
                            placeholder="0"
                            value={valorEnvio}
                            onChange={e => { setValorEnvio(e.target.value); setErroValor(null); }}
                            disabled={etapa !== ETAPA.CONFIRMANDO}
                            aria-invalid={!!erroValor}
                        />
                    </div>
                    <div className="cart-atalhos">
                        {[1000, 5000, 10000, 50000].map(v => (
                            <button
                                key={v}
                                type="button"
                                className="cart-chip num"
                                aria-pressed={valorEnvio === String(v)}
                                onClick={() => { setValorEnvio(String(v)); setErroValor(null); }}
                                disabled={v > saldo || etapa !== ETAPA.CONFIRMANDO}
                            >
                                ₿C {fmtBC(v)}
                            </button>
                        ))}
                    </div>
                    {erroValor && <p className="cart-erro" role="alert">{erroValor}</p>}

                    {preview && (
                        <dl className="cart-resumo">
                            <LinhaPreview label={`${destinatario.nome?.split(' ')[0] || 'Destinatário'} recebe`} valor={`₿C ${fmtBC(preview.bcEnviado)}`} tom="positivo" destaque />
                            <LinhaPreview label={`Taxa de envio (${TAXAS.ENVIO * 100}%, mínimo ₿C ${fmtBC(TAXAS.ENVIO_MIN)})`} valor={`₿C ${fmtBC(preview.taxaBC)}`} />
                            <LinhaPreview label="Sai do seu saldo real" valor={`₿C ${fmtBC(preview.totalDebitado)}`} destaque />
                            <LinhaPreview label="Equivale a" valor={`R$ ${fmt(bcParaBRL(preview.totalDebitado))}`} />
                            <LinhaPreview
                                label="Saldo real depois do envio"
                                valor={`₿C ${fmtBC(Math.max(0, saldo - preview.totalDebitado))}`}
                                tom={saldo - preview.totalDebitado < 0 ? 'perigo' : undefined}
                            />
                        </dl>
                    )}

                    {etapa === ETAPA.CONFIRMANDO && (
                        <>
                            <label className="cart-campo-rot" htmlFor="cart-env-msg">Mensagem (opcional)</label>
                            <div className="cart-campo area">
                                <textarea
                                    id="cart-env-msg"
                                    placeholder="Ex.: boa sorte na mesa…"
                                    value={mensagem}
                                    onChange={e => setMensagem(e.target.value.slice(0, 100))}
                                    maxLength={100}
                                    rows={2}
                                />
                            </div>
                            <p className="cart-nota num">{mensagem.length}/100</p>

                            <button type="button" onClick={handleConfirmarValor} disabled={!preview} className="btn btn-principal cart-btn-cheio">
                                {preview ? `Enviar ₿C ${fmtBC(preview.bcEnviado)}` : 'Informe o valor'}
                            </button>
                        </>
                    )}

                    {etapa === ETAPA.ENVIANDO && (
                        <button type="button" disabled aria-busy="true" className="btn btn-principal cart-btn-cheio">
                            Enviando…
                        </button>
                    )}
                </>
            )}

            {etapa === ETAPA.PIN && preview && destinatario && (
                <PinConfirm
                    titulo="Confirmar envio"
                    descricao={`Enviar ₿C ${fmtBC(preview.bcEnviado)} para ${destinatario.nome}`}
                    onConfirmar={handlePinConfirmado}
                    onCancelar={() => setEtapa(ETAPA.CONFIRMANDO)}
                />
            )}

            <p className="cart-nota">
                Envios não podem ser desfeitos depois da confirmação com PIN. Confira o nome antes de confirmar. O bônus não pode ser enviado.
            </p>
        </section>
    );
}


function LinhaPreview({ label, valor, tom, destaque }) {
    return (
        <div className={`cart-resumo-linha${destaque ? ' destaque' : ''}${tom ? ' ' + tom : ''}`}>
            <dt>{label}</dt>
            <dd className="num">{valor}</dd>
        </div>
    );
}
