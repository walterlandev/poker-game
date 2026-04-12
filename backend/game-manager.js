/* ================================================================
   ARQUIVO: backend/game-manager.js

   VERSÃO RECONSTRUÍDA - REGRAS OFICIAIS DE POKER
   ================================================================
   CORREÇÕES CRÍTICAS:
   → apostaTotal: rastreada por mão (para Side Pots corretos)
   → Odd Chip (ficha ímpar): entregue ao jogador mais à esquerda do dealer
   → CHECK ilegal rejeitado (não convertido silenciosamente em CALL)
   → RAISE mínimo: min-raise correto (último raise + aposta atual)
   → Burn Cards: descartadas antes de Flop, Turn e River
   → All-In incompleto: não reabre apostas para quem já igualou
   → Heads-Up (1v1): Dealer = Small Blind, age por último no Pré-Flop
   → Opção do Big Blind (Walk): garantida no Pré-Flop
   → Faltas por jogador: fold/check automático, remoção após MAX_FALTAS
   ================================================================ */

import { calcularForca }           from './core/engine-poker.js';
import { BotManager }              from './core/bots.js';
import { gerarBaralho }            from './core/deck.js';
import { salvarResultadoRodada }   from './firebase-admin.js';

const mesas = new Map();

const CONFIG = {
    TEMPO_HUMANO:   90_000,  // 90 segundos
    TEMPO_BOT:      30_000,  // 30 segundos
    DELAY_SHOWDOWN:  8_000,  // 8 segundos antes da próxima rodada
    MAX_FALTAS:          3,  // faltas seguidas antes de remover da mesa
};

const BOT_FRASES = {
    FOLD:  ['Tô fora',     'Desisto',       'Essa não dá',  'Fui'],
    CHECK: ['Mesa',        'Check',          'Sigo',         'Bato'],
    CALL:  ['Pago',        'Vou ver',        'Call',         'Tô dentro'],
    RAISE: ['Aumento!',    'Subindo...',     'Raise!',       'Vai encarar?'],
};


// ================================================================
// AUXILIARES INTERNOS
// ================================================================

/**
 * Encontra o índice de um uid na ordem circular da mesa.
 * Retorna -1 se não encontrado.
 */
function idxNaOrdem(mesa, uid) {
    return mesa.ordem.indexOf(uid);
}

/**
 * Próximo uid na ordem circular a partir de startIdx (exclusive).
 * Ignora jogadores que não atendam ao predicado.
 */
function proximoNaOrdem(mesa, startUid, predicado) {
    const total = mesa.ordem.length;
    let   idx   = idxNaOrdem(mesa, startUid);
    for (let i = 0; i < total; i++) {
        idx = (idx + 1) % total;
        const uid = mesa.ordem[idx];
        const j   = mesa.jogadores[uid];
        if (j && predicado(uid, j)) return uid;
    }
    return null;
}


export class GameManager {

    constructor(io) {
        this.io     = io;
        this.timers = new Map();
    }


    // ================================================================
    // EMISSÃO DE ESTADO
    // ================================================================

    emitirEstado(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        this.io.in(mesaId).fetchSockets().then(sockets => {
            sockets.forEach(socket => {
                const uid           = socket.data.uid;
                const estadoFiltrado = this.filtrarEstadoParaJogador(mesa, uid);
                socket.emit('estado_mesa', estadoFiltrado);
            });
        });
    }

    filtrarEstadoParaJogador(mesa, meuUid) {
        const jogadoresFiltrados = {};

        Object.entries(mesa.jogadores).forEach(([uid, jogador]) => {
            jogadoresFiltrados[uid] = {
                ...jogador,
                cartas: (uid === meuUid || mesa.fase === 'SHOWDOWN')
                    ? jogador.cartas
                    : jogador.cartas.map(() => 'XX'),
            };
        });

        return {
            ...mesa,
            baralho:   [],   // nunca expõe o baralho ao cliente
            jogadores: jogadoresFiltrados,
        };
    }

    emitirAcao(mesaId, uid, texto) {
        this.io.to(mesaId).emit('acao_jogador', { uid, texto });
    }

    emitirErro(socketId, mensagem) {
        this.io.to(socketId).emit('erro', { mensagem });
    }


    // ================================================================
    // GERENCIAMENTO DE MESAS
    // ================================================================

