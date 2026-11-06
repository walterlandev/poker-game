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

export function criarServicoMesas({ io, gameManager, tournamentManager, debitar, creditar, emitirSaldo, socketMesa = new Map() }) {

    // Trava por uid: criar/entrar/rebuy/entrar_torneio do mesmo jogador não
    // rodam em paralelo. Sem isso, um duplo clique fazia as duas requisições
    // passarem pela checagem "já está na mesa?" antes do primeiro débito
    // terminar (o débito é um await no Firestore): debitava duas vezes e
    // devolvia uma só.
    const emOperacao = new Set();
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

        // debitarEntradaMesa valida e normaliza o valor (nunca confiar num
        // buyIn negativo/inválido vindo do cliente); a mesa usa o valor que
        // ele realmente processou (fichasDebitadas).
        const debito = await debitar(uid, buyIn);
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
        const resultado = gameManager.criarMesa({ ...config, buyIn: debito.fichasDebitadas }, usuario);
        if (!resultado.sucesso) {
            await creditar(uid, debito.fichasDebitadas, debito.debitarBonus);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        const mesaId = resultado.mesaId;
        socket.join(mesaId);
        socket.data.mesaId = mesaId;
        socketMesa.set(socket.id, mesaId);

        if (config.qtdBots > 0) {
            for (let i = 0; i < config.qtdBots; i++) {
                await new Promise(r => setTimeout(r, 300));
                gameManager.adicionarBot(mesaId, usuario.rankPontos || 0);
            }
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
            debito = await debitar(uid, mesa.valorBuyIn);
            if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }
        }
        const origemBonus = debito?.debitarBonus || 0;

        const usuario = { uid, nome: socket.data.nome, avatar: socket.data.avatar, tema: socket.data.tema, origemBonus };
        const resultado = gameManager.entrarMesa(dados.mesaId, usuario, socket, dados.senha);
        // Débito feito mas não sentou com ele — erro, ou o jogador já estava
        // sentado (outra requisição chegou antes): estorna o que foi debitado.
        if (debito && (!resultado.sucesso || resultado.jaEstava)) {
            await creditar(uid, debito.fichasDebitadas ?? mesa.valorBuyIn, origemBonus);
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

        const debito = await debitar(uid, valor);
        if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }

        const resultado = gameManager.fazerRebuy(mesaId, uid, valor, debito.debitarBonus || 0);
        if (!resultado.sucesso) {
            // Devolve o débito se o rebuy falhou (ex: mão ativa, valor errado)
            await creditar(uid, valor, debito.debitarBonus || 0);
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
            debito = await debitar(uid, torneio.buyIn);
            if (!debito.sucesso) { socket.emit('erro', { mensagem: debito.erro }); return; }
        }
        const usuario = { uid, nome: socket.data.nome, avatar: socket.data.avatar || '', tema: socket.data.tema, pagoBonus: debito?.debitarBonus || 0 };
        const resultado = tournamentManager.entrarTorneio(torneioId, usuario);
        if (debito && (!resultado.sucesso || resultado.jaEstava)) {
            await creditar(uid, debito.fichasDebitadas, debito.debitarBonus);
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

        socket.leave(mesaId);
        socketMesa.delete(socket.id);
        socket.data.mesaId = null;
        gameManager.sairMesa(mesaId, uid);

        if (torneioId) {
            tournamentManager.abandonarMesa(torneioId, uid);
            console.log(`🚪 ${socket.data.nome} abandonou mesa de torneio (${motivo}): ₿C ${fichasRestantes} de fichas forfeited.`);
            return;
        }
        if (fichasRestantes > 0) {
            await creditar(uid, fichasRestantes, origemBonus);
            await emitirSaldo(socket, uid);
        }
        console.log(`🚪 ${socket.data.nome} saiu (${motivo}): ₿C ${fichasRestantes} devolvidos`);
    }

    /** Remoção automática por inatividade (callback do GameManager). */
    async function removidoPorInatividade({ uid, saldo, origemBonus, torneioId }) {
        if (torneioId) { tournamentManager.abandonarMesa(torneioId, uid); return; }
        if (saldo > 0) {
            await creditar(uid, saldo, origemBonus);
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
        sairMesa,
        removidoPorInatividade,
    };
}
