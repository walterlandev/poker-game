/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalConfiguracoes.jsx

   Modal de configurações do jogador:
     → Segurança: criar/alterar PIN (CriarPin.jsx / AlterarPin.jsx)
     → Aparência: tema Claro, Escuro ou Igual ao aparelho (padrão),
       salvo no localStorage (core/temaVisual.js)
     → Sons do jogo (toggle on/off, salvo no localStorage)
     → Dados da conta

   PROPS:
     usuario    → { uid, nome, temPin }
     socket     → Socket.io
     onFechar   → fecha o modal
================================================================ */

import { useState, useEffect } from 'react';
import AlterarPin from '../Wallet/AlterarPin';
import CriarPin   from '../Auth/CriarPin';
import Icone      from '../../components/Icone';
import { lerPreferenciaTema, salvarPreferenciaTema } from '../../core/temaVisual';

const OPCOES_TEMA = [
    { id: 'sistema', rotulo: 'Igual ao aparelho' },
    { id: 'claro',   rotulo: 'Claro' },
    { id: 'escuro',  rotulo: 'Escuro' },
];

export default function ModalConfiguracoes({ usuario, socket, onFechar }) {
    const [secao, setSecao] = useState(null); // null | 'pin'
    const [sons,  setSons ] = useState(
        () => localStorage.getItem('poker_sons') !== 'false'
    );
    const [tema, setTema] = useState(lerPreferenciaTema);

    function toggleSons() {
        const novoValor = !sons;
        setSons(novoValor);
        localStorage.setItem('poker_sons', String(novoValor));
    }

    function escolherTema(id) {
        setTema(id);
        salvarPreferenciaTema(id);
    }

    // Esc fecha
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onFechar?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onFechar]);

    return (
        <>
            <div onClick={onFechar} className="modal-veu" />

            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-config">
                <div className="modal-cab">
                    <div className="esq">
                        {secao && (
                            <button type="button" onClick={() => setSecao(null)} className="modal-icone-btn" aria-label="Voltar">
                                <Icone nome="receber" />
                            </button>
                        )}
                        <h2 id="titulo-config">
                            {secao === 'pin'
                                ? (usuario?.temPin ? 'Alterar PIN' : 'Criar PIN')
                                : 'Configurações'}
                        </h2>
                    </div>
                    <button type="button" onClick={onFechar} className="modal-icone-btn" aria-label="Fechar">
                        <Icone nome="fechar" />
                    </button>
                </div>

                <div className="modal-corpo">

                    {!secao && (
                        <>
                            <section className="config-grupo" aria-labelledby="g-seg">
                                <h3 id="g-seg">Segurança</h3>
                                <button type="button" onClick={() => setSecao('pin')} className="config-item">
                                    <Icone nome="cadeado" />
                                    <span className="txt">
                                        <b>{usuario?.temPin ? 'Alterar PIN' : 'Criar PIN'}</b>
                                        <span>
                                            {usuario?.temPin
                                                ? 'Mude sua senha de segurança da carteira'
                                                : 'Necessário pra depositar, sacar e transferir ₿C'}
                                        </span>
                                    </span>
                                    <Icone nome="enviar" tamanho={18} className="seta" />
                                </button>
                            </section>

                            <section className="config-grupo" aria-labelledby="g-aparencia">
                                <h3 id="g-aparencia">Aparência</h3>
                                <div className="config-item estatico">
                                    <Icone nome="olho" />
                                    <span className="txt">
                                        <b>Tema</b>
                                        <span>Igual ao aparelho segue o modo claro/escuro do sistema</span>
                                    </span>
                                </div>
                                <div className="segmento segmento-largo" role="radiogroup" aria-label="Tema">
                                    {OPCOES_TEMA.map(op => (
                                        <button
                                            key={op.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={tema === op.id}
                                            onClick={() => escolherTema(op.id)}
                                        >
                                            {op.rotulo}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="config-grupo" aria-labelledby="g-pref">
                                <h3 id="g-pref">Preferências</h3>
                                <div className="config-item estatico">
                                    <Icone nome="config" />
                                    <span className="txt">
                                        <b>Sons do jogo</b>
                                        <span>Efeitos sonoros nas mesas</span>
                                    </span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={sons}
                                        aria-label="Sons do jogo"
                                        onClick={toggleSons}
                                        className={`interruptor${sons ? ' ligado' : ''}`}
                                    >
                                        <span />
                                    </button>
                                </div>
                            </section>

                            <section className="config-grupo" aria-labelledby="g-conta">
                                <h3 id="g-conta">Conta</h3>
                                <div className="config-info">
                                    <InfoLinha label="Jogador" valor={usuario?.nome || '—'} />
                                    <InfoLinha label="UID"     valor={usuario?.uid ? usuario.uid.slice(0, 16) + '…' : '—'} mono />
                                </div>
                            </section>
                        </>
                    )}

                    {/* ---- Criar ou Alterar PIN (depende se já existe um) ---- */}
                    {secao === 'pin' && (
                        usuario?.temPin ? (
                            <AlterarPin
                                usuario={usuario}
                                socket={socket}
                                onConcluido={() => setSecao(null)}
                                onCancelar={() => setSecao(null)}
                            />
                        ) : (
                            <CriarPin
                                usuario={usuario}
                                socket={socket}
                                onConcluido={() => setSecao(null)}
                            />
                        )
                    )}
                </div>
            </div>
        </>
    );
}

function InfoLinha({ label, valor, mono }) {
    return (
        <div className="info-linha">
            <span>{label}</span>
            <b className={mono ? 'mono' : ''}>{valor}</b>
        </div>
    );
}