    criarMesa(config, usuario) {
        const mesaId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const bb     = (config.smallBlind || 10) * 2;

        const mesa = {
            id:                   mesaId,
            nome:                 config.nome || `Mesa de ${usuario.nome}`,
            host:                 usuario.uid,
            fase:                 'AGUARDANDO',
            pote:                 0,
            maiorAposta:          0,
            ultimoRaiseVal:       bb,
            bigBlind:             bb,
            smallBlind:           config.smallBlind || 10,
            valorBuyIn:           config.buyIn || 1000,
            dealer:               null,
            sbId:                 null,
            bbId:                 null,
            primeiroJogador:      null,  // uid do agressor (para detectar volta de volta)
            turno:                null,
            baralho:              [],
            cartasComunitarias:   [],
            mensagemVitoria:      null,
            ultimaAcaoDescritiva: 'Mesa criada. Aguardando jogadores.',
            ordem:                [usuario.uid],
            jogadores: {
                [usuario.uid]: this._criarJogador(usuario, config.buyIn || 1000, 'humano'),
            },
        };

        mesas.set(mesaId, mesa);
        return { sucesso: true, mesaId };
    }

    entrarMesa(mesaId, usuario, socket) {
        const mesa = mesas.get(mesaId);
        if (!mesa)                                         return { sucesso: false, erro: 'Mesa não encontrada.' };
        if (Object.keys(mesa.jogadores).length >= 9)       return { sucesso: false, erro: 'Mesa cheia.' };
        if (mesa.jogadores[usuario.uid])                   return { sucesso: true,  mesaId };

        mesa.ordem.push(usuario.uid);
        mesa.jogadores[usuario.uid] = this._criarJogador(usuario, mesa.valorBuyIn, 'humano');

        socket.join(mesaId);
        socket.data.uid = usuario.uid;

        this.emitirEstado(mesaId);
        return { sucesso: true, mesaId };
    }

    sairMesa(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.jogadores[uid]) return;

        mesa.ordem = mesa.ordem.filter(id => id !== uid);
        delete mesa.jogadores[uid];

        const humanos = Object.values(mesa.jogadores).filter(j => j.tipo === 'humano');
        if (humanos.length === 0) {
            this._limparTimers(mesaId);
            mesas.delete(mesaId);
            return;
        }

        if (mesa.host === uid) mesa.host = humanos[0].uid;

