/* ================================================================
   ARQUIVO: backend/tournament-manager.js

   Gerencia torneios de poker (Campeonato).

   Estrutura de um torneio:
   {
     id, nome, host, status, buyIn, fichasIniciais,
     maxJogadores, jogadoresPorMesa,
     maxRebuys, rebuyPeriod (min), iniciadoEm,
     jogadores: { uid: { nome, avatar, status, rebuys, mesaAtual } },
     ordem: [uid],
     rodadas: [{ mesas: [{ mesaId, jogadores:[uid], vencedor:uid|null }] }],
     rodadaAtual: 0, campeao: null, premioTotal: 0,
     aguardandoRebuys: false, rebuyTimer: null,
   }

   PRÊMIO: premioTotal soma o buyIn de cada entrada (criação + cada
   entrar_torneio + cada rebuy pago) — nunca o preço enviado pelo
   cliente, sempre torneio.buyIn (fonte única de verdade). Ao finalizar
   com um único apto, o valor inteiro é creditado ao campeão via
   creditarSaidaMesa (winner-take-all).
================================================================ */

import { creditarSaidaMesa, buscarSaldo } from './firebase-admin.js';

export class TournamentManager {

    constructor(io, gameManager) {
        this.io          = io;
        this.gameManager = gameManager;
        this.torneios    = new Map();
    }


    // ================================================================
    // CRIAR TORNEIO
    // ================================================================

    criarTorneio(config, host) {
        const torneioId      = 'T' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const buyIn          = config.buyIn           || 500;
        const fichasIniciais = config.fichasIniciais  || buyIn * 20;

        const torneio = {
            id:               torneioId,
            nome:             config.nome || `Torneio de ${host.nome}`,
            host:             host.uid,
            status:           'aberto',
            buyIn,
            fichasIniciais:   Math.max(1000, fichasIniciais),
            maxRebuys:        Math.min(5, Math.max(0, config.maxRebuys     || 1)),
            rebuyPeriod:      Math.min(180, Math.max(0, config.rebuyPeriod || 30)),
            maxJogadores:     Math.min(64, Math.max(4,  config.maxJogadores     || 16)),
            jogadoresPorMesa: Math.min(9,  Math.max(2,  config.jogadoresPorMesa || 6)),
            jogadores:        {},
            ordem:            [],
            rodadas:          [],
            rodadaAtual:      0,
            campeao:          null,
            premioTotal:      buyIn,
            iniciadoEm:       null,
            aguardandoRebuys: false,
            rebuyTimer:       null,
        };

        torneio.jogadores[host.uid] = this._criarJogadorTorneio(host);
        torneio.ordem.push(host.uid);

        this.torneios.set(torneioId, torneio);
        console.log(`🏆 Torneio ${torneioId} criado por ${host.nome}`);
        return { sucesso: true, torneioId };
    }

    _criarJogadorTorneio(usuario) {
        return {
            uid:      usuario.uid,
            nome:     usuario.nome,
            avatar:   usuario.avatar || '',
            status:   'aguardando',
            rebuys:   0,
            mesaAtual: null,
        };
    }


    // ================================================================
    // ENTRAR NO TORNEIO
    // ================================================================

