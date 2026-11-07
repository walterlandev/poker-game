/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/PacotesBC.jsx

   CONCEITO GERAL:
   O jogador escolhe quanto quer depositar:
     → Valores predefinidos: R$ 1, R$ 10, R$ 20, R$ 50, R$ 100
     → Ou digita qualquer valor no campo livre

   CONVERSÃO:
     R$ 1,00  =  ₿C 1.000  (na carteira)
     ₿C 1.000 =  1 ficha    (na mesa de jogo)

   Exemplo com R$ 20:
     Paga: R$ 22,00 (R$ 20 + 10% de taxa)
     Recebe: ₿C 20.000 na carteira
     Na mesa aparece como: 20 fichas

   CORREÇÃO DESTA VERSÃO:
     → handleComprar agora abre PinConfirm antes de emitir
       wallet:depositar. O backend exige PIN válido — antes
       estava enviando pin: null causando erro silencioso.

   PROPS:
     saldoAtual → number: saldo atual do jogador em ₿C
     usuario    → object: { uid, nome }
     socket     → Socket.io
     onFeedback → fn(tipo, msg)
================================================================ */

import { useState, useEffect, useMemo } from 'react';
import Icone from '../../../components/Icone';
import { calcularDeposito, fmt, fmtBC, TAXAS, LIMITES } from '../../Wallet/walletUtils';
import PinConfirm from '../../Wallet/PinConfirm';


// ================================================================
// BLOCO 1: VALORES PREDEFINIDOS
// ================================================================

