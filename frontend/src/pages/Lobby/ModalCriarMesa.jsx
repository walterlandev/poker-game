/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalCriarMesa.jsx

   Modal para criar uma mesa. O jogador escolhe:
     → Moeda da mesa: Real (padrão) ou Bônus. O buy-in sai do saldo
       daquela moeda e o que voltar ao sair volta nela também.
     → Nome, buy-in, small blind
     → Bots (0 a 5) — só em mesa de Bônus
     → Senha (opcional — torna a mesa privada)

   O saldo mostrado e a trava do botão são só visuais: o servidor é
   quem confere o saldo na moeda escolhida e decide.

   PROPS:
     usuario      → { uid, nome, saldo, saldoBonus, rankPontos }
     socket       → instância do Socket.io
     onMesaCriada → function(mesaId): chamada após criar com sucesso
     onFechar     → function(): fecha o modal
================================================================ */

import { useState, useEffect } from 'react';
import Icone from '../../components/Icone';

const CONFIG_PADRAO = {
    nome:       '',
    buyIn:      1000,
    smallBlind: 10,
    senha:      '',
    qtdBots:    2,
    moeda:      'real',
};

const LIMITES = {
    buyIn:      { min: 100,  max: 100000 },
    smallBlind: { min: 5,    max: 500    },
    qtdBots:    { min: 0,    max: 5      },
};

const OPCOES_BUYIN = [100, 500, 1000, 5000, 10000];
const OPCOES_BLIND = [5, 10, 25, 50, 100];

const NOME_MOEDA = { real: 'saldo real', bonus: 'bônus' };

function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}