    entrarTorneio(torneioId, usuario) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio)
            return { sucesso: false, erro: 'Torneio não encontrado.' };
        if (torneio.status !== 'aberto')
            return { sucesso: false, erro: 'Torneio já iniciado.' };
        if (torneio.jogadores[usuario.uid])
            return { sucesso: true, torneioId };
        if (Object.keys(torneio.jogadores).length >= torneio.maxJogadores)
            return { sucesso: false, erro: 'Torneio lotado.' };

        torneio.jogadores[usuario.uid] = this._criarJogadorTorneio(usuario);
        torneio.ordem.push(usuario.uid);
        torneio.premioTotal += torneio.buyIn;

        this.emitirEstadoTorneio(torneioId);
        return { sucesso: true, torneioId };
    }


    // ================================================================
    // INICIAR TORNEIO
    // ================================================================

    iniciarTorneio(torneioId, hostUid) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio)
            return { sucesso: false, erro: 'Torneio não encontrado.' };
        if (torneio.host !== hostUid)
            return { sucesso: false, erro: 'Somente o host pode iniciar.' };
        if (torneio.status !== 'aberto')
            return { sucesso: false, erro: 'Torneio já iniciado.' };

        const uids = Object.keys(torneio.jogadores);
        if (uids.length < 2)
            return { sucesso: false, erro: 'Mínimo 2 jogadores para iniciar.' };

        torneio.status      = 'em_andamento';
        torneio.rodadaAtual = 0;
        torneio.iniciadoEm  = Date.now();

        const ordemEmbaralhada = [...torneio.ordem].sort(() => Math.random() - 0.5);
        torneio.ordem = ordemEmbaralhada;

        this._criarRodada(torneioId, ordemEmbaralhada);
        this.emitirEstadoTorneio(torneioId);

        console.log(`▶️  Torneio ${torneioId} iniciado com ${uids.length} jogadores`);
        return { sucesso: true };
    }


    // ================================================================
    // CRIAR RODADA
    // ================================================================

    _criarRodada(torneioId, jogadoresUids) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return;

        const n      = torneio.jogadoresPorMesa;
        const grupos = [];
        for (let i = 0; i < jogadoresUids.length; i += n) {
            grupos.push(jogadoresUids.slice(i, i + n));
        }

        const rodada = { mesas: [] };

        grupos.forEach((grupo, idx) => {
            const mesaId = `${torneioId}_R${torneio.rodadaAtual}_M${idx}`;

            grupo.forEach(uid => {
                const j = torneio.jogadores[uid];
                if (j) {
                    j.status    = 'jogando';
                    j.mesaAtual = mesaId;
                }
            });

            rodada.mesas.push({ mesaId, jogadores: grupo, vencedor: null });

            const jogadoresObjeto = grupo.map(uid => torneio.jogadores[uid]).filter(Boolean);
            const sb = Math.max(5, Math.round(torneio.fichasIniciais * 0.005));

            this.gameManager.criarMesaTorneio(
                {
                    nome:       `${torneio.nome} — Rodada ${torneio.rodadaAtual + 1} Mesa ${idx + 1}`,
                    buyIn:      torneio.fichasIniciais,   // chip stack dos jogadores
                    smallBlind: sb,
                    torneioId,
                },
                jogadoresObjeto,
                torneioId,
                mesaId,
            );
        });

        torneio.rodadas.push(rodada);
    }


    // ================================================================
    // NOTIFICAR VENCEDOR DE MESA (chamado pelo GameManager)
    // ================================================================

    notificarVencedorMesa(torneioId, mesaId, vencedorUid) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio || torneio.status !== 'em_andamento') return;

        const rodada   = torneio.rodadas[torneio.rodadaAtual];
        if (!rodada) return;

        const mesaInfo = rodada.mesas.find(m => m.mesaId === mesaId);
        if (!mesaInfo || mesaInfo.vencedor) return;

        mesaInfo.vencedor = vencedorUid;

        // Marca vencedor; verifica rebuy para os eliminados
        const rebuyElegiveis = [];
        mesaInfo.jogadores.forEach(uid => {
            const j = torneio.jogadores[uid];
            if (!j) return;
            if (uid === vencedorUid) {
                j.status = 'vencedor';
            } else {
                if (this._rebuyElegivel(torneio, uid)) {
                    j.status = 'rebuy_disponivel';
                    rebuyElegiveis.push(uid);
                } else {
                    j.status = 'eliminado';
                }
            }
        });

        // Emite oportunidade de rebuy para os elegíveis
        if (rebuyElegiveis.length > 0) {
            const minRestantes = Math.max(0, torneio.rebuyPeriod - this._minutosTorneio(torneio));
            this.io.to(`torneio:${torneioId}`).emit('torneio:rebuy_disponivel', {
                torneioId,
                elegiveisUids:   rebuyElegiveis,
                custo:           torneio.buyIn,
                fichasGanhas:    torneio.fichasIniciais,
                periodoRestante: Math.round(minRestantes),
            });
        }

        this._verificarRodadaCompleta(torneioId);
    }


    // ================================================================
    // VERIFICAR SE A RODADA TERMINOU
    // ================================================================

    _verificarRodadaCompleta(torneioId) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return;

        const rodada = torneio.rodadas[torneio.rodadaAtual];
        if (!rodada) return;

        const todasTerminadas = rodada.mesas.every(m => m.vencedor !== null);
        if (!todasTerminadas) {
            this.emitirEstadoTorneio(torneioId);
            return;
        }

        const rebuyPendente = Object.values(torneio.jogadores)
            .some(j => j.status === 'rebuy_disponivel');

        if (rebuyPendente && !torneio.aguardandoRebuys) {
            // Abre janela de 60 segundos para rebuy
            torneio.aguardandoRebuys = true;

            if (torneio.rebuyTimer) clearTimeout(torneio.rebuyTimer);
            torneio.rebuyTimer = setTimeout(() => {
                Object.values(torneio.jogadores).forEach(j => {
                    if (j.status === 'rebuy_disponivel') j.status = 'eliminado';
                });
                torneio.aguardandoRebuys = false;
                torneio.rebuyTimer       = null;
                this._avancarRodada(torneioId);
            }, 60_000);

            this.emitirEstadoTorneio(torneioId);
            return;
        }

        if (!rebuyPendente) {
            this._avancarRodada(torneioId);
        }
    }


    // ================================================================
    // AVANÇAR RODADA
    // ================================================================

    async _avancarRodada(torneioId) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return;

        torneio.aguardandoRebuys = false;

        // Aptos = vencedores da rodada + quem pagou rebuy
        const aptos = Object.values(torneio.jogadores)
            .filter(j => j.status === 'vencedor' || j.status === 'rebuy_pago')
            .map(j => j.uid);

        if (aptos.length <= 1) {
            const campeaoUid = aptos[0]
                || Object.values(torneio.jogadores).find(j => j.status === 'vencedor')?.uid;

            torneio.campeao = campeaoUid || null;
            torneio.status  = 'finalizado';
            if (campeaoUid && torneio.jogadores[campeaoUid]) {
                torneio.jogadores[campeaoUid].status = 'vencedor';
            }

            // Winner-take-all: o campeão leva o prêmio inteiro (soma de
            // todas as entradas + rebuys) creditado direto no saldo real.
            if (campeaoUid && torneio.premioTotal > 0) {
                await creditarSaidaMesa(campeaoUid, torneio.premioTotal);
                this.io.to(`torneio:${torneioId}`).emit('torneio:premio_creditado', {
                    torneioId,
                    campeaoUid,
                    premio: torneio.premioTotal,
                });
                await this._notificarSaldoJogador(campeaoUid);
            }

            console.log(`🏆 Torneio ${torneioId} finalizado! Campeão: ${torneio.jogadores[campeaoUid]?.nome} — prêmio ₿C ${torneio.premioTotal}`);
            this.emitirEstadoTorneio(torneioId);
            return;
        }

        aptos.forEach(uid => {
            if (torneio.jogadores[uid]) torneio.jogadores[uid].status = 'aguardando';
        });

        torneio.rodadaAtual++;
        const proximos = [...aptos].sort(() => Math.random() - 0.5);

        console.log(`🔄 Torneio ${torneioId}: rodada ${torneio.rodadaAtual + 1} com ${proximos.length} jogadores`);
        this._criarRodada(torneioId, proximos);
        this.emitirEstadoTorneio(torneioId);
    }


    // ================================================================
    // REBUY — VERIFICAÇÃO E PROCESSAMENTO
    // ================================================================

    _rebuyElegivel(torneio, uid) {
        if (!torneio || !uid) return false;
        if (torneio.maxRebuys === 0) return false;

        const j = torneio.jogadores[uid];
        if (!j) return false;
        if (j.rebuys >= torneio.maxRebuys) return false;

        const minDecorridos = this._minutosTorneio(torneio);
        return minDecorridos < torneio.rebuyPeriod;
    }

    checarRebuy(torneioId, uid) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return { sucesso: false, erro: 'Torneio não encontrado.' };

        const j = torneio.jogadores[uid];
        if (!j) return { sucesso: false, erro: 'Você não está neste torneio.' };

        if (j.status !== 'rebuy_disponivel' && j.status !== 'eliminado') {
            return { sucesso: false, erro: 'Rebuy não disponível agora.' };
        }

        if (!this._rebuyElegivel(torneio, uid)) {
            return j.rebuys >= torneio.maxRebuys
                ? { sucesso: false, erro: `Limite de ${torneio.maxRebuys} rebuy(s) atingido.` }
                : { sucesso: false, erro: 'Período de rebuy encerrado.' };
        }

        return { sucesso: true };
    }

    processarRebuy(torneioId, uid) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return { sucesso: false, erro: 'Torneio não encontrado.' };

        const j = torneio.jogadores[uid];
        if (!j) return { sucesso: false, erro: 'Jogador não encontrado.' };

        j.rebuys++;
        j.status = 'rebuy_pago';
        torneio.premioTotal += torneio.buyIn;

        // Verifica se ainda há pendências de rebuy
        const aindaPendente = Object.values(torneio.jogadores)
            .some(jj => jj.status === 'rebuy_disponivel');

        if (!aindaPendente && torneio.aguardandoRebuys) {
            if (torneio.rebuyTimer) clearTimeout(torneio.rebuyTimer);
            torneio.rebuyTimer       = null;
            torneio.aguardandoRebuys = false;
            this._avancarRodada(torneioId);
        } else {
            this.emitirEstadoTorneio(torneioId);
        }

        return { sucesso: true };
    }


    // ================================================================
    // EMITIR ESTADO
    // ================================================================

    emitirEstadoTorneio(torneioId) {
        const torneio = this.torneios.get(torneioId);
        if (!torneio) return;
        this.io.to(`torneio:${torneioId}`).emit('torneio:estado', this._buildEstado(torneio));
    }

    _buildEstado(torneio) {
        const rodada        = torneio.rodadas[torneio.rodadaAtual] || null;
        const minDecorridos = this._minutosTorneio(torneio);
        const rebuyAtivo    = torneio.iniciadoEm !== null
            && torneio.maxRebuys > 0
            && minDecorridos < torneio.rebuyPeriod;

        return {
            id:                torneio.id,
            nome:              torneio.nome,
            host:              torneio.host,
            status:            torneio.status,
            buyIn:             torneio.buyIn,
            fichasIniciais:    torneio.fichasIniciais,
            maxJogadores:      torneio.maxJogadores,
            jogadoresPorMesa:  torneio.jogadoresPorMesa,
            maxRebuys:         torneio.maxRebuys,
            rebuyPeriod:       torneio.rebuyPeriod,
            rebuyAtivo,
            rebuyMinRestantes: rebuyAtivo ? Math.round(torneio.rebuyPeriod - minDecorridos) : 0,
            aguardandoRebuys:  torneio.aguardandoRebuys,
            jogadores:         torneio.jogadores,
            rodadaAtual:       torneio.rodadaAtual,
            rodadaInfo:        rodada,
            campeao:           torneio.campeao,
            premioTotal:       torneio.premioTotal,
            totalJogadores:    Object.keys(torneio.jogadores).length,
        };
    }

    _minutosTorneio(torneio) {
        if (!torneio.iniciadoEm) return 0;
        return (Date.now() - torneio.iniciadoEm) / 60_000;
    }

    // Empurra o saldo atualizado pro(s) socket(s) já conectado(s) do jogador
    // (ex: campeão recebendo o prêmio) — sem isso a carteira só atualizaria
    // depois de um refresh.
    async _notificarSaldoJogador(uid) {
        try {
            const saldos = await buscarSaldo(uid);
            for (const [, s] of this.io.sockets.sockets) {
                if (s.data.uid === uid) {
                    s.emit('wallet:saldo_atualizado', {
                        saldo:      saldos.saldo      || 0,
                        saldoBonus: saldos.saldoBonus || 0,
                        sacadoHoje: saldos.sacadoHoje || 0,
                    });
                }
            }
        } catch (e) {
            console.error('_notificarSaldoJogador erro:', e.message);
        }
    }


    // ================================================================
    // ACESSO
    // ================================================================

    getTorneio(torneioId) { return this.torneios.get(torneioId); }

    listarTorneios() {
        return Array.from(this.torneios.values())
            .filter(t => t.status !== 'finalizado')
            .map(t => ({
                id:               t.id,
                nome:             t.nome,
                host:             t.host,
                status:           t.status,
                buyIn:            t.buyIn,
                fichasIniciais:   t.fichasIniciais,
                maxJogadores:     t.maxJogadores,
                jogadoresPorMesa: t.jogadoresPorMesa,
                maxRebuys:        t.maxRebuys,
                rebuyPeriod:      t.rebuyPeriod,
                totalJogadores:   Object.keys(t.jogadores).length,
            }));
    }
}