        this.emitirEstado(mesaId);
    }

    adicionarBot(mesaId, rankPontosJogador = 0) {
        const mesa = mesas.get(mesaId);
        if (!mesa || Object.keys(mesa.jogadores).length >= 9) return;

        const index = Object.keys(mesa.jogadores).length;
        const bot   = BotManager.gerarBot(index, mesa.valorBuyIn, rankPontosJogador);

        mesa.ordem.push(bot.uid);
        mesa.jogadores[bot.uid] = {
            uid:            bot.uid,
            nome:           bot.nome,
            avatar:         bot.avatar,
            saldo:          bot.saldo,
            cartas:         [],
            status:         'ativo',
            apostaRodada:   0,
            apostaTotal:    0,   // acumulado durante TODA a mão (para side pots)
            faltasSeguidas: 0,
            tipo:           'cpu',
            estilo:         bot.estilo,
            nivel:          bot.nivel,
        };

        this.emitirEstado(mesaId);
    }

    _criarJogador(usuario, buyIn, tipo) {
        return {
            uid:            usuario.uid,
            nome:           usuario.nome,
            avatar:         usuario.avatar || '',
            saldo:          buyIn,
            cartas:         [],
            status:         'ativo',
            apostaRodada:   0,
            apostaTotal:    0,   // acumulado durante TODA a mão (para side pots)
            faltasSeguidas: 0,
            tipo,
        };
    }


    // ================================================================
    // INÍCIO DE RODADA
    // ================================================================

    iniciarRodada(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.saldo > 0;
        });

        if (ativos.length < 2) {
            mesa.fase            = 'AGUARDANDO';
            mesa.mensagemVitoria = 'Aguardando jogadores com fichas...';
            this.emitirEstado(mesaId);
            return;
        }

        const baralho = gerarBaralho();

        // Reseta estado de todos os jogadores para a nova mão
        ativos.forEach(uid => {
            const j         = mesa.jogadores[uid];
            j.status        = 'ativo';
            j.apostaRodada  = 0;
            j.apostaTotal   = 0;   // ← RESET obrigatório a cada mão
            j.cartas        = [baralho.pop(), baralho.pop()];
        });

        // Bots zerados de saldo recebem rebuy automático
        Object.values(mesa.jogadores).forEach(j => {
            if (j.tipo === 'cpu' && j.saldo <= 0) {
                j.saldo        = mesa.valorBuyIn;
                j.status       = 'ativo';
                j.apostaTotal  = 0;
            }
        });

        // Avança o dealer
        const idxDealerAtual = ativos.indexOf(mesa.dealer);
        const idxNovoDealer  = (idxDealerAtual + 1) % ativos.length;
        mesa.dealer          = ativos[idxNovoDealer];

        // Posições de SB, BB e primeiro a agir
        let sbIdx, bbIdx, primeiroIdx;
        if (ativos.length === 2) {
            // Heads-Up: Dealer = Small Blind, age primeiro no Pré-Flop
            sbIdx       = idxNovoDealer;
            bbIdx       = (idxNovoDealer + 1) % ativos.length;
            primeiroIdx = idxNovoDealer;       // Dealer/SB age primeiro
        } else {
            sbIdx       = (idxNovoDealer + 1) % ativos.length;
            bbIdx       = (idxNovoDealer + 2) % ativos.length;
            primeiroIdx = (idxNovoDealer + 3) % ativos.length;
        }

        const sbId    = ativos[sbIdx];
        const bbId    = ativos[bbIdx];

        this._aplicarBlind(mesa, sbId, mesa.smallBlind);
        this._aplicarBlind(mesa, bbId, mesa.bigBlind);

        mesa.baralho              = baralho;
        mesa.cartasComunitarias   = [];
        mesa.fase                 = 'PRE-FLOP';
        mesa.pote                 = mesa.jogadores[sbId].apostaRodada
                                  + mesa.jogadores[bbId].apostaRodada;
        mesa.maiorAposta          = mesa.bigBlind;
        mesa.ultimoRaiseVal       = mesa.bigBlind;
        mesa.sbId                 = sbId;
        mesa.bbId                 = bbId;
        // primeiroJogador aponta para o BB → marca a "volta completa" no Pré-Flop
        mesa.primeiroJogador      = bbId;
        mesa.turno                = ativos[primeiroIdx];
        mesa.mensagemVitoria      = null;
        mesa.ultimaAcaoDescritiva = 'Nova rodada iniciada. Blinds apostados.';

        this.emitirEstado(mesaId);
        this._gerenciarTurno(mesaId);
    }

    _aplicarBlind(mesa, uid, valor) {
        const j          = mesa.jogadores[uid];
        if (!j) return;
        const apostaReal  = Math.min(valor, j.saldo);
        j.saldo          -= apostaReal;
        j.apostaRodada    = apostaReal;
        j.apostaTotal     = apostaReal;   // blind já conta no total da mão
        if (j.saldo === 0) j.status = 'all-in';
    }


    // ================================================================
    // TURNO E TIMERS
    // ================================================================

    _gerenciarTurno(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.turno) return;

        this._limparTimers(mesaId);

        const uid   = mesa.turno;
        const ehBot = uid.startsWith('bot_');
        const tempo = ehBot ? CONFIG.TEMPO_BOT : CONFIG.TEMPO_HUMANO;

        this.io.to(mesaId).emit('iniciar_relogio', { uid, ms: tempo });

        const timerInfo = { timerAtivo: true, relogio: null, acao: null };
        this.timers.set(mesaId, timerInfo);

        timerInfo.acao = setTimeout(() => {
            const mesaAtual = mesas.get(mesaId);
            if (!mesaAtual || mesaAtual.turno !== uid) return;
            if (!timerInfo.timerAtivo) return;
            timerInfo.timerAtivo = false;

            if (ehBot) {
                this._executarIA(mesaId, uid);
            } else {
                this._processarEstouroTempo(mesaId, uid);
            }
        }, tempo + 500);
    }

    _limparTimers(mesaId) {
        const t = this.timers.get(mesaId);
        if (!t) return;
        if (t.relogio)   clearInterval(t.relogio);
        if (t.acao)      clearTimeout(t.acao);
        if (t.reiniciar) clearTimeout(t.reiniciar);
        t.timerAtivo = false;
        this.timers.delete(mesaId);
    }

    // ----------------------------------------------------------------
    // Sistema de faltas por jogador
    // ----------------------------------------------------------------
    _processarEstouroTempo(mesaId, uid) {
        const mesa    = mesas.get(mesaId);
        if (!mesa) return;
        const jogador = mesa.jogadores[uid];
        if (!jogador) return;

        jogador.faltasSeguidas = (jogador.faltasSeguidas || 0) + 1;
        console.log(`⏱ ${jogador.nome} faltou (${jogador.faltasSeguidas}/${CONFIG.MAX_FALTAS})`);

        if (jogador.faltasSeguidas >= CONFIG.MAX_FALTAS) {
            console.log(`🚫 ${jogador.nome} removido por inatividade.`);
            this.io.to(mesaId).emit('notificacao', {
                mensagem: `${jogador.nome} foi removido por inatividade.`,
            });
            jogador.status = 'fold';
            jogador.cartas = [];
            this.sairMesa(mesaId, uid);
            this._avancarJogo(mesaId);
            return;
        }

        // Fold ou Check automático conforme a situação
        const podeChecar = (mesa.maiorAposta || 0) <= (jogador.apostaRodada || 0);
        const acao       = podeChecar ? 'CHECK' : 'FOLD';

        this.io.to(mesaId).emit('notificacao', {
            mensagem: `${jogador.nome} — falta ${jogador.faltasSeguidas}/${CONFIG.MAX_FALTAS} (${acao} automático)`,
        });

        // Ação automática: socketId = null (não reseta faltasSeguidas)
        this.processarAcao(mesaId, uid, acao, 0, null);
    }


    // ================================================================
    // PROCESSAMENTO DE AÇÕES  ←  NÚCLEO DO MOTOR
    // ================================================================

    processarAcao(mesaId, uid, acao, valorTotal, socketId = null) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        if (mesa.turno !== uid) {
            if (socketId) this.emitirErro(socketId, 'Não é sua vez.');
            return;
        }

        const jogador = mesa.jogadores[uid];
        if (!jogador) return;

        // Ação voluntária do cliente → reseta contador de faltas
        if (socketId !== null) {
            jogador.faltasSeguidas = 0;
        }

        const jaApostou  = jogador.apostaRodada || 0;
        const apostaMesa = mesa.maiorAposta     || 0;
        const custo      = apostaMesa - jaApostou;  // quanto falta para igualar

        // ── Validações de ações ilegais ──────────────────────────────

        // CHECK ilegal: há aposta maior na mesa
        if (acao === 'CHECK' && custo > 0) {
            if (socketId) {
                this.emitirErro(socketId, 'Você não pode pedir mesa. Há uma aposta na frente — pague ou desista.');
            } else {
                // Para ação automática/IA, converte em FOLD (mais conservador)
                acao = 'FOLD';
            }
            if (socketId) return;  // rejeita a ação do humano
        }

        // RAISE com valor insuficiente: trata como CALL
        if (acao === 'RAISE' && valorTotal <= apostaMesa) {
            acao = 'CALL';
        }

        // Validação do raise mínimo (No-Limit: último raise + aposta atual)
        if (acao === 'RAISE') {
            const raiseMinimo    = apostaMesa + (mesa.ultimoRaiseVal || mesa.bigBlind);
            const maximoPossivel = jogador.saldo + jaApostou;
            if (valorTotal < raiseMinimo && valorTotal < maximoPossivel) {
                if (socketId) {
                    this.emitirErro(socketId, `Raise mínimo: $${raiseMinimo}`);
                    return;
                }
                // IA solicitando raise inválido → converte em CALL
                acao = 'CALL';
            }
        }

        // ── Processa a ação ────────────────────────────────────────────

        let textoBalao     = acao;
        let fraseNarrativa = '';
        let valorInvestido = 0;
        let reabriuApostas = false;  // flag para All-In incompleto

        if (acao === 'FOLD') {
            jogador.status = 'fold';
            jogador.cartas = [];
            fraseNarrativa = `${jogador.nome} desistiu.`;
            textoBalao     = 'FOLD';
        }
        else if (acao === 'CHECK') {
            fraseNarrativa = `${jogador.nome} pediu mesa.`;
            textoBalao     = 'CHECK';
        }
        else if (acao === 'CALL') {
            if (jogador.saldo > custo) {
                // Call normal
                valorInvestido = custo;
                fraseNarrativa = `${jogador.nome} pagou $${custo}.`;
                textoBalao     = 'CALL';
            } else {
                // All-In incompleto (não pode igualar totalmente)
                valorInvestido = jogador.saldo;
                jogador.status = 'all-in';
                fraseNarrativa = `${jogador.nome} ALL-IN ($${valorInvestido})!`;
                textoBalao     = 'ALL-IN';
                // All-In incompleto NÃO reabre apostas
                reabriuApostas = false;
            }
        }
        else if (acao === 'RAISE') {
            const aumentoReal = valorTotal - jaApostou;

            if (jogador.saldo >= aumentoReal) {
                // Raise completo
                const salto          = valorTotal - apostaMesa;
                valorInvestido       = aumentoReal;
                mesa.maiorAposta     = valorTotal;
                mesa.ultimoRaiseVal  = salto;
                mesa.primeiroJogador = uid;
                reabriuApostas       = true;
                textoBalao           = `Raise $${valorTotal}`;
                fraseNarrativa       = `${jogador.nome} aumentou para $${valorTotal}.`;
            } else {
                // All-In com raise parcial
                valorInvestido       = jogador.saldo;
                const totalApostado  = jaApostou + valorInvestido;
                jogador.status       = 'all-in';

                if (totalApostado > apostaMesa) {
                    const salto = totalApostado - apostaMesa;

                    // Só reabre apostas se o aumento for ≥ ao último raise (regra oficial)
                    if (salto >= (mesa.ultimoRaiseVal || mesa.bigBlind)) {
                        mesa.primeiroJogador = uid;
                        mesa.ultimoRaiseVal  = salto;
                        reabriuApostas       = true;
                        textoBalao           = 'ALL-IN (Raise)';
                        fraseNarrativa       = `${jogador.nome} ALL-IN para $${totalApostado}! (Raise completo)`;
                    } else {
                        // All-In incompleto: não reabre apostas para quem já igualou
                        reabriuApostas = false;
                        textoBalao     = 'ALL-IN (Parcial)';
                        fraseNarrativa = `${jogador.nome} ALL-IN para $${totalApostado}! (Incompleto — sem re-abertura)`;
                    }
                    mesa.maiorAposta = Math.max(mesa.maiorAposta, totalApostado);
                } else {
                    // All-In abaixo da maior aposta
                    reabriuApostas = false;
                    textoBalao     = 'ALL-IN';
                    fraseNarrativa = `${jogador.nome} ALL-IN ($${totalApostado}).`;
                }
            }
        }

        // Aplica investimento financeiro
        if (valorInvestido > 0) {
            jogador.saldo        -= valorInvestido;
            jogador.apostaRodada  = jaApostou + valorInvestido;
            jogador.apostaTotal   = (jogador.apostaTotal || 0) + valorInvestido;  // ← CRÍTICO
            mesa.pote            += valorInvestido;
        }

        // Se o raise reabriu apostas, atualiza o marcador de primeira posição
        if (reabriuApostas) {
            mesa.primeiroJogador = uid;
        }

        mesa.ultimaAcao           = acao;
        mesa.ultimaAcaoDescritiva = fraseNarrativa;

        this.emitirAcao(mesaId, uid, textoBalao);
        this._limparTimers(mesaId);
        this._avancarJogo(mesaId);
    }


    // ================================================================
    // FLUXO DO JOGO
    // ================================================================

    _avancarJogo(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Quantos ainda têm cartas e não deram fold?
        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.cartas && j.cartas.length > 0
                && j.status !== 'fold'
                && j.status !== 'sitout';
        });

        // Apenas 1 ativo → vencedor por W.O.
        if (ativos.length === 1) {
            this._finalizarMao(mesaId, ativos[0], true);
            return;
        }

        const proximo = this._encontrarProximo(mesaId);

        if (proximo) {
            mesa.turno = proximo;
            this.emitirEstado(mesaId);
            this._gerenciarTurno(mesaId);
        } else {
            this._avancarFase(mesaId);
        }
    }

    /**
     * Encontra o próximo jogador que ainda precisa agir.
     * Respeita a regra do primeiroJogador para detectar "volta completa".
     * Respeita a opção do Big Blind (Walk) no Pré-Flop.
     * Respeita All-In incompleto (quem já igualou NÃO precisa agir novamente).
     */
    _encontrarProximo(mesaId) {
        const mesa     = mesas.get(mesaId);
        if (!mesa) return null;

        const ordem     = mesa.ordem;
        const total     = ordem.length;
        const uidAtual  = mesa.turno;
        let   index     = ordem.indexOf(uidAtual);
        const aggressor = mesa.primeiroJogador;
        const targetAp  = mesa.maiorAposta || 0;

        for (let i = 0; i < total; i++) {
            index     = (index + 1) % total;
            const uid = ordem[index];
            const j   = mesa.jogadores[uid];

            if (!j) continue;
            if (!j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            const ap = j.apostaRodada || 0;

            // Sem aposta na mesa → todos checam, aguarda primeira volta
            if (targetAp === 0) {
                if (uid === aggressor) return null;  // volta completa
                return uid;
            }

            // Jogador ainda não igualou → precisa agir
            if (ap < targetAp) return uid;

            // Chegou de volta ao agressor (ou BB no pré-flop)
            if (uid === aggressor) {
                // Opção do Big Blind (Walk): BB pode agir mesmo tendo "igualado" o próprio blind
                const bbPodeAgir = mesa.fase === 'PRE-FLOP'
                    && uid === mesa.bbId
                    && ap >= mesa.bigBlind          // BB só colocou o blind, não fez raise
                    && uidAtual !== mesa.bbId;      // ainda não foi a vez do BB
                if (bbPodeAgir) return uid;

                return null;  // volta completa, encerra a fase
            }
        }

        return null;
    }

    /**
     * Avança para a próxima fase (Flop, Turn, River, Showdown).
     * Queima uma carta antes de revelar as comunitárias (Burn Card).
     */
    _avancarFase(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        if (mesa.fase === 'RIVER' || mesa.fase === 'SHOWDOWN') {
            this._calcularVencedor(mesaId);
            return;
        }

        const fases    = ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'];
        const idx      = fases.indexOf(mesa.fase);
        if (idx === -1) return;

        const novaFase = fases[idx + 1];

        // Reseta apostas da rodada para todos
        mesa.ordem.forEach(uid => {
            if (mesa.jogadores[uid]) mesa.jogadores[uid].apostaRodada = 0;
        });

        mesa.maiorAposta    = 0;
        mesa.ultimoRaiseVal = mesa.bigBlind;
        mesa.fase           = novaFase;

        // Queima uma carta antes de revelar (Burn Card — regra oficial)
        mesa.baralho.pop();

        if (novaFase === 'FLOP') {
            mesa.cartasComunitarias.push(
                mesa.baralho.pop(),
                mesa.baralho.pop(),
                mesa.baralho.pop(),
            );
            mesa.ultimaAcaoDescritiva = 'O Flop foi revelado.';
        } else {
            mesa.cartasComunitarias.push(mesa.baralho.pop());
            mesa.ultimaAcaoDescritiva = `O ${novaFase} foi revelado.`;
        }

        const primeiro = this._encontrarPrimeiroParaAgir(mesaId);

        if (!primeiro) {
            // Todos all-in → avança automaticamente
            this.emitirEstado(mesaId);
            setTimeout(() => this._avancarFase(mesaId), 1_500);
            return;
        }

        mesa.turno           = primeiro;
        mesa.primeiroJogador = primeiro;

        this.emitirEstado(mesaId);
        this._gerenciarTurno(mesaId);
    }

    /**
     * Primeiro a agir no pós-flop: primeiro ativo à esquerda do dealer.
     */
    _encontrarPrimeiroParaAgir(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return null;

        const ordem = mesa.ordem;
        let   idx   = ordem.indexOf(mesa.dealer);
        if (idx === -1) idx = 0;

        for (let i = 0; i < ordem.length; i++) {
            idx       = (idx + 1) % ordem.length;
            const uid = ordem[idx];
            const j   = mesa.jogadores[uid];

            if (!j || !j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            return uid;
        }
        return null;
    }


    // ================================================================
    // SHOWDOWN E SIDE POTS
    // ================================================================

    _calcularVencedor(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const elegiveis = mesa.ordem
            .map(uid => ({ uid, jogador: mesa.jogadores[uid] }))
            .filter(({ jogador: j }) =>
                j && j.cartas && j.cartas.length > 0 && j.status !== 'fold'
            );

        if (elegiveis.length === 0) {
            mesa.fase            = 'SHOWDOWN';
            mesa.mensagemVitoria = 'Rodada anulada.';
            this.emitirEstado(mesaId);
            this._agendarProximaRodada(mesaId);
            return;
        }

        // Calcula força de cada mão elegível
        const forcas = {};
        elegiveis.forEach(({ uid, jogador }) => {
            forcas[uid] = calcularForca(jogador.cartas, mesa.cartasComunitarias);
        });

        const potes         = this._calcularPotes(mesa, elegiveis.map(e => e.uid));
        const premiados     = {};
        const descricoesMao = {};

        potes.forEach(pote => {
            let melhorPontos = -1;
            let vencedores   = [];

            pote.elegiveis.forEach(uid => {
                const f            = forcas[uid];
                descricoesMao[uid] = f.nome;
                if (f.pontos > melhorPontos) {
                    melhorPontos = f.pontos;
                    vencedores   = [uid];
                } else if (f.pontos === melhorPontos) {
                    vencedores.push(uid);
                }
            });

            const valorPote = pote.valor;
            const nVenc     = vencedores.length;
            const base      = Math.floor(valorPote / nVenc);
            const resto     = valorPote % nVenc;  // ficha(s) ímpar(es)

            vencedores.forEach(uid => {
                premiados[uid] = (premiados[uid] || 0) + base;
            });

            // Odd Chip: entregue ao vencedor mais à esquerda do dealer
            if (resto > 0) {
                const uidOddChip = this._vencedorMaisProximoDoDealer(mesa, vencedores);
                premiados[uidOddChip] = (premiados[uidOddChip] || 0) + resto;
            }
        });

        // Credita os prêmios
        Object.entries(premiados).forEach(([uid, premio]) => {
            mesa.jogadores[uid].saldo += premio;
        });

        const nomesVencedores = Object.keys(premiados).map(uid => {
            const j   = mesa.jogadores[uid];
            const mao = descricoesMao[uid] || '';
            return `${j.nome} (${mao} +$${premiados[uid]})`;
        });

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';
        mesa.mensagemVitoria      = `🏆 ${nomesVencedores.join(' | ')}`;
        mesa.ultimaAcaoDescritiva = `Fim da mão. ${mesa.mensagemVitoria}`;

        this.emitirEstado(mesaId);
        this._agendarProximaRodada(mesaId);

        const resultados = elegiveis.map(({ uid, jogador }) => ({
            uid,
            nome:           jogador.nome,
            avatar:         jogador.avatar || '',
            fichasGanhas:   premiados[uid]  || 0,
            fichasPerdidas: premiados[uid]  ? 0 : mesa.valorBuyIn,
            venceu:         !!premiados[uid],
        }));
        salvarResultadoRodada(resultados);
    }

    /**
     * Retorna o uid do vencedor mais próximo à esquerda do dealer
     * (para distribuição da Odd Chip em empates).
     */
    _vencedorMaisProximoDoDealer(mesa, vencedores) {
        const ordem     = mesa.ordem;
        const idxDealer = ordem.indexOf(mesa.dealer);

        for (let i = 1; i <= ordem.length; i++) {
            const uid = ordem[(idxDealer + i) % ordem.length];
            if (vencedores.includes(uid)) return uid;
        }
        return vencedores[0];  // fallback
    }

    /**
     * Calcula pote(s) principal e side pots corretamente.
     * Usa apostaTotal (acumulado na mão toda) para jogadores all-in.
     */
    _calcularPotes(mesa, elegiveisUids) {
        const temAllIn = elegiveisUids.some(uid => mesa.jogadores[uid].status === 'all-in');
        if (!temAllIn) {
            return [{ valor: mesa.pote, elegiveis: elegiveisUids }];
        }

        // Monta caps (limite de contribuição de cada all-in, baseado em apostaTotal)
        const caps = elegiveisUids
            .filter(uid => mesa.jogadores[uid].status === 'all-in')
            .map(uid => mesa.jogadores[uid].apostaTotal || 0)
            .filter((v, i, a) => a.indexOf(v) === i)  // únicos
            .sort((a, b) => a - b);

        // Adiciona Infinity como último cap (para jogadores que não estão all-in)
        caps.push(Infinity);

        const potes     = [];
        let   capAnter  = 0;

        for (const cap of caps) {
            const valorDoPote = elegiveisUids.reduce((soma, uid) => {
                const total = mesa.jogadores[uid].apostaTotal || 0;
                return soma + Math.min(Math.max(total - capAnter, 0), cap - capAnter);
            }, 0);

            if (valorDoPote <= 0) continue;

            // São elegíveis neste pote todos que contribuíram até este cap
            const elegiveisAqui = elegiveisUids.filter(uid => {
                const total = mesa.jogadores[uid].apostaTotal || 0;
                return total > capAnter;
            });

            // Jogadores all-in com apostaTotal < cap não são elegíveis além do seu cap
            // → elegíveis = todos com apostaTotal >= cap  OR  que não estão all-in
            const elegiveisNoPote = elegiveisAqui.filter(uid => {
                const j     = mesa.jogadores[uid];
                const total = j.apostaTotal || 0;
                if (j.status !== 'all-in') return true;  // jogadores ativos sempre elegíveis nos seus potes
                return total >= cap;
            });

            if (elegiveisNoPote.length > 0) {
                potes.push({ valor: valorDoPote, elegiveis: elegiveisNoPote });
            }

            capAnter = cap;
            if (cap === Infinity) break;
        }

        // Verifica se a soma bate com o pote total (correção de arredondamento)
        const somaPotes = potes.reduce((s, p) => s + p.valor, 0);
        const diff      = mesa.pote - somaPotes;
        if (diff !== 0 && potes.length > 0) {
            potes[potes.length - 1].valor += diff;
        }

        return potes;
    }

    _finalizarMao(mesaId, vencedorUid, porWO = false) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const j        = mesa.jogadores[vencedorUid];
        const potGanho = mesa.pote;
        j.saldo       += potGanho;

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';
        mesa.mensagemVitoria      = porWO
            ? `🏆 ${j.nome} levou o pote! (W.O.)`
            : `🏆 ${j.nome} venceu!`;
        mesa.ultimaAcaoDescritiva = `${j.nome} ganhou $${potGanho} (todos desistiram).`;

        this.emitirEstado(mesaId);
        this._agendarProximaRodada(mesaId);

        salvarResultadoRodada([{
            uid:            vencedorUid,
            nome:           j.nome,
            avatar:         j.avatar || '',
            fichasGanhas:   potGanho,
            fichasPerdidas: 0,
            venceu:         true,
        }]);
    }

    _agendarProximaRodada(mesaId) {
        const t     = this.timers.get(mesaId) || {};
        t.reiniciar = setTimeout(() => this.iniciarRodada(mesaId), CONFIG.DELAY_SHOWDOWN);
        this.timers.set(mesaId, t);
    }


    // ================================================================
    // INTELIGÊNCIA ARTIFICIAL DOS BOTS
    // ================================================================

    _executarIA(mesaId, botId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const bot = mesa.jogadores[botId];
        if (!bot || !bot.cartas || bot.cartas.length === 0) {
            this._avancarJogo(mesaId);
            return;
        }

        if (bot.status === 'all-in') {
            this._avancarJogo(mesaId);
            return;
        }

        try {
            const custo   = (mesa.maiorAposta || 0) - (bot.apostaRodada || 0);
            const decisao = BotManager.decidirJogada(
                bot, bot.cartas, mesa.cartasComunitarias,
                custo, mesa.pote, mesa.bigBlind,
            );

            const frases = BOT_FRASES[decisao.acao] || BOT_FRASES.CHECK;
            let   frase  = frases[Math.floor(Math.random() * frases.length)];
            if (decisao.acao === 'RAISE') frase += ` $${decisao.valor}`;

            this.emitirAcao(mesaId, botId, frase);

            const delay = Math.random() * 1_000 + 500;
            setTimeout(() => {
                this.processarAcao(mesaId, botId, decisao.acao, decisao.valor);
            }, delay);

        } catch (e) {
            console.error(`Erro IA bot ${botId}:`, e);
            this._processarEstouroTempo(mesaId, botId);
        }
    }


    // ================================================================
    // REBUY
    // ================================================================

    fazerRebuy(mesaId, uid, valor) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };

        const jogador = mesa.jogadores[uid];
        if (!jogador) return { sucesso: false, erro: 'Jogador não encontrado.' };

        const maoAtiva = jogador.cartas && jogador.cartas.length > 0
                      && mesa.fase !== 'SHOWDOWN'
                      && mesa.fase !== 'AGUARDANDO';

        if (maoAtiva) {
            return { sucesso: false, erro: 'Não pode fazer rebuy durante uma mão ativa.' };
        }

        jogador.saldo += valor;
        if (jogador.status === 'eliminado') jogador.status = 'ativo';

        this.emitirEstado(mesaId);
        return { sucesso: true };
    }


    // ================================================================
    // ACESSO AO ESTADO
    // ================================================================

    getMesa(mesaId)    { return mesas.get(mesaId); }
    getMesasAtivas()   { return Array.from(mesas.values()); }
    mesaExiste(mesaId) { return mesas.has(mesaId); }
}