export default function ModalCriarMesa({ usuario, socket, onMesaCriada, onFechar }) {

    const saldoReal  = usuario?.saldo      || 0;
    const saldoBonus = usuario?.saldoBonus || 0;

    const [form,        setForm       ] = useState(CONFIG_PADRAO);
    const [enviando,    setEnviando   ] = useState(false);
    const [erros,       setErros      ] = useState({});
    const [mesaPrivada, setMesaPrivada] = useState(false);

    const ehBonus    = form.moeda === 'bonus';
    const saldoMoeda = ehBonus ? saldoBonus : saldoReal;
    // Bots só jogam em mesa de bônus
    const qtdBots    = ehBonus ? form.qtdBots : 0;

    function atualizar(campo, valor) {
        setForm(f => ({ ...f, [campo]: valor }));
        if (erros[campo] || erros.geral) setErros(e => ({ ...e, [campo]: null, geral: null }));
    }

    // Esc fecha
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !enviando) onFechar?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onFechar, enviando]);

    // ----------------------------------------------------------------
    // VALIDAÇÃO (só para orientar; o servidor valida de novo)
    // ----------------------------------------------------------------
    function validar() {
        const novosErros = {};

        if (!form.nome.trim() || form.nome.trim().length < 3) {
            novosErros.nome = 'O nome precisa de pelo menos 3 caracteres.';
        }
        if (form.buyIn < LIMITES.buyIn.min) {
            novosErros.buyIn = `Buy-in mínimo: ₿C ${fmt(LIMITES.buyIn.min)}`;
        }
        if (form.buyIn > LIMITES.buyIn.max) {
            novosErros.buyIn = `Buy-in máximo: ₿C ${fmt(LIMITES.buyIn.max)}`;
        }
        if (form.smallBlind < LIMITES.smallBlind.min) {
            novosErros.smallBlind = `Small blind mínimo: ₿C ${LIMITES.smallBlind.min}`;
        }
        // Big blind não pode ser maior que 10% do buy-in
        const bigBlind = form.smallBlind * 2;
        if (bigBlind > form.buyIn * 0.1) {
            novosErros.smallBlind = `Blind alto demais para este buy-in. Máximo: ₿C ${Math.floor(form.buyIn * 0.05)}`;
        }
        if (saldoMoeda < form.buyIn) {
            novosErros.buyIn = `Você tem ₿C ${fmt(saldoMoeda)} de ${NOME_MOEDA[form.moeda]}, menos que o buy-in.`;
        }
        if (mesaPrivada && form.senha.length > 0 && form.senha.length < 4) {
            novosErros.senha = 'A senha precisa de pelo menos 4 caracteres.';
        }

        setErros(novosErros);
        return Object.keys(novosErros).length === 0;
    }

    // ----------------------------------------------------------------
    // ENVIO
    // ----------------------------------------------------------------
    async function handleCriar() {
        if (!validar()) return;
        if (enviando) return;

        setEnviando(true);

        const config = {
            nome:       form.nome.trim(),
            buyIn:      form.buyIn,
            smallBlind: form.smallBlind,
            senha:      mesaPrivada ? form.senha : '',
            qtdBots,
            moeda:      form.moeda,
            rankPontos: usuario?.rankPontos || 0,
        };

        socket.emit('criar_mesa', config);

        // Handlers nomeados pra poder dar socket.off explicitamente — sem
        // isso, respostas atrasadas de uma tentativa "desistida" podiam
        // acumular listeners e criar duas mesas com dois débitos.
        function cleanup() {
            socket.off('mesa_criada', onMesaCriadaHandler);
            socket.off('erro',        onErroHandler);
        }
        function onMesaCriadaHandler({ mesaId }) {
            cleanup();
            setEnviando(false);
            onMesaCriada(mesaId);
        }
        function onErroHandler({ mensagem }) {
            cleanup();
            setEnviando(false);
            setErros({ geral: mensagem });
        }

        socket.once('mesa_criada', onMesaCriadaHandler);
        socket.once('erro',        onErroHandler);

        // Timeout de segurança de 10 s (forma funcional para ler o valor atual)
        setTimeout(() => {
            setEnviando(atual => {
                if (!atual) return atual;
                cleanup();
                setErros({ geral: 'O servidor não respondeu. Tente de novo.' });
                return false;
            });
        }, 10000);
    }

    const semSaldo = saldoMoeda < form.buyIn;

    return (
        <>
            <div className="modal-veu" onClick={() => !enviando && onFechar()} />

            <div className="modal modal-largo" role="dialog" aria-modal="true" aria-labelledby="cm-titulo">
                <div className="modal-cab">
                    <div className="esq">
                        <h2 id="cm-titulo">Criar mesa</h2>
                    </div>
                    <button type="button" onClick={onFechar} className="modal-icone-btn" aria-label="Fechar" disabled={enviando}>
                        <Icone nome="fechar" />
                    </button>
                </div>

                <div className="modal-corpo cm">

                    {/* ---- Moeda da mesa ---- */}
                    <fieldset className="cm-grupo">
                        <legend className="cart-campo-rot">Moeda da mesa</legend>
                        <div className="cm-moedas" role="radiogroup" aria-label="Moeda da mesa">
                            <BotaoMoeda
                                ativo={!ehBonus}
                                titulo="Real"
                                sub="Usa o saldo real e devolve em real"
                                saldo={saldoReal}
                                onClick={() => atualizar('moeda', 'real')}
                            />
                            <BotaoMoeda
                                ativo={ehBonus}
                                titulo="Bônus"
                                sub="Usa o bônus; dá para jogar com bots"
                                saldo={saldoBonus}
                                onClick={() => atualizar('moeda', 'bonus')}
                            />
                        </div>
                    </fieldset>

                    {/* ---- Nome ---- */}
                    <label className="cart-campo-rot" htmlFor="cm-nome">Nome da mesa</label>
                    <div className={`cart-campo${erros.nome ? ' com-erro' : ''}`}>
                        <input
                            id="cm-nome"
                            type="text"
                            placeholder="Ex.: Sexta sem limite…"
                            value={form.nome}
                            onChange={e => atualizar('nome', e.target.value)}
                            maxLength={30}
                            autoComplete="off"
                            aria-invalid={!!erros.nome}
                        />
                    </div>
                    {erros.nome && <p className="cart-erro" role="alert">{erros.nome}</p>}

                    {/* ---- Buy-in ---- */}
                    <label className="cart-campo-rot" htmlFor="cm-buyin">Buy-in em ₿C de {NOME_MOEDA[form.moeda]}</label>
                    <div className="cart-atalhos">
                        {OPCOES_BUYIN.map(v => (
                            <button key={v} type="button" className="cart-chip num" aria-pressed={form.buyIn === v} onClick={() => atualizar('buyIn', v)}>
                                ₿C {fmt(v)}
                            </button>
                        ))}
                    </div>
                    <div className={`cart-campo${erros.buyIn ? ' com-erro' : ''}`}>
                        <span className="cart-campo-pre">₿C</span>
                        <input
                            id="cm-buyin"
                            type="number"
                            inputMode="numeric"
                            value={form.buyIn}
                            onChange={e => atualizar('buyIn', parseInt(e.target.value) || 0)}
                            min={LIMITES.buyIn.min}
                            max={LIMITES.buyIn.max}
                            aria-invalid={!!erros.buyIn}
                        />
                    </div>
                    {erros.buyIn && <p className="cart-erro" role="alert">{erros.buyIn}</p>}

                    {/* ---- Small blind ---- */}
                    <label className="cart-campo-rot" htmlFor="cm-blind">
                        Small blind <span className="cm-dica num">big blind ₿C {fmt(form.smallBlind * 2)}</span>
                    </label>
                    <div className="cart-atalhos">
                        {OPCOES_BLIND.map(v => (
                            <button key={v} type="button" className="cart-chip num" aria-pressed={form.smallBlind === v} onClick={() => atualizar('smallBlind', v)}>
                                ₿C {v}
                            </button>
                        ))}
                    </div>
                    {erros.smallBlind && <p className="cart-erro" role="alert">{erros.smallBlind}</p>}

                    {/* ---- Bots (só bônus) ---- */}
                    {ehBonus ? (
                        <div className="cm-grupo">
                            <label className="cart-campo-rot" htmlFor="cm-bots">
                                Bots na mesa <span className="cm-dica num">{form.qtdBots === 0 ? 'nenhum' : form.qtdBots}</span>
                            </label>
                            <div className="cm-slider">
                                <span className="num">0</span>
                                <input
                                    id="cm-bots"
                                    type="range"
                                    min={LIMITES.qtdBots.min}
                                    max={LIMITES.qtdBots.max}
                                    value={form.qtdBots}
                                    onChange={e => atualizar('qtdBots', parseInt(e.target.value))}
                                />
                                <span className="num">5</span>
                            </div>
                            {form.qtdBots > 0 && <p className="cart-nota">Bots do seu nível são sorteados automaticamente.</p>}
                        </div>
                    ) : (
                        <p className="cart-nota cm-aviso-bots">
                            <Icone nome="robo" tamanho={16} />
                            Bots só jogam em mesa de bônus.
                        </p>
                    )}

                    {/* ---- Mesa privada ---- */}
                    <div className="config-item estatico cm-privada">
                        <Icone nome="cadeado" />
                        <span className="txt">
                            <b>Mesa privada</b>
                            <span>Só entra quem souber a senha</span>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={mesaPrivada}
                            aria-label="Mesa privada"
                            onClick={() => setMesaPrivada(p => !p)}
                            className={`interruptor${mesaPrivada ? ' ligado' : ''}`}
                        >
                            <span />
                        </button>
                    </div>
                    {mesaPrivada && (
                        <>
                            <label className="cart-campo-rot" htmlFor="cm-senha">Senha da mesa</label>
                            <div className={`cart-campo${erros.senha ? ' com-erro' : ''}`}>
                                <input
                                    id="cm-senha"
                                    type="text"
                                    placeholder="Mínimo 4 caracteres…"
                                    value={form.senha}
                                    onChange={e => atualizar('senha', e.target.value)}
                                    maxLength={20}
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-invalid={!!erros.senha}
                                />
                            </div>
                            {erros.senha && <p className="cart-erro" role="alert">{erros.senha}</p>}
                        </>
                    )}

                    {/* ---- Resumo na moeda escolhida ---- */}
                    <dl className="cart-resumo">
                        <div className="cart-resumo-linha"><dt>Seu {NOME_MOEDA[form.moeda]}</dt><dd className="num">₿C {fmt(saldoMoeda)}</dd></div>
                        <div className="cart-resumo-linha"><dt>Buy-in</dt><dd className="num">− ₿C {fmt(form.buyIn)}</dd></div>
                        <div className={`cart-resumo-linha destaque${semSaldo ? ' perigo' : ''}`}>
                            <dt>Fica depois de criar</dt>
                            <dd className="num">₿C {fmt(Math.max(0, saldoMoeda - form.buyIn))}</dd>
                        </div>
                    </dl>

                    {erros.geral && <p className="cart-erro" role="alert">{erros.geral}</p>}
                </div>

                <div className="modal-rodape">
                    <button
                        type="button"
                        onClick={handleCriar}
                        disabled={enviando || semSaldo}
                        aria-busy={enviando || undefined}
                        className="btn btn-principal cart-btn-cheio"
                    >
                        {enviando
                            ? 'Criando mesa…'
                            : semSaldo
                                ? `Falta ${NOME_MOEDA[form.moeda]} para o buy-in`
                                : `Criar mesa de ${ehBonus ? 'bônus' : 'saldo real'} · ₿C ${fmt(form.buyIn)}`}
                    </button>
                </div>
            </div>
        </>
    );
}

function BotaoMoeda({ ativo, titulo, sub, saldo, onClick }) {
    return (
        <button type="button" role="radio" aria-checked={ativo} className="cm-moeda" onClick={onClick}>
            <span className="t">{titulo}</span>
            <span className="s">{sub}</span>
            <span className="v num">Você tem ₿C {fmt(saldo)}</span>
        </button>
    );
}
