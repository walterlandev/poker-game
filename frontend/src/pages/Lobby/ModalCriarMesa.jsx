/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/ModalCriarMesa.jsx

   CONCEITO GERAL:
   Modal com formulário para criar uma nova mesa de poker.
   O jogador configura:
     → Nome da mesa
     → Buy-in (quanto cada jogador paga para entrar)
     → Small Blind (aposta mínima)
     → Senha (opcional — torna a mesa privada)
     → Quantidade de bots (0 a 5)

   CUSTO DE CRIAR MESA:
   Criar uma mesa custa ₿C (Bitchager). O valor é o próprio buy-in.
   Esse saldo é debitado da carteira do jogador ao criar.
   Se o jogador não tiver saldo suficiente, o botão fica bloqueado.

   MUDANÇAS DESTA VERSÃO:
     → Integração do Saldo Bônus: Agora o sistema soma usuario.saldo + usuario.bonus
       para permitir a criação da mesa.

   PROPS:
     usuario      → { uid, nome, saldo, bonus, rankPontos }
     socket       → instância do Socket.io
     onMesaCriada → function(mesaId): chamada após criar com sucesso
     onFechar     → function(): fecha o modal
================================================================ */

import { useState } from 'react';


// ================================================================
// BLOCO 1: CONFIGURAÇÕES PADRÃO E LIMITES
// ================================================================

const CONFIG_PADRAO = {
    nome:       '',
    buyIn:      1000,
    smallBlind: 10,
    senha:      '',
    qtdBots:    2,
};

const LIMITES = {
    buyIn:      { min: 100,  max: 100000 },
    smallBlind: { min: 5,    max: 500    },
    qtdBots:    { min: 0,    max: 5      },
};

// Opções de buy-in rápido para o jogador escolher
const OPCOES_BUYIN = [100, 500, 1000, 5000, 10000];