const VALORES_RAPIDOS = [
    { brl: 1,   label: 'R$ 1',   fichas: '1'   },
    { brl: 10,  label: 'R$ 10',  fichas: '10'  },
    { brl: 20,  label: 'R$ 20',  fichas: '20'  },
    { brl: 50,  label: 'R$ 50',  fichas: '50'  },
    { brl: 100, label: 'R$ 100', fichas: '100' },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function PacotesBC({ saldoAtual, usuario, socket, onFeedback }) {

    const [valorBRL,   setValorBRL  ] = useState('');
    const [metodo] = useState('pix');   // só PIX por enquanto (cartão não está disponível)
    const [etapa,      setEtapa     ] = useState('selecao'); // selecao | aguardando | qrcode | sucesso
    const [qrCode,     setQrCode    ] = useState(null);
    const [pixCopia,   setPixCopia  ] = useState(null);
    const [copiado,    setCopiado   ] = useState(false);
    const [erroValor,  setErroValor ] = useState('');

    // ── NOVO: controle do PIN ──────────────────────────────────────
    const [pinAberto,    setPinAberto]    = useState(false);
    const [calculoPendente, setCalculoPendente] = useState(null);
    // ─────────────────────────────────────────────────────────────

    // Valor numérico limpo
    const valorNum = parseFloat(valorBRL) || 0;

    // Cálculo em tempo real
    const calculo = useMemo(() => {
        if (!valorNum || valorNum < LIMITES.DEPOSITO_MIN_BRL) return null;
        return calcularDeposito(valorNum);
    }, [valorNum]);



    // ----------------------------------------------------------------
    // Escuta eventos do socket
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        socket.on('wallet:deposito_confirmado', ({ bcCreditar }) => {
            setEtapa('sucesso');
            onFeedback?.('sucesso', `Pagamento confirmado: ₿C ${fmtBC(bcCreditar)} no saldo real.`);
            setTimeout(() => {
                setEtapa('selecao');
                setValorBRL('');
                setQrCode(null);
                setPixCopia(null);
            }, 3000);
        });

        socket.on('wallet:deposito_iniciado', (data) => {
            if (data.qrCode)        setQrCode(data.qrCode);
            if (data.pixCopiaECola) setPixCopia(data.pixCopiaECola);
            setEtapa('qrcode');
        });

        // Sem isso, PIN errado / valor inválido / falha no PIX deixava a
        // tela travada pra sempre no spinner "Gerando pagamento...".
        const onErro = ({ mensagem }) => {
            if (etapa !== 'aguardando') return;
            setEtapa('selecao');
            onFeedback?.('erro', mensagem || 'Não foi possível gerar o pagamento. Tente novamente.');
        };
        socket.on('erro', onErro);

        return () => {
            socket.off('wallet:deposito_confirmado');
            socket.off('wallet:deposito_iniciado');
            socket.off('erro', onErro);
        };
    }, [socket, onFeedback, etapa]);


    // ----------------------------------------------------------------
    // Seleciona valor rápido
    // ----------------------------------------------------------------
    function handleValorRapido(brl) {
        setValorBRL(String(brl));
        setErroValor('');
    }


    // ----------------------------------------------------------------
    // Inicia pagamento → valida → abre PIN
    // ----------------------------------------------------------------
    function handleComprar() {
        if (!usuario?.temPin) {
            onFeedback?.('erro', 'Você ainda não tem um PIN de segurança. Crie um em Configurações antes de comprar.');
            return;
        }
        if (!valorNum || valorNum < LIMITES.DEPOSITO_MIN_BRL) {
            setErroValor(`Valor mínimo: R$ ${fmt(LIMITES.DEPOSITO_MIN_BRL)}`);
            return;
        }
        if (valorNum > LIMITES.DEPOSITO_MAX_BRL) {
            setErroValor(`Valor máximo: R$ ${fmt(LIMITES.DEPOSITO_MAX_BRL)}`);
            return;
        }
        if (!calculo || !socket) return;

        // ── NOVO: guarda o cálculo e abre o PIN ───────────────────
        setCalculoPendente(calculo);
        setPinAberto(true);
        // ─────────────────────────────────────────────────────────
    }

    // ----------------------------------------------------------------
    // PIN confirmado → emite ao backend
    // ----------------------------------------------------------------
    function handlePinConfirmado(pin) {
        if (!calculoPendente || !socket) return;

        setPinAberto(false);
        setEtapa('aguardando');

        socket.emit('wallet:depositar', {
            uid:        usuario?.uid,
            valorBRL:   calculoPendente.valorBRL,
            taxaBRL:    calculoPendente.taxaBRL,
            bcEsperado: calculoPendente.bcRecebido,
            pin,
            metodo,
        });

        setCalculoPendente(null);
    }


    // ----------------------------------------------------------------
    // Copia PIX
    // ----------------------------------------------------------------
    function handleCopiarPix() {
        if (!pixCopia) return;
        navigator.clipboard.writeText(pixCopia).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        });
    }

    function handleCancelar() {
        setEtapa('selecao');
        setQrCode(null);
        setPixCopia(null);
    }


    // ================================================================
    // AGUARDANDO
    // ================================================================
    if (etapa === 'aguardando') {
        return (
            <div className="cart-vazio" role="status">
                <span className="roda-carregando" aria-hidden="true" />
                <p className="titulo">Gerando o PIX…</p>
                <p className="sub">Isso leva alguns segundos.</p>
            </div>
        );
    }

    // ================================================================
    // QR CODE PIX
    // ================================================================
    if (etapa === 'qrcode') {
        return (
            <div className="cart-pix">
                <div className="cart-form-cab">
                    <h3>Pague o PIX para concluir</h3>
                </div>
                <p className="cart-pix-resumo num">
                    R$ {fmt(calculo?.totalBRL || 0)} <span aria-hidden="true">→</span> ₿C {fmtBC(calculo?.bcRecebido || 0)} no saldo real
                </p>
                <div className="cart-qr">
                    {qrCode
                        ? <img src={`data:image/png;base64,${qrCode}`} alt="QR Code do PIX" width={200} height={200} />
                        : <p className="cart-nota" role="status">Carregando QR Code…</p>}
                </div>
                {pixCopia && (
                    <div className="cart-copia">
                        <label className="cart-campo-rot" htmlFor="loja-pix">PIX copia e cola</label>
                        <div className="cart-copia-linha">
                            <input id="loja-pix" readOnly value={pixCopia} className="num" onFocus={e => e.target.select()} />
                            <button type="button" onClick={handleCopiarPix} className={`btn ${copiado ? 'btn-neutro' : 'btn-principal'}`}>
                                <Icone nome={copiado ? 'check' : 'copiar'} tamanho={16} />{copiado ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                    </div>
                )}
                <p className="cart-nota" role="status">Aguardando o pagamento. O saldo é creditado sozinho depois que você pagar.</p>
                <button type="button" onClick={handleCancelar} className="btn btn-fantasma">Cancelar</button>
            </div>
        );
    }

    // ================================================================
    // SUCESSO
    // ================================================================
    if (etapa === 'sucesso') {
        return (
            <div className="cart-vazio" role="status">
                <span className="cart-pin-icone" aria-hidden="true"><Icone nome="check" tamanho={22} /></span>
                <p className="titulo">Pagamento confirmado</p>
                <p className="sub">O valor já entrou no seu saldo real.</p>
            </div>
        );
    }

    // ================================================================
    // SELEÇÃO PRINCIPAL
    // ================================================================
    return (
        <div className="cart-form sem-borda">
            <p className="cart-nota num">
                R$ 1 = ₿C {fmtBC(1000)} · taxa de {TAXAS.DEPOSITO * 100}% cobrada além do valor · entra no saldo real
            </p>

            <span className="cart-campo-rot">Escolha um valor</span>
            <div className="loja-pacotes" role="group" aria-label="Valores">
                {VALORES_RAPIDOS.map(v => (
                    <button key={v.brl} type="button" className="loja-pacote" aria-pressed={valorNum === v.brl} onClick={() => handleValorRapido(v.brl)}>
                        <b className="num">{v.label}</b>
                        <span className="num">₿C {fmtBC(v.brl * 1000)}</span>
                    </button>
                ))}
            </div>

            <label className="cart-campo-rot" htmlFor="loja-valor">Ou digite o valor em reais</label>
            <div className={`cart-campo${erroValor ? ' com-erro' : ''}`}>
                <span className="cart-campo-pre">R$</span>
                <input
                    id="loja-valor"
                    type="number"
                    inputMode="decimal"
                    min={LIMITES.DEPOSITO_MIN_BRL}
                    max={LIMITES.DEPOSITO_MAX_BRL}
                    step="1"
                    placeholder="0,00"
                    value={valorBRL}
                    onChange={e => { setValorBRL(e.target.value); setErroValor(''); }}
                    aria-invalid={!!erroValor}
                />
            </div>
            {erroValor && <p className="cart-erro" role="alert">{erroValor}</p>}

            {calculo && (
                <dl className="cart-resumo">
                    <LinhaPreview label="Você recebe" valor={`₿C ${fmtBC(calculo.bcRecebido)}`} tom="positivo" destaque />
                    <LinhaPreview label="Valor" valor={`R$ ${fmt(calculo.valorBRL)}`} />
                    <LinhaPreview label={`Taxa (${calculo.taxaPerc}%)`} valor={`+ R$ ${fmt(calculo.taxaBRL)}`} />
                    <LinhaPreview label="Total a pagar" valor={`R$ ${fmt(calculo.totalBRL)}`} destaque />
                    <LinhaPreview label="Saldo depois" valor={`₿C ${fmtBC(saldoAtual + calculo.bcRecebido)}`} />
                </dl>
            )}

            <p className="cart-nota">Pagamento por PIX. Você confirma com o PIN.</p>
            <button type="button" onClick={handleComprar} disabled={!calculo} className="btn btn-principal cart-btn-cheio">
                {calculo ? `Gerar PIX de R$ ${fmt(calculo.totalBRL)}` : 'Escolha um valor'}
            </button>

            {pinAberto && calculoPendente && (
                <PinConfirm
                    titulo="Confirmar compra"
                    descricao={`R$ ${fmt(calculoPendente.totalBRL)} → ₿C ${fmtBC(calculoPendente.bcRecebido)}`}
                    onConfirmar={handlePinConfirmado}
                    onCancelar={() => { setPinAberto(false); setCalculoPendente(null); }}
                />
            )}
        </div>
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
