/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/index.jsx

   Loja: pacotes de ₿C (pagamento PIX) e temas de baralho.
     → celular: segmento para alternar entre as duas seções
     → desktop: as duas lado a lado
   Avisos de sucesso/erro centralizados aqui e repassados aos filhos.

   PROPS:
     usuario → { uid, nome, saldo, saldoBonus, tema, temasComprados }
     socket  → instância do Socket.io
================================================================ */

import { useState, useRef, useEffect } from 'react';
import PacotesBC   from './PacotesBC';
import TemasCartas from './TemasCartas';
import Icone       from '../../../components/Icone';

export default function Loja({ usuario, socket }) {
    const [tabAtiva, setTabAtiva] = useState('bc');
    const [feedback, setFeedback] = useState(null);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);

    function mostrarFeedback(tipo, mensagem) {
        setFeedback({ tipo, mensagem });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setFeedback(null), tipo === 'erro' ? 7000 : 4500);
    }

    const saldoReal  = usuario?.saldo      || 0;
    const saldoBonus = usuario?.saldoBonus || 0;
    const saldoTotal = saldoReal + saldoBonus;

    return (
        <div className="loja">
            <div className="loja-cab">
                <h1 className="titulo-secao">Loja</h1>
                <p className="loja-saldo num">
                    Saldo <b className="cor-bc">₿C {saldoTotal.toLocaleString('pt-BR')}</b>
                    <span> · real ₿C {saldoReal.toLocaleString('pt-BR')} · bônus ₿C {saldoBonus.toLocaleString('pt-BR')}</span>
                </p>
            </div>

            <div aria-live="polite">
                {feedback && (
                    <button type="button" className={`aviso-inline ${feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}`} onClick={() => setFeedback(null)}>
                        <span>{feedback.mensagem}</span>
                        <Icone nome="fechar" tamanho={16} />
                    </button>
                )}
            </div>

            <div className="segmento segmento-largo loja-alterna" role="group" aria-label="Seção da loja">
                <button type="button" aria-pressed={tabAtiva === 'bc'} onClick={() => setTabAtiva('bc')}>Pacotes de ₿C</button>
                <button type="button" aria-pressed={tabAtiva === 'temas'} onClick={() => setTabAtiva('temas')}>Temas de baralho</button>
            </div>

            <div className="loja-colunas">
                <section className={`loja-col${tabAtiva === 'bc' ? ' ativa' : ''}`} aria-labelledby="loja-bc-titulo">
                    <h2 id="loja-bc-titulo" className="loja-col-titulo">Pacotes de ₿C</h2>
                    <PacotesBC
                        saldoAtual={saldoTotal}
                        usuario={usuario}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                </section>

                <section className={`loja-col${tabAtiva === 'temas' ? ' ativa' : ''}`} aria-labelledby="loja-temas-titulo">
                    <h2 id="loja-temas-titulo" className="loja-col-titulo">Temas de baralho</h2>
                    <TemasCartas
                        saldoAtual={saldoTotal}
                        temaAtual={usuario?.tema || 'classico'}
                        temasComprados={usuario?.temasComprados || []}
                        socket={socket}
                        onFeedback={mostrarFeedback}
                    />
                </section>
            </div>
        </div>
    );
}
