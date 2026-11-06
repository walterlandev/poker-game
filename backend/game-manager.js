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
    TEMPO_HUMANO:   45_000,  // 45 segundos
    TEMPO_BOT:      10_000,  // 10 segundos
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
        this.io                = io;
        this.timers            = new Map();
        this.tournamentManager = null;  // setado após criação via setTournamentManager()
    }

    setTournamentManager(tm) {
        this.tournamentManager = tm;
    }

    /** fn({ mesaId, uid, saldo, origemBonus, torneioId }) — chamado antes de remover o jogador. */
    setAoRemoverPorInatividade(fn) {
        this.aoRemoverPorInatividade = fn;
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
            // Avatar base64 pode ter centenas de KB — não trafega pelo socket.
            // O frontend já tem o avatar do jogador local; para oponentes usa emoji.
            const avatar = jogador.avatar?.startsWith('data:') ? '' : (jogador.avatar || '');

            jogadoresFiltrados[uid] = {
                ...jogador,
                avatar,
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
        // Nunca confiar em smallBlind vindo do cliente sem validar sinal/tipo —
        // um valor negativo faria _aplicarBlind() creditar fichas em vez de
        // debitar (mesmo exploit de "imprimir" ₿C do buyIn, ver CLAUDE.md).
        const smallBlindBruto = Number(config.smallBlind);
        const smallBlind = Number.isFinite(smallBlindBruto) && smallBlindBruto > 0
            ? Math.floor(smallBlindBruto)
            : 10;
        const bb = smallBlind * 2;

        const mesa = {
            id:                   mesaId,
            nome:                 config.nome || `Mesa de ${usuario.nome}`,
            host:                 usuario.uid,
            fase:                 'AGUARDANDO',
            pote:                 0,
            maiorAposta:          0,
            ultimoRaiseVal:       bb,
            bigBlind:             bb,
            smallBlind:           smallBlind,
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
            senha:                config.senha ? String(config.senha) : null,
            contribuicoesEncerradas: [],
            jogadores: {
                [usuario.uid]: this._criarJogador(usuario, config.buyIn || 1000, 'humano'),
            },
        };

        mesas.set(mesaId, mesa);
        this.io.emit('mesas_atualizadas');
        return { sucesso: true, mesaId };
    }

    entrarMesa(mesaId, usuario, socket, senhaInformada) {
        const mesa = mesas.get(mesaId);
        if (!mesa)                                         return { sucesso: false, erro: 'Mesa não encontrada.' };
        if (Object.keys(mesa.jogadores).length >= 9)       return { sucesso: false, erro: 'Mesa cheia.' };
        if (mesa.jogadores[usuario.uid]) {
            // Jogador já está na mesa (reconexão ou torneio) — garante que o socket
            // entre na sala para receber broadcasts de estado_mesa
            socket.join(mesaId);
            return { sucesso: true, mesaId };
        }

        // Mesa privada: exige a senha certa pra quem ainda não está sentado.
        // Antes disso não era checado no servidor — a senha só aparecia na
        // tela, mas qualquer um conseguia entrar sem ela.
        if (mesa.senha && mesa.senha !== String(senhaInformada || '')) {
            return { sucesso: false, erro: 'Senha incorreta.' };
        }

        mesa.ordem.push(usuario.uid);
        mesa.jogadores[usuario.uid] = this._criarJogador(usuario, mesa.valorBuyIn, 'humano');

        socket.join(mesaId);
        socket.data.uid = usuario.uid;

        this.emitirEstado(mesaId);
        this.io.emit('mesas_atualizadas');
        return { sucesso: true, mesaId };
    }

    sairMesa(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.jogadores[uid]) return;

        const jogador   = mesa.jogadores[uid];
        const maoAtiva  = jogador.cartas?.length > 0
                        && mesa.fase !== 'AGUARDANDO'
                        && mesa.fase !== 'SHOWDOWN';
        const eraSuaVez = mesa.turno === uid;

        // Saída no meio de uma mão em andamento: trata como desistência.
        // IMPORTANTE: tudo que depende da posição do jogador na ordem (quem
        // ganha por W.O., quem age em seguida) precisa ser resolvido AQUI,
        // ANTES de remover o jogador de mesa.ordem/mesa.jogadores — depois
        // de removido, _encontrarProximo perde a referência do assento
        // esvaziado e reiniciava a busca (errado) do início da lista,
        // podendo pular jogadores que ainda precisavam agir na rodada.
        let proximoUid          = null;
        let vencedorPorAbandono = null;

        // O dinheiro que ele já apostou nesta mão continua contando pro
        // pote (side pots) — só a elegibilidade de ganhar se perde, igual
        // um fold comum. Vale também para quem JÁ tinha dado fold antes de
        // sair (sem cartas, maoAtiva falso): sem isso a aposta dele sumia
        // das faixas do side pot e a diferença caía inteira no último pote.
        const maoEmAndamento = mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN';
        if (maoEmAndamento && jogador.apostaTotal > 0) {
            mesa.contribuicoesEncerradas = mesa.contribuicoesEncerradas || [];
            mesa.contribuicoesEncerradas.push({ apostaTotal: jogador.apostaTotal });
        }

        if (maoAtiva) {
            jogador.status = 'fold';
            jogador.cartas = [];

            const aindaAtivos = mesa.ordem.filter(id => {
                if (id === uid) return false;
                const j = mesa.jogadores[id];
                return j && j.cartas?.length > 0 && j.status !== 'fold' && j.status !== 'sitout';
            });

            if (aindaAtivos.length === 1) {
                vencedorPorAbandono = aindaAtivos[0];
            } else {
                // IMPORTANTE: calcula proximoUid usando a referência de
                // "volta completa" (mesa.primeiroJogador) ORIGINAL, ainda
                // intacta — antes de qualquer reatribuição abaixo. Trocar
                // primeiroJogador antes dessa chamada faria _encontrarProximo
                // comparar contra o valor NOVO, o que (quando o novo valor
                // coincide com o próprio proximoUid) faz ele bater a
                // condição "voltou ao agressor" na primeira volta e devolver
                // null, avançando a fase sem ninguém ter agido de verdade.
                if (eraSuaVez) {
                    // mesa.turno ainda é `uid` aqui, e ele ainda está em
                    // mesa.ordem (com status 'fold') — _encontrarProximo acha
                    // a posição certa e pula o assento dele naturalmente.
                    proximoUid = this._encontrarProximo(mesaId);
                }

                // Se quem saiu era a referência de "volta completa" da rodada
                // de apostas, ela precisa ser reatribuída ANTES de remover
                // ele de mesa.ordem — senão esse uid nunca mais é encontrado
                // por _encontrarProximo (sumiu da ordem), a comparação
                // "uid === aggressor" nunca mais bate, e a rodada de apostas
                // trava num loop de check infinito (nunca fecha sozinha).
                if (mesa.primeiroJogador === uid) {
                    mesa.primeiroJogador = eraSuaVez
                        ? proximoUid
                        : this._proximoAtivoNaOrdemApos(mesa, uid);
                }
            }
        }

        mesa.ordem = mesa.ordem.filter(id => id !== uid);
        delete mesa.jogadores[uid];

        const humanos = Object.values(mesa.jogadores).filter(j => j.tipo === 'humano');
        if (humanos.length === 0) {
            this._limparTimers(mesaId);
            mesas.delete(mesaId);
            this.io.emit('mesas_atualizadas');
            return;
        }

        if (mesa.host === uid) mesa.host = humanos[0].uid;

        if (vencedorPorAbandono) {
            this._limparTimers(mesaId);
            this._finalizarMao(mesaId, vencedorPorAbandono, true);
            return;
        }

        if (maoAtiva && eraSuaVez) {
            this._limparTimers(mesaId);
            if (proximoUid) {
                mesa.turno = proximoUid;
                this._gerenciarTurno(mesaId);
                this.emitirEstado(mesaId);
            } else {
                this._avancarFase(mesaId);
            }
            this.io.emit('mesas_atualizadas');
            return;
        }

        this.emitirEstado(mesaId);
        this.io.emit('mesas_atualizadas');
    }

    /**
     * Próximo jogador ainda ativo na mão (não fold/sitout), caminhando a
     * partir do assento de `uidReferencia` em mesa.ordem (assento que ainda
     * existe nesse momento — chamar ANTES de remover o jogador da ordem).
     * Usado pra reatribuir mesa.primeiroJogador quando quem sai da mesa era
     * a própria referência de "volta completa" da rodada de apostas.
     */
    _proximoAtivoNaOrdemApos(mesa, uidReferencia) {
        const ordem = mesa.ordem;
        const total = ordem.length;
        let   idx   = ordem.indexOf(uidReferencia);
        if (idx === -1) idx = 0;

        for (let i = 0; i < total; i++) {
            idx = (idx + 1) % total;
            const candidato = ordem[idx];
            if (candidato === uidReferencia) continue;
            const j = mesa.jogadores[candidato];
            if (j && j.cartas?.length > 0 && j.status !== 'fold' && j.status !== 'sitout') {
                return candidato;
            }
        }
        return null;
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
        // Sem isso, o contador de vagas no lobby dos outros clientes
        // (aba Mesas) ficava desatualizado até algum outro evento disparar
        // — alguém podia tentar entrar numa mesa que só "parecia" ter vaga.
        this.io.emit('mesas_atualizadas');
    }

    _criarJogador(usuario, buyIn, tipo) {
        return {
            uid:            usuario.uid,
            nome:           usuario.nome,
            avatar:         usuario.avatar || '',
            tema:           usuario.tema || 'classico',
            saldo:          buyIn,
            cartas:         [],
            status:         'ativo',
            apostaRodada:   0,
            apostaTotal:    0,   // acumulado durante TODA a mão (para side pots)
            faltasSeguidas: 0,
            tipo,
            // Quanto do saldo atual na mesa veio de saldo BÔNUS (não sacável).
            // Rastreado pra creditarSaidaMesa nunca devolver mais bônus do que
            // realmente entrou nessa pilha de fichas — sem isso, sentar numa
            // mesa e sair de novo "lavava" bônus em saldo real sacável.
            origemBonus:    usuario.origemBonus || 0,
        };
    }


    // ================================================================
    // INÍCIO DE RODADA
    // ================================================================

    iniciarRodada(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Nunca recomeça por cima de uma mão em andamento: isso zerava
        // apostaTotal/pote e cobrava blinds de novo — as fichas já no pote
        // simplesmente sumiam. O evento 'iniciar_rodada' do host não checa
        // a fase, e um reinício agendado em duplicidade cairia aqui também.
        if (['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'].includes(mesa.fase)) return;

        // Só interessa avisar o lobby quando a mesa estava "Aguardando"
        // (visível na lista pública) e está prestes a começar a jogar —
        // evita ficar avisando à toa a cada nova mão de um jogo já em curso.
        const eraAguardando = mesa.fase === 'AGUARDANDO';

        // Bots zerados de saldo recebem rebuy automático ANTES de calcular
        // quem está ativo nesta mão — se isso rodasse depois (como antes),
        // o bot recompunha o saldo mas ficava de fora justo da mão em que
        // devia voltar a jogar, só entrando de fato na mão seguinte.
        Object.values(mesa.jogadores).forEach(j => {
            if (j.tipo === 'cpu' && j.saldo <= 0) {
                j.saldo        = mesa.valorBuyIn;
                j.status       = 'ativo';
                j.apostaTotal  = 0;
            }
        });

        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.saldo > 0;
        });

        // Quem ficou sem saldo fica de fora da mão — sem isso, o status
        // ficava preso em 'all-in' da mão anterior pra sempre, mesmo já
        // não tendo mão nenhuma em andamento (parecia que ele ainda
        // estava esperando resultado de mão, mesmo entre rodadas).
        mesa.ordem.forEach(uid => {
            const j = mesa.jogadores[uid];
            if (j && j.saldo <= 0 && j.status !== 'sitout') {
                j.status = 'sitout';
                j.cartas = [];
            }
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

        // Dinheiro de quem saiu da mesa no meio da mão anterior (contado no
        // pote, mas sem dono elegível) — não deve vazar para esta mão nova.
        mesa.contribuicoesEncerradas = [];

        // Avança o dealer (respeita o assento físico do dealer anterior —
        // mesa.ordem, não a lista já filtrada de quem tem fichas agora —
        // pra passar o botão pro próximo jogador ativo de verdade mesmo
        // quando o antigo dealer zerou o saldo ou saiu da mesa. Antes,
        // indexOf(mesa.dealer) em `ativos` dava -1 nesses casos e o botão
        // simplesmente voltava pro início da lista, o que não é justo.
        mesa.dealer = this._proximoDealer(mesa, ativos);
        const idxNovoDealer = ativos.indexOf(mesa.dealer);

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

        // Blind que deixou o jogador all-in (ex.: heads-up com SB curto):
        // quem sobra não tem contra quem apostar — a mão corre direto, sem
        // dar a vez (e o relógio) a um jogador all-in.
        if (this._ninguemMaisPrecisaAgir(mesa)) {
            mesa.turno = null;
            this.emitirEstado(mesaId);
            this._agendarRunout(mesaId);
            if (eraAguardando) this.io.emit('mesas_atualizadas');
            return;
        }

        // _gerenciarTurno primeiro: ele grava mesa.turnoExpiraEm (prazo real
        // do relógio) antes do estado ser transmitido, senão o primeiro
        // estado_mesa da mão sairia sem o prazo atualizado.
        this._gerenciarTurno(mesaId);
        this.emitirEstado(mesaId);
        if (eraAguardando) this.io.emit('mesas_atualizadas');
    }

    /**
     * Acha o próximo dealer a partir do assento físico do dealer anterior
     * (mesa.ordem, que preserva a posição de todo mundo, mesmo quem está
     * sem saldo nesta mão), pulando pra frente até achar alguém que está
     * em `ativos`. Primeira mão (mesa.dealer === null) → primeiro ativo.
     */
    _proximoDealer(mesa, ativos) {
        if (!ativos.length) return null;
        if (mesa.dealer === null) return ativos[0];

        const ordem = mesa.ordem;
        const total = ordem.length;
        let   idx   = ordem.indexOf(mesa.dealer);   // -1 se saiu de vez da mesa

        for (let i = 0; i < total; i++) {
            idx = (idx + 1) % total;
            const candidato = ordem[idx];
            if (ativos.includes(candidato)) return candidato;
        }
        return ativos[0];
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

        // Prazo absoluto (não uma duração) salvo no próprio estado da mesa —
        // o frontend usa isso pra contar o relógio a partir do deadline real
        // do servidor, não de uma contagem local própria. Sem isso, um
        // refresh de página ou latência no recebimento do evento de socket
        // fazia o timer visual reiniciar do zero, dessincronizado do timeout
        // real do servidor (podia até dar fold automático com o anel ainda
        // mostrando vários segundos restantes).
        mesa.turnoExpiraEm = Date.now() + tempo;

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
            // Quem devolve as fichas ao saldo real é o servidor
            // (processarSaidaMesa só roda em sair_mesa/disconnect). Sem
            // avisar, o jogador removido aqui perdia o stack inteiro: ele
            // some de mesa.jogadores e um "Sair" depois credita 0.
            this.aoRemoverPorInatividade?.({
                mesaId,
                uid,
                saldo:       jogador.saldo,
                origemBonus: jogador.origemBonus || 0,
                torneioId:   mesa.torneioId || null,
            });
            // sairMesa já trata a saída no meio de uma mão como desistência
            // (fold) e resolve corretamente quem age em seguida — setar
            // status/cartas aqui antes ANTES de chamar sairMesa fazia
            // maoAtiva dar falso lá dentro (cartas já vazias), pulando essa
            // resolução e deixando o turno preso num uid que acabou de sair.
            this.sairMesa(mesaId, uid);
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

            // Estritamente maior: apostar o stack inteiro (é o que o botão
            // All-in manda: RAISE saldo + apostaRodada) é ALL-IN, não raise
            // comum. Com >=, o jogador ficava com saldo 0 mas status 'ativo'
            // — recebia a vez e o relógio nas ruas seguintes (podia "dar
            // all-in de novo", e levava fold automático por tempo, perdendo
            // o pote) — e um all-in curto reabria a ação e encolhia o raise
            // mínimo. O ramo abaixo já trata completo × incompleto.
            if (jogador.saldo > aumentoReal) {
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
            this._gerenciarTurno(mesaId);
            this.emitirEstado(mesaId);
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

            // Sem aposta na mesa: a volta fecha ao passar pelo ASSENTO de
            // quem abriu a rodada, mesmo que ele tenha dado fold (ou esteja
            // all-in) — antes essa checagem vinha depois do "pula fold", e
            // um fold de quem abriu a rodada (com check disponível) deixava
            // a rodada de checks girando para sempre.
            if (targetAp === 0 && uid === aggressor) return null;  // volta completa

            if (!j) continue;
            if (!j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            const ap = j.apostaRodada || 0;

            // Sem aposta na mesa → todos checam, aguarda primeira volta
            if (targetAp === 0) return uid;

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

        // Com no máximo um jogador ainda capaz de apostar, não há rodada de
        // apostas: ele não tem contra quem apostar. Antes ele recebia a vez
        // (e o relógio, e faltas por tempo) em cada rua até o showdown.
        const primeiro = this._ninguemMaisPrecisaAgir(mesa)
            ? null
            : this._encontrarPrimeiroParaAgir(mesaId);

        if (!primeiro) {
            // Todos all-in → avança automaticamente. Ninguém tem a vez: sem
            // zerar o turno, ele ficava com quem agiu por último (já all-in)
            // — o relógio aparecia "preso" nele e uma ação dele passava na
            // checagem de vez, avançando uma rua extra fora do runout.
            mesa.turno = null;
            this.emitirEstado(mesaId);
            this._agendarRunout(mesaId);
            return;
        }

        mesa.turno           = primeiro;
        mesa.primeiroJogador = primeiro;

        this._gerenciarTurno(mesaId);
        this.emitirEstado(mesaId);
    }

    /**
     * true quando nenhuma decisão de aposta resta: no máximo um jogador
     * ainda pode apostar (tem cartas, não deu fold, não está all-in) e ele
     * já cobre a maior aposta da rodada.
     */
    _ninguemMaisPrecisaAgir(mesa) {
        const podemAgir = mesa.ordem
            .map(uid => mesa.jogadores[uid])
            .filter(j => j && j.cartas?.length > 0
                && j.status !== 'fold' && j.status !== 'sitout' && j.status !== 'all-in');
        if (podemAgir.length === 0) return true;
        if (podemAgir.length > 1)   return false;
        return (podemAgir[0].apostaRodada || 0) >= (mesa.maiorAposta || 0);
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

        const potTotal = mesa.pote;  // salva antes de zerar

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';

        // Resultado estruturado — usado pelo frontend para exibição profissional
        mesa.resultadoMao = {
            tipo:      'showdown',
            vencedores: Object.keys(premiados).map(uid => ({
                uid,
                nome:  mesa.jogadores[uid].nome,
                mao:   descricoesMao[uid] || 'Carta Alta',
                premio: premiados[uid],
            })),
            potTotal,
        };

        const resumo = mesa.resultadoMao.vencedores
            .map(v => `${v.nome} — ${v.mao}`)
            .join(' | ');
        mesa.mensagemVitoria      = resumo;
        mesa.ultimaAcaoDescritiva = `Fim da mão. ${resumo}`;

        this.emitirEstado(mesaId);

        // Em modo torneio, verifica se restou apenas 1 jogador com fichas
        if (mesa.torneioId && this.tournamentManager) {
            const comFichas = Object.entries(mesa.jogadores)
                .filter(([, j]) => j.saldo > 0)
                .map(([uid]) => uid);
            if (comFichas.length === 1) {
                this.tournamentManager.notificarVencedorMesa(mesa.torneioId, mesaId, comFichas[0]);
            } else {
                this._agendarProximaRodada(mesaId);
            }
        } else {
            this._agendarProximaRodada(mesaId);
        }

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

        // IMPORTANTE: o valor de cada pote soma a contribuição de TODOS os
        // jogadores que apostaram nesta mão — inclusive quem já desistiu
        // (fold). O dinheiro de quem desistiu continua fisicamente no pote;
        // só a ELEGIBILIDADE pra ganhar é restrita a quem não desistiu.
        // Usar só elegiveisUids aqui fazia o pote sair menor que o real,
        // "perdendo" fichas de quem tinha dado fold.
        const todosUids = Object.keys(mesa.jogadores);

        // Jogadores que SAÍRAM da mesa no meio desta mão (não só deram fold,
        // saíram de vez) não aparecem mais em mesa.jogadores — a contribuição
        // deles ficou guardada aqui pra não sumir do side pot certo (ver
        // sairMesa). Nunca são elegíveis, só engordam o pote na faixa certa.
        const fantasmas = mesa.contribuicoesEncerradas || [];

        for (const cap of caps) {
            let valorDoPote = todosUids.reduce((soma, uid) => {
                const total = mesa.jogadores[uid].apostaTotal || 0;
                return soma + Math.min(Math.max(total - capAnter, 0), cap - capAnter);
            }, 0);
            valorDoPote += fantasmas.reduce((soma, f) => {
                const total = f.apostaTotal || 0;
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

        mesa.resultadoMao = {
            tipo:      porWO ? 'wo' : 'direto',
            vencedores: [{
                uid:    vencedorUid,
                nome:   j.nome,
                mao:    porWO ? null : 'Melhor mão',
                premio: potGanho,
            }],
            potTotal: potGanho,
        };

        mesa.mensagemVitoria      = porWO
            ? `${j.nome} — todos desistiram`
            : `${j.nome} venceu`;
        mesa.ultimaAcaoDescritiva = porWO
            ? `${j.nome} levou ₿C ${potGanho} — todos desistiram.`
            : `${j.nome} venceu ₿C ${potGanho}.`;

        this.emitirEstado(mesaId);

        // Notifica torneio se aplicável — só quando restar de fato 1 único
        // jogador COM FICHAS na mesa (igual _calcularVencedor faz no showdown).
        // Sem essa checagem, a mesa de torneio era encerrada na primeira mão
        // em que todos exceto um desistissem (o caso mais comum no poker),
        // mesmo que os "eliminados" ainda estivessem com a pilha cheia.
        if (mesa.torneioId && this.tournamentManager) {
            const comFichas = Object.entries(mesa.jogadores)
                .filter(([, j]) => j.saldo > 0)
                .map(([uid]) => uid);
            if (comFichas.length === 1) {
                this.tournamentManager.notificarVencedorMesa(mesa.torneioId, mesaId, comFichas[0]);
            } else {
                this._agendarProximaRodada(mesaId);
            }
        } else {
            this._agendarProximaRodada(mesaId);
        }

        salvarResultadoRodada([{
            uid:            vencedorUid,
            nome:           j.nome,
            avatar:         j.avatar || '',
            fichasGanhas:   potGanho,
            fichasPerdidas: 0,
            venceu:         true,
        }]);
    }

    /**
     * Agenda a próxima rua do runout (ninguém mais pode apostar). O timer
     * fica registrado em this.timers para _limparTimers cancelá-lo — antes
     * era um setTimeout solto: se a mão acabasse no meio (ex.: W.O. porque
     * um all-in saiu da mesa), ele ainda disparava _avancarFase, refazia o
     * showdown por cima do resultado e agendava um segundo reinício.
     */
    _agendarRunout(mesaId) {
        const t = this.timers.get(mesaId) || {};
        t.acao  = setTimeout(() => this._avancarFase(mesaId), 1_500);
        this.timers.set(mesaId, t);
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

    fazerRebuy(mesaId, uid, valor, origemBonus = 0) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };

        const jogador = mesa.jogadores[uid];
        if (!jogador) return { sucesso: false, erro: 'Jogador não encontrado.' };

        // Rebuy sempre no mesmo valor do buy-in original da mesa — evita
        // stacks fora do combinado na mesa (regra documentada do projeto).
        if (valor !== mesa.valorBuyIn) {
            return { sucesso: false, erro: `Rebuy precisa ser exatamente ₿C ${mesa.valorBuyIn}.` };
        }

        const maoAtiva = jogador.cartas && jogador.cartas.length > 0
                      && mesa.fase !== 'SHOWDOWN'
                      && mesa.fase !== 'AGUARDANDO';

        if (maoAtiva) {
            return { sucesso: false, erro: 'Não pode fazer rebuy durante uma mão ativa.' };
        }

        jogador.saldo      += valor;
        jogador.origemBonus = (jogador.origemBonus || 0) + (origemBonus || 0);
        if (jogador.status === 'eliminado') jogador.status = 'ativo';

        this.emitirEstado(mesaId);
        return { sucesso: true };
    }


    // ================================================================
    // MESA DE TORNEIO
    // ================================================================

    /**
     * Cria uma mesa pré-populada com jogadores em modo torneio.
     * O buy-in já foi debitado pelo TournamentManager — não debita novamente.
     * @param {object} config   – nome, buyIn, smallBlind, torneioId
     * @param {Array}  jogadores – array de { uid, nome, avatar }
     * @param {string} torneioId
     * @param {string} mesaId   – ID fixo gerado pelo TournamentManager
     */
    criarMesaTorneio(config, jogadores, torneioId, mesaId) {
        const bb = (config.smallBlind || 10) * 2;

        const mesa = {
            id:                   mesaId,
            nome:                 config.nome || 'Mesa Torneio',
            host:                 jogadores[0]?.uid || 'torneio',
            fase:                 'AGUARDANDO',
            pote:                 0,
            maiorAposta:          0,
            ultimoRaiseVal:       bb,
            bigBlind:             bb,
            smallBlind:           config.smallBlind || 10,
            valorBuyIn:           config.buyIn      || 500,
            dealer:               null,
            sbId:                 null,
            bbId:                 null,
            primeiroJogador:      null,
            turno:                null,
            baralho:              [],
            cartasComunitarias:   [],
            mensagemVitoria:      null,
            ultimaAcaoDescritiva: 'Mesa de torneio criada.',
            ordem:                jogadores.map(j => j.uid),
            jogadores:            {},
            torneioId,              // ← liga ao torneio
            senha:                null,
            contribuicoesEncerradas: [],
        };

        jogadores.forEach(j => {
            mesa.jogadores[j.uid] = this._criarJogador(j, config.buyIn || 500, 'humano');
        });

        mesas.set(mesaId, mesa);

        // Inicia a rodada automaticamente após 2s
        setTimeout(() => this.iniciarRodada(mesaId), 2000);

        console.log(`🃏 Mesa de torneio ${mesaId} criada (torneio ${torneioId})`);
        return { sucesso: true, mesaId };
    }


    // ================================================================
    // ACESSO AO ESTADO
    // ================================================================

    getMesa(mesaId)    { return mesas.get(mesaId); }
    getMesasAtivas()   { return Array.from(mesas.values()); }
    mesaExiste(mesaId) { return mesas.has(mesaId); }
}
