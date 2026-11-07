/* ================================================================
   ARQUIVO: backend/servico-mesas.js

   Regras de dinheiro em volta das mesas (débito do buy-in ao sentar,
   crédito das fichas ao sair), tiradas dos handlers do server.js para
   poderem ser testadas sem Firebase: debitar/creditar/emitirSaldo são
   injetados (em produção, as funções de firebase-admin.js).
================================================================ */

export const MSG = {
    OCUPADO:    'Aguarde: sua operação anterior ainda está sendo processada.',
    OUTRA_MESA: 'Você já está sentado em outra mesa. Saia dela antes de entrar em outra.',
};

import { decidirMoedaMesa, normalizarMoeda } from './moeda.js';

export function criarServicoMesas({ io, gameManager, tournamentManager, debitar, creditar, emitirSaldo, socketMesa = new Map() }) {

    // Trava por uid: criar/entrar/rebuy/entrar_torneio do mesmo jogador não
    // rodam em paralelo. Sem isso, um duplo clique fazia as duas requisições
    // passarem pela checagem "já está na mesa?" antes do primeiro débito
    // terminar (o débito é um await no Firestore): debitava duas vezes e
    // devolvia uma só.
    const emOperacao = new Set();
    const torneioMoeda = (torneioId) => tournamentManager.getTorneio(torneioId)?.moeda || 'real';

    const travado = (fn) => async (socket, ...args) => {
        const uid = socket.data?.uid;
        if (!uid) return fn(socket, ...args);
        if (emOperacao.has(uid)) {
            socket.emit('erro', { mensagem: MSG.OCUPADO });
            return;
        }
        emOperacao.add(uid);
        try { return await fn(socket, ...args); }
        finally { emOperacao.delete(uid); }
    };

    // Um jogador só fica sentado numa mesa por vez. Com duas, socket.data.mesaId
    // apontava só para a última e as fichas da primeira ficavam presas lá.
    const mesaOndeEstaSentado = (uid) =>
        gameManager.getMesasAtivas().find(m => m.jogadores[uid]) || null;

    async function criarMesa(socket, config = {}) {
        if (!socket.data.uid) { socket.emit('erro', { mensagem: 'Autentique-se primeiro.' }); return; }
        const uid   = socket.data.uid;
        const buyIn = config.buyIn || 1000;
        if (mesaOndeEstaSentado(uid)) { socket.emit('erro', { mensagem: MSG.OUTRA_MESA }); return; }

        // Moeda decidida e validada aqui (moeda.js), nunca confiada ao cliente.
        const qtdBots = Math.max(0, Math.min(8, Math.floor(Number(config.qtdBots)) || 0));
        const decisao = decidirMoedaMesa(config, qtdBots);
        if (!decisao.sucesso) { socket.emit('erro', { mensagem: decisao.erro }); return; }
        const moeda   = decisao.moeda;

        // debitarEntradaMesa valida e normaliza o valor (nunca confiar num
        // buyIn negativo/inválido vindo do cliente) e debita SÓ na moeda da
        // mesa; a mesa usa o valor que ele realmente processou.
        const debito = await debitar(uid, buyIn, moeda);
        if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }

        const usuario = {
            uid,
            nome:        socket.data.nome,
            avatar:      socket.data.avatar,
            tema:        socket.data.tema,
            rankPontos:  config.rankPontos || 0,
            // Quanto do buy-in veio de saldo BÔNUS — nunca devolver mais
            // bônus do que entrou de fato quando ele sair.
            origemBonus: debito.debitarBonus || 0,
        };
        const resultado = gameManager.criarMesa({ ...config, moeda, buyIn: debito.fichasDebitadas }, usuario);
        if (!resultado.sucesso) {
            await creditar(uid, debito.fichasDebitadas, moeda, debito.debitarBonus);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        const mesaId = resultado.mesaId;
        socket.join(mesaId);
        socket.data.mesaId = mesaId;
        socketMesa.set(socket.id, mesaId);

        for (let i = 0; i < qtdBots; i++) {
            await new Promise(r => setTimeout(r, 300));
            gameManager.adicionarBot(mesaId, usuario.rankPontos || 0);
        }

        socket.emit('mesa_criada', { mesaId });
        await emitirSaldo(socket, uid);
        console.log(`🃏 Mesa ${mesaId} criada por ${usuario.nome} (buy-in ₿C ${buyIn})`);
        return mesaId;
    }

    async function entrarMesa(socket, dados) {
        if (!socket.data.uid) { socket.emit('erro', { mensagem: 'Autentique-se primeiro.' }); return; }
        if (!dados?.mesaId)   { socket.emit('erro', { mensagem: 'ID da mesa inválido.' }); return; }
        const uid  = socket.data.uid;
        const mesa = gameManager.getMesa(dados.mesaId);
        if (!mesa) { socket.emit('erro', { mensagem: 'Mesa não encontrada.' }); return; }
        const sentadoEm = mesaOndeEstaSentado(uid);
        if (sentadoEm && sentadoEm.id !== mesa.id) { socket.emit('erro', { mensagem: MSG.OUTRA_MESA }); return; }

        // Se jogador já está na mesa (reconexão), não debita novamente
        const jaEstaNaMesa = !!mesa.jogadores[uid];
        let debito = null;
        if (!jaEstaNaMesa) {
            debito = await debitar(uid, mesa.valorBuyIn, mesa.moeda);
            if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }
        }
        const origemBonus = debito?.debitarBonus || 0;

        const usuario = { uid, nome: socket.data.nome, avatar: socket.data.avatar, tema: socket.data.tema, origemBonus };
        const resultado = gameManager.entrarMesa(dados.mesaId, usuario, socket, dados.senha);
        // Débito feito mas não sentou com ele — erro, ou o jogador já estava
        // sentado (outra requisição chegou antes): estorna o que foi debitado.
        if (debito && (!resultado.sucesso || resultado.jaEstava)) {
            await creditar(uid, debito.fichasDebitadas ?? mesa.valorBuyIn, mesa.moeda, origemBonus);
        }
        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        socket.data.mesaId = dados.mesaId;
        socketMesa.set(socket.id, dados.mesaId);
        socket.emit('entrou_mesa', { mesaId: dados.mesaId });
        if (debito) await emitirSaldo(socket, uid);
        console.log(`🚪 ${usuario.nome} entrou na mesa ${dados.mesaId}`);
        return dados.mesaId;
    }

    async function rebuy(socket, dados) {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;
        const valor = parseInt(dados?.valor) || 0;
        if (valor <= 0) { socket.emit('erro', { mensagem: 'Valor de rebuy inválido.' }); return; }

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) { socket.emit('erro', { mensagem: 'Mesa não encontrada.' }); return; }

        // Rebuy cobra só na moeda da mesa, como a entrada.
        const debito = await debitar(uid, valor, mesa.moeda);
        if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }

        const resultado = gameManager.fazerRebuy(mesaId, uid, valor, debito.debitarBonus || 0);
        if (!resultado.sucesso) {
            // Devolve o débito se o rebuy falhou (ex: mão ativa, valor errado)
            await creditar(uid, valor, mesa.moeda, debito.debitarBonus || 0);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }
        socket.emit('rebuy_ok', { valor });
        await emitirSaldo(socket, uid);
    }

    async function entrarTorneio(socket, { torneioId } = {}) {
        if (!socket.data.uid) { socket.emit('erro', { mensagem: 'Autentique-se primeiro.' }); return; }
        if (!torneioId)       { socket.emit('erro', { mensagem: 'ID do torneio inválido.' }); return; }
        const uid = socket.data.uid;
        const torneio = tournamentManager.getTorneio(torneioId);
        if (!torneio) { socket.emit('erro', { mensagem: 'Torneio não encontrado.' }); return; }

        const jaEstaNaTorneio = !!torneio.jogadores[uid];
        let debito = null;
        if (!jaEstaNaTorneio) {
            debito = await debitar(uid, torneio.buyIn, torneio.moeda);
            if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }
        }
        const usuario = { uid, nome: socket.data.nome, avatar: socket.data.avatar || '', tema: socket.data.tema, pagoBonus: debito?.debitarBonus || 0 };
        const resultado = tournamentManager.entrarTorneio(torneioId, usuario);
        if (debito && (!resultado.sucesso || resultado.jaEstava)) {
            await creditar(uid, debito.fichasDebitadas, torneioMoeda(torneioId), debito.debitarBonus);
        }
        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        socket.join(`torneio:${torneioId}`);
        socket.data.torneioId = torneioId;
        socket.emit('torneio:entrou', { torneioId });
        if (!jaEstaNaTorneio) await emitirSaldo(socket, uid);
        io?.emit('torneios_atualizados', tournamentManager.listarTorneios());
        console.log(`🎫 ${usuario.nome} entrou no torneio ${torneioId}`);
        return torneioId;
    }

    async function criarTorneio(socket, config = {}) {
        if (!socket.data.uid) { socket.emit('erro', { mensagem: 'Autentique-se primeiro.' }); return; }
        const uid   = socket.data.uid;
        const buyIn = config.buyIn || 500;

        const moeda  = normalizarMoeda(config.moeda);   // validada no servidor
        const debito = await debitar(uid, buyIn, moeda);
        if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }

        const host = {
            uid,
            nome:      socket.data.nome,
            avatar:    socket.data.avatar || '',
            tema:      socket.data.tema,
            pagoBonus: debito.debitarBonus || 0,   // origem do buy-in (bônus nunca vira real)
        };
        const resultado = tournamentManager.criarTorneio({ ...config, moeda, buyIn: debito.fichasDebitadas }, host);
        if (!resultado.sucesso) {
            await creditar(uid, debito.fichasDebitadas, moeda, debito.debitarBonus);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        const { torneioId } = resultado;
        socket.join(`torneio:${torneioId}`);
        socket.data.torneioId = torneioId;
        socket.emit('torneio:criado', { torneioId });
        await emitirSaldo(socket, uid);
        io?.emit('torneios_atualizados', tournamentManager.listarTorneios());
        console.log(`🏆 Torneio ${torneioId} criado por ${host.nome}`);
        return torneioId;
    }

    async function rebuyTorneio(socket, { torneioId } = {}) {
        if (!socket.data.uid) { socket.emit('erro', { mensagem: 'Autentique-se primeiro.' }); return; }
        if (!torneioId)       { socket.emit('erro', { mensagem: 'ID do torneio inválido.' }); return; }
        const uid = socket.data.uid;

        const verificacao = tournamentManager.checarRebuy(torneioId, uid);
        if (!verificacao.sucesso) { socket.emit('erro', { mensagem: verificacao.erro }); return; }

        const torneio = tournamentManager.getTorneio(torneioId);
        const debito  = await debitar(uid, torneio.buyIn, torneio.moeda);
        if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }

        // processarRebuy recheca a elegibilidade: o estado pode ter mudado
        // durante o await do débito (torneio terminou, janela fechou...).
        const resultado = tournamentManager.processarRebuy(torneioId, uid, debito.debitarBonus || 0);
        if (!resultado.sucesso) {
            await creditar(uid, debito.fichasDebitadas, torneioMoeda(torneioId), debito.debitarBonus);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }
        await emitirSaldo(socket, uid);
        socket.emit('torneio:rebuy_confirmado', { torneioId });
        console.log(`🔄 Rebuy: ${socket.data.nome} no torneio ${torneioId}`);
    }

    /**
     * Saída completa da mesa (voluntária ou por desconexão).
     * MESA DE TORNEIO: fichas de torneio não são dinheiro — sair é forfeit,
     * nada é creditado (winner-take-all, ver tournament-manager.js).
     * Mesa comum: devolve o stack, real e bônus na mesma proporção em que
     * entraram (nunca mais bônus do que foi debitado como bônus).
     */
    async function sairMesa(socket, motivo = 'saída') {
        const mesaId = socket.data.mesaId || socketMesa.get(socket.id);
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        // Captura fichas e origem (real/bônus) ANTES de remover da mesa
        const mesa            = gameManager.getMesa(mesaId);
        const fichasRestantes = mesa?.jogadores?.[uid]?.saldo       || 0;
        const origemBonus     = mesa?.jogadores?.[uid]?.origemBonus || 0;
        const torneioId       = mesa?.torneioId || null;
        const moeda           = mesa?.moeda || 'real';

        socket.leave(mesaId);
        socketMesa.delete(socket.id);
        socket.data.mesaId = null;
        gameManager.sairMesa(mesaId, uid);

        if (torneioId) {
            tournamentManager.abandonarMesa(torneioId, uid);
            console.log(`🚪 ${socket.data.nome} abandonou mesa de torneio (${motivo}): ₿C ${fichasRestantes} de fichas forfeited.`);
            return;
        }
        // Tudo volta na moeda da mesa (bônus → saldoBonus; real → saldo,
        // com a rede de segurança de origemBonus).
        if (fichasRestantes > 0) {
            await creditar(uid, fichasRestantes, moeda, origemBonus);
            await emitirSaldo(socket, uid);
        }
        console.log(`🚪 ${socket.data.nome} saiu (${motivo}): ₿C ${fichasRestantes} devolvidos`);
    }

    /** Remoção automática por inatividade (callback do GameManager). */
    async function removidoPorInatividade({ uid, saldo, origemBonus, torneioId, moeda }) {
        if (torneioId) { tournamentManager.abandonarMesa(torneioId, uid); return; }
        if (saldo > 0) {
            await creditar(uid, saldo, moeda || 'real', origemBonus);
            for (const [, s] of io?.sockets?.sockets || []) {
                if (s.data.uid === uid) await emitirSaldo(s, uid);
            }
        }
        console.log(`🚪 ${uid} removido por inatividade: ₿C ${saldo} devolvidos`);
    }

    return {
        criarMesa:     travado(criarMesa),
        entrarMesa:    travado(entrarMesa),
        rebuy:         travado(rebuy),
        entrarTorneio: travado(entrarTorneio),
        criarTorneio:  travado(criarTorneio),
        rebuyTorneio:  travado(rebuyTorneio),
        sairMesa,
        removidoPorInatividade,
    };
}