// Opções de small blind rápido
const OPCOES_BLIND = [5, 10, 25, 50, 100];

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function ModalCriarMesa({ usuario, socket, onMesaCriada, onFechar }) {

    // --- NOVIDADE: Calculando o saldo total (Real + Bônus) ---
    const saldoReal  = usuario?.saldo || 0;
    const saldoBonus = usuario?.bonus || 0; // Certifique-se de que o backend envia essa variável
    const saldoTotal = saldoReal + saldoBonus;
    // ---------------------------------------------------------

    // Estado do formulário — começa com os valores padrão
    const [form, setForm] = useState(CONFIG_PADRAO);

    // Estado de envio — evita duplo clique
    const [enviando, setEnviando] = useState(false);

    // Erros de validação por campo
    const [erros, setErros] = useState({});

    // Mostra ou esconde o campo de senha
    const [mesaPrivada, setMesaPrivada] = useState(false);


    // ----------------------------------------------------------------
    // Atualiza um campo do formulário
    // Recebe o nome do campo e o novo valor
    // ----------------------------------------------------------------
    function atualizar(campo, valor) {
        setForm(f => ({ ...f, [campo]: valor }));
        // Remove o erro do campo ao editar
        if (erros[campo]) {
            setErros(e => ({ ...e, [campo]: null }));
        }
    }


    // ----------------------------------------------------------------
    // VALIDAÇÃO
    // Retorna true se válido, false se inválido (e preenche erros)
    // ----------------------------------------------------------------
    function validar() {
        const novosErros = {};

        if (!form.nome.trim() || form.nome.trim().length < 3) {
            novosErros.nome = 'Nome deve ter pelo menos 3 caracteres.';
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
            novosErros.smallBlind = `Blind muito alto para este buy-in. Máximo: ₿C ${Math.floor(form.buyIn * 0.05)}`;
        }

        // Usa o saldoTotal para validar
        if (saldoTotal < form.buyIn) {
            novosErros.buyIn = `Saldo insuficiente. Você tem ₿C ${fmt(saldoTotal)}`;
        }

        if (mesaPrivada && form.senha.length > 0 && form.senha.length < 4) {
            novosErros.senha = 'Senha deve ter pelo menos 4 caracteres.';
        }

        setErros(novosErros);
        // Retorna true se não houver erros
        return Object.keys(novosErros).length === 0;
    }


    // ----------------------------------------------------------------
    // ENVIO DO FORMULÁRIO
    // ----------------------------------------------------------------
    async function handleCriar() {
        if (!validar()) return;
        if (enviando) return;

        setEnviando(true);

        // Monta o objeto de configuração da mesa
        const config = {
            nome:       form.nome.trim(),
            buyIn:      form.buyIn,
            smallBlind: form.smallBlind,
            senha:      mesaPrivada ? form.senha : '',
            qtdBots:    form.qtdBots,
            rankPontos: usuario?.rankPontos || 0,
        };

        // Emite o evento para o servidor via Socket.io
        socket.emit('criar_mesa', config);

        // Escuta a resposta do servidor
        socket.once('mesa_criada', ({ mesaId }) => {
            setEnviando(false);
            onMesaCriada(mesaId);
        });

        // Escuta possível erro do servidor
        socket.once('erro', ({ mensagem }) => {
            setEnviando(false);
            setErros({ geral: mensagem });
        });

        // Timeout de segurança: se o servidor não responder em 10s
        setTimeout(() => {
            if (enviando) {
                setEnviando(false);
                setErros({ geral: 'Tempo esgotado. Tente novamente.' });
            }
        }, 10000);
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <>
            {/* Overlay escuro atrás do modal */}
            <div onClick={onFechar} style={estilos.overlay} />

            {/* Container do modal */}
            <div style={estilos.modal}>

                {/* ---- Cabeçalho ---- */}
                <div style={estilos.cabecalho}>
                    <div>
                        <h2 style={estilos.titulo}>Criar Mesa</h2>
                        <p style={estilos.subtitulo}>
                            Custo: <span style={{ color: '#F59E0B' }}>₿C {fmt(form.buyIn)}</span> (buy-in)
                        </p>
                    </div>
                    <button onClick={onFechar} style={estilos.btnFechar} aria-label="Fechar">
                        ✕
                    </button>
                </div>

                {/* ---- Corpo com scroll ---- */}
                <div style={estilos.corpo}>

                    {/* Erro geral do servidor */}
                    {erros.geral && (
                        <div style={estilos.erroGeral}>{erros.geral}</div>
                    )}

                    {/* Campo: Nome da mesa */}
                    <Campo label="Nome da mesa" erro={erros.nome}>
                        <input
                            type="text"
                            placeholder="Ex: Mesa do Walterlan"
                            value={form.nome}
                            onChange={e => atualizar('nome', e.target.value)}
                            maxLength={30}
                            style={{
                                ...estilos.input,
                                borderColor: erros.nome
                                    ? 'rgba(239,68,68,0.5)'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                        />
                    </Campo>

                    {/* Campo: Buy-in com botões rápidos */}
                    <Campo label="Buy-in (₿C)" erro={erros.buyIn}>
                        <div style={estilos.botoesRapidos}>
                            {OPCOES_BUYIN.map(v => (
                                <button
                                    key={v}
                                    onClick={() => atualizar('buyIn', v)}
                                    style={{
                                        ...estilos.btnOpcao,
                                        background: form.buyIn === v
                                            ? 'rgba(124,58,237,0.3)'
                                            : 'rgba(255,255,255,0.05)',
                                        border: form.buyIn === v
                                            ? '1px solid rgba(124,58,237,0.6)'
                                            : '1px solid rgba(255,255,255,0.1)',
                                        color: form.buyIn === v ? '#A78BFA' : 'rgba(255,255,255,0.5)',
                                    }}
                                >
                                    {fmt(v)}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            value={form.buyIn}
                            onChange={e => atualizar('buyIn', parseInt(e.target.value) || 0)}
                            min={LIMITES.buyIn.min}
                            max={LIMITES.buyIn.max}
                            style={{
                                ...estilos.input,
                                marginTop: '8px',
                                borderColor: erros.buyIn
                                    ? 'rgba(239,68,68,0.5)'
                                    : 'rgba(255,255,255,0.1)',
                            }}
                        />
                    </Campo>

                    {/* Campo: Small Blind com botões rápidos */}
                    <Campo
                        label={`Small Blind (₿C) — Big Blind: ₿C ${fmt(form.smallBlind * 2)}`}
                        erro={erros.smallBlind}
                    >
                        <div style={estilos.botoesRapidos}>
                            {OPCOES_BLIND.map(v => (
                                <button
                                    key={v}
                                    onClick={() => atualizar('smallBlind', v)}
                                    style={{
                                        ...estilos.btnOpcao,
                                        background: form.smallBlind === v
                                            ? 'rgba(34,197,94,0.2)'
                                            : 'rgba(255,255,255,0.05)',
                                        border: form.smallBlind === v
                                            ? '1px solid rgba(34,197,94,0.5)'
                                            : '1px solid rgba(255,255,255,0.1)',
                                        color: form.smallBlind === v ? '#22C55E' : 'rgba(255,255,255,0.5)',
                                    }}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </Campo>

                    {/* Campo: Quantidade de bots */}
                    <Campo label={`Bots na mesa: ${form.qtdBots === 0 ? 'Nenhum' : form.qtdBots}`}>
                        <div style={estilos.sliderContainer}>
                            <span style={estilos.sliderLabel}>0</span>
                            <input
                                type="range"
                                min={LIMITES.qtdBots.min}
                                max={LIMITES.qtdBots.max}
                                value={form.qtdBots}
                                onChange={e => atualizar('qtdBots', parseInt(e.target.value))}
                                style={estilos.slider}
                            />
                            <span style={estilos.sliderLabel}>5</span>
                        </div>
                        {form.qtdBots > 0 && (
                            <p style={estilos.dicaBots}>
                                Bots do seu nível serão sorteados automaticamente
                            </p>
                        )}
                    </Campo>

                    {/* Toggle: Mesa privada */}
                    <div style={estilos.toggleContainer}>
                        <div>
                            <p style={estilos.toggleLabel}>Mesa privada</p>
                            <p style={estilos.toggleDesc}>
                                Apenas jogadores com senha podem entrar
                            </p>
                        </div>
                        <button
                            onClick={() => setMesaPrivada(p => !p)}
                            style={{
                                ...estilos.toggle,
                                background: mesaPrivada ? '#7C3AED' : 'rgba(255,255,255,0.1)',
                            }}
                            role="switch"
                            aria-checked={mesaPrivada}
                        >
                            <div style={{
                                ...estilos.toggleBolinha,
                                transform: mesaPrivada ? 'translateX(20px)' : 'translateX(0)',
                            }} />
                        </button>
                    </div>

                    {/* Campo: Senha (aparece só se mesa privada) */}
                    {mesaPrivada && (
                        <Campo label="Senha da mesa" erro={erros.senha}>
                            <input
                                type="text"
                                placeholder="Mínimo 4 caracteres"
                                value={form.senha}
                                onChange={e => atualizar('senha', e.target.value)}
                                maxLength={20}
                                style={{
                                    ...estilos.input,
                                    borderColor: erros.senha
                                        ? 'rgba(239,68,68,0.5)'
                                        : 'rgba(255,255,255,0.1)',
                                }}
                            />
                        </Campo>
                    )}

                    {/* Resumo do custo */}
                    <div style={estilos.resumoCusto}>
                        <div style={estilos.resumoLinha}>
                            <span style={estilos.resumoLabel}>Seu saldo Total</span>
                            <span style={estilos.resumoValor}>
                                ₿C {fmt(saldoTotal)}
                            </span>
                        </div>
                        <div style={estilos.resumoLinha}>
                            <span style={estilos.resumoLabel}>Custo (buy-in)</span>
                            <span style={{ ...estilos.resumoValor, color: '#EF4444' }}>
                                − ₿C {fmt(form.buyIn)}
                            </span>
                        </div>
                        <div style={estilos.separador} />
                        <div style={estilos.resumoLinha}>
                            <span style={{ ...estilos.resumoLabel, fontWeight: '600', color: '#F8FAFC' }}>
                                Saldo após criar
                            </span>
                            <span style={{
                                ...estilos.resumoValor,
                                color: (saldoTotal - form.buyIn) < 0 ? '#EF4444' : '#22C55E',
                                fontWeight: '700',
                            }}>
                                ₿C {fmt(Math.max(0, saldoTotal - form.buyIn))}
                            </span>
                        </div>
                    </div>

                </div>

                {/* ---- Rodapé com botão de criar ---- */}
                <div style={estilos.rodape}>
                    <button
                        onClick={handleCriar}
                        // Botão desativa se o saldoTotal for menor que o buyIn
                        disabled={enviando || saldoTotal < form.buyIn}
                        style={{
                            ...estilos.btnCriar,
                            opacity: enviando || saldoTotal < form.buyIn ? 0.5 : 1,
                            cursor:  enviando || saldoTotal < form.buyIn
                                ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {enviando ? 'Criando mesa...' : `Criar Mesa · ₿C ${fmt(form.buyIn)}`}
                    </button>
                </div>

            </div>
        </>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE Campo
//
// Wrapper reutilizável para campos do formulário.
// Exibe o label acima e o erro abaixo do input.
// ================================================================

function Campo({ label, erro, children }) {
    return (
        <div style={estilos.campo}>
            <label style={estilos.campoLabel}>{label}</label>
            {children}
            {erro && (
                <p style={estilos.campoErro}>{erro}</p>
            )}
        </div>
    );
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Overlay escuro
    overlay: {
        position:   'fixed',
        inset:      0,
        background: 'rgba(0,0,0,0.7)',
        zIndex:     300,
        backdropFilter: 'blur(2px)',
    },

    // Container do modal
    modal: {
        position:      'fixed',
        bottom:        0,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         '100%',
        maxWidth:      '480px',
        maxHeight:     '90vh',
        background:    '#111827',
        borderRadius:  '20px 20px 0 0',
        zIndex:        301,
        display:       'flex',
        flexDirection: 'column',
        // Safe area do iPhone
        paddingBottom: 'env(safe-area-inset-bottom)',
    },

    // Cabeçalho do modal
    cabecalho: {
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        padding:        '18px 16px 14px',
        borderBottom:   '1px solid rgba(255,255,255,0.06)',
        flexShrink:     0,
    },

    titulo: {
        fontSize:   '18px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    subtitulo: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.4)',
        margin:    '4px 0 0',
    },

    btnFechar: {
        background:   'rgba(255,255,255,0.08)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.6)',
        width:        '32px',
        height:       '32px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        cursor:       'pointer',
        fontSize:     '14px',
        flexShrink:   0,
    },

    // Corpo com scroll
    corpo: {
        flex:      1,
        overflowY: 'auto',
        padding:   '14px 16px',
        display:   'flex',
        flexDirection: 'column',
        gap:       '16px',
        WebkitOverflowScrolling: 'touch',
    },

    // Erro geral
    erroGeral: {
        background:   'rgba(239,68,68,0.1)',
        border:       '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        padding:      '10px 12px',
        fontSize:     '13px',
        color:        '#FCA5A5',
    },

    // Campo do formulário
    campo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    campoLabel: {
        fontSize:   '12px',
        fontWeight: '500',
        color:      'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },

    campoErro: {
        fontSize: '12px',
        color:    '#FCA5A5',
        margin:   0,
    },

    // Input de texto/número
    input: {
        width:        '100%',
        padding:      '10px 12px',
        background:   'rgba(255,255,255,0.05)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        '#F8FAFC',
        fontSize:     '14px',
        outline:      'none',
        boxSizing:    'border-box',
    },

    // Grid de botões de opção rápida
    botoesRapidos: {
        display:             'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap:                 '6px',
    },

    // Botão de opção rápida
    btnOpcao: {
        padding:      '7px 4px',
        borderRadius: '6px',
        fontSize:     '12px',
        fontWeight:   '500',
        cursor:       'pointer',
        transition:   'all 0.15s',
        textAlign:    'center',
        WebkitTapHighlightColor: 'transparent',
    },

    // Container do slider de bots
    sliderContainer: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
    },

    sliderLabel: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.4)',
        minWidth:  '12px',
        textAlign: 'center',
    },

    // Slider
    slider: {
        flex:        1,
        accentColor: '#7C3AED',
        cursor:      'pointer',
    },

    // Dica sobre os bots
    dicaBots: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.3)',
        margin:   '4px 0 0',
        fontStyle: 'italic',
    },

    // Container do toggle de mesa privada
    toggleContainer: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            '12px',
        padding:        '12px',
        background:     'rgba(255,255,255,0.03)',
        borderRadius:   '10px',
        border:         '1px solid rgba(255,255,255,0.06)',
    },

    toggleLabel: {
        fontSize:   '14px',
        fontWeight: '500',
        color:      '#F8FAFC',
        margin:     0,
    },

    toggleDesc: {
        fontSize: '11px',
        color:    'rgba(255,255,255,0.35)',
        margin:   '2px 0 0',
    },

    // Botão toggle
    toggle: {
        width:        '44px',
        height:       '24px',
        borderRadius: '12px',
        border:       'none',
        cursor:       'pointer',
        padding:      '2px',
        transition:   'background 0.2s',
        flexShrink:   0,
        position:     'relative',
        display:      'flex',
        alignItems:   'center',
    },

    // Bolinha do toggle
    toggleBolinha: {
        width:        '20px',
        height:       '20px',
        borderRadius: '50%',
        background:   '#fff',
        transition:   'transform 0.2s',
        position:     'absolute',
        left:         '2px',
    },

    // Box de resumo do custo
    resumoCusto: {
        background:    'rgba(255,255,255,0.03)',
        border:        '1px solid rgba(255,255,255,0.06)',
        borderRadius:  '10px',
        padding:       '12px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    resumoLinha: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
    },

    resumoLabel: {
        fontSize: '13px',
        color:    'rgba(255,255,255,0.45)',
    },

    resumoValor: {
        fontSize:   '13px',
        fontWeight: '500',
        color:      '#F8FAFC',
    },

    separador: {
        height:     '1px',
        background: 'rgba(255,255,255,0.06)',
    },

    // Rodapé com botão de criar
    rodape: {
        padding:     '12px 16px',
        borderTop:   '1px solid rgba(255,255,255,0.06)',
        flexShrink:  0,
    },

    // Botão principal de criar mesa
    btnCriar: {
        width:        '100%',
        padding:      '14px',
        background:   'linear-gradient(135deg, #7C3AED, #4F46E5)',
        border:       'none',
        borderRadius: '12px',
        color:        'white',
        fontSize:     '15px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
    },
};
