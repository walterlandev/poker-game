/* ================================================================
   ARQUIVO: backend/server.js

   CORREÇÕES DESTA VERSÃO:
   → processarSaidaMesa: não credita fichas se a saída foi causada
     por reconexão durante jogo ativo (evita crédito prematuro)
   → emitirSaldoAtualizado: importação estática em vez de dinâmica
   → sacadoHoje: preservado corretamente no emit de saldo
   → Demais funcionalidades mantidas intactas
================================================================ */

import express          from 'express';
import { createServer } from 'http';
import { Server       } from 'socket.io';
import cors             from 'cors';
import dotenv           from 'dotenv';
import { GameManager  } from './game-manager.js';

import {
    buscarRanking,
    buscarPerfil,
    buscarSaldo,
    debitarEntradaMesa,
    creditarSaidaMesa,
} from './firebase-admin.js';

import { registrarEventosWallet, resetarLimiteDiario } from './wallet/wallet-manager.js';
import { processarWebhookMP }                          from './wallet/mercadopago.js';
import { registrarEventosTemas }                       from './temas.js';

dotenv.config();


// ================================================================
// BLOCO 1: SERVIDOR HTTP + SOCKET.IO
// ================================================================

const app    = express();
const server = createServer(app);

const ORIGENS_PERMITIDAS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://poker-game-tawny-rho.vercel.app',
    process.env.CLIENT_URL,
].filter(Boolean);

const io = new Server(server, {
    cors: {
        origin: (origin, cb) => {
            if (!origin || ORIGENS_PERMITIDAS.includes(origin)) cb(null, true);
            else cb(new Error(`CORS bloqueado: ${origin}`));
        },
        methods:     ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
});

const gameManager = new GameManager(io);


// ================================================================
// BLOCO 2: MIDDLEWARES
// ================================================================

// rawBody necessário para validação HMAC do webhook do MP
app.use('/webhook/mercadopago', express.raw({ type: 'application/json' }), (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body.toString('utf8');
        req.body    = JSON.parse(req.rawBody);
    }
    next();
});

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || ORIGENS_PERMITIDAS.includes(origin)) cb(null, true);
        else cb(new Error(`CORS bloqueado: ${origin}`));
    },
    credentials: true,
}));

app.use(express.json());


// ================================================================
// BLOCO 3: ROTAS REST
// ================================================================

app.get('/health', (req, res) => {
    res.json({
        status:  'ok',
        uptime:  Math.floor(process.uptime()),
        mesas:   gameManager.getMesasAtivas().length,
        memoria: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    });
});

app.get('/mesas', (req, res) => {
    const mesas = gameManager.getMesasAtivas()
        .filter(m => m.fase === 'AGUARDANDO')
        .map(m => ({
            id:           m.id,
            nome:         m.nome,
            jogadores:    Object.keys(m.jogadores).length,
            maxJogadores: 9,
            bigBlind:     m.bigBlind,
            buyIn:        m.valorBuyIn,
            temSenha:     !!m.senha,
        }));
    res.json({ mesas });
});

app.get('/ranking', async (req, res) => {
    const top     = Math.min(parseInt(req.query.top) || 20, 100);
    const ranking = await buscarRanking(top);
    res.json({ ranking });
});

// GET /jogador/:uid → saldo atual para a Wallet no frontend
app.get('/jogador/:uid', async (req, res) => {
    const perfil = await buscarPerfil(req.params.uid);
    if (!perfil) return res.status(404).json({ erro: 'Jogador não encontrado.' });
    // Nunca expõe pinHash ou dados bancários ao cliente
    const { pinHash, dadosBancarios, chavePrivadaCriptografada, ...publico } = perfil;
    res.json(publico);
});

app.post('/webhook/mercadopago', processarWebhookMP(io));


// ================================================================
// BLOCO 4: MAP DE SOCKETS ATIVOS
// ================================================================

// socketMesa: socket.id → mesaId  (para limpeza no disconnect)
const socketMesa = new Map();


// ================================================================
// BLOCO 5: EVENTOS DO SOCKET.IO
// ================================================================

io.on('connection', (socket) => {
    console.log(`🔌 Conectado: ${socket.id}`);

    // Registra eventos da carteira (depósito, saque, envio P2P)
    registrarEventosWallet(socket, io);

    // Registra eventos de temas (comprar, ativar)
    registrarEventosTemas(socket);


    // ----------------------------------------------------------------
    // autenticar
    // ----------------------------------------------------------------
    socket.on('autenticar', (dados) => {
        if (!dados?.uid) {
            socket.emit('erro', { mensagem: 'UID inválido.' });
            return;
        }

        socket.data.uid    = dados.uid;
        socket.data.nome   = dados.nome   || 'Anônimo';
        socket.data.avatar = dados.avatar || '';

        console.log(`✅ Autenticado: ${dados.nome} (${dados.uid})`);
        socket.emit('autenticado', { sucesso: true });
    });


    // ----------------------------------------------------------------
    // criar_mesa
    // ----------------------------------------------------------------
    socket.on('criar_mesa', async (config) => {
        if (!socket.data.uid) {
            socket.emit('erro', { mensagem: 'Autentique-se primeiro.' });
            return;
        }

        const usuario = {
            uid:        socket.data.uid,
            nome:       socket.data.nome,
            avatar:     socket.data.avatar,
            rankPontos: config.rankPontos || 0,
        };

        const buyIn = config.buyIn || 1000;

        // ── DÉBITO DO BUY-IN ──────────────────────────────────────
        const debito = await debitarEntradaMesa(usuario.uid, buyIn);
        if (!debito.sucesso) {
            socket.emit('erro', { mensagem: debito.erro });
            return;
        }
        // ─────────────────────────────────────────────────────────

        const resultado = gameManager.criarMesa(config, usuario);

        if (!resultado.sucesso) {
            // Se a mesa falhou depois do débito, devolve o buyIn
            await creditarSaidaMesa(usuario.uid, buyIn);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        const mesaId = resultado.mesaId;

        socket.join(mesaId);
        socket.data.mesaId = mesaId;
        socketMesa.set(socket.id, mesaId);

        // Bots adicionados após a criação
        if (config.qtdBots > 0) {
            for (let i = 0; i < config.qtdBots; i++) {
                await new Promise(r => setTimeout(r, 300));
                gameManager.adicionarBot(mesaId, usuario.rankPontos || 0);
            }
        }

        socket.emit('mesa_criada', { mesaId });

        // Notifica o frontend do novo saldo (buy-in debitado)
        await emitirSaldoAtualizado(socket, usuario.uid);

        console.log(`🃏 Mesa ${mesaId} criada por ${usuario.nome} (buy-in ₿C ${buyIn})`);
    });


    // ----------------------------------------------------------------
    // entrar_mesa
    // ----------------------------------------------------------------
    socket.on('entrar_mesa', async (dados) => {
        if (!socket.data.uid) {
            socket.emit('erro', { mensagem: 'Autentique-se primeiro.' });
            return;
        }
        if (!dados?.mesaId) {
            socket.emit('erro', { mensagem: 'ID da mesa inválido.' });
            return;
        }

        const mesa = gameManager.getMesa(dados.mesaId);
        if (!mesa) {
            socket.emit('erro', { mensagem: 'Mesa não encontrada.' });
            return;
        }

        // Se jogador já está na mesa (reconexão), não debita novamente
        const jaEstaNaMesa = !!mesa.jogadores[socket.data.uid];

        if (!jaEstaNaMesa) {
            // ── DÉBITO DO BUY-IN ──────────────────────────────────
            const debito = await debitarEntradaMesa(socket.data.uid, mesa.valorBuyIn);
            if (!debito.sucesso) {
                socket.emit('erro', { mensagem: debito.erro });
                return;
            }
            // ──────────────────────────────────────────────────────
        }

        const usuario = {
            uid:    socket.data.uid,
            nome:   socket.data.nome,
            avatar: socket.data.avatar,
        };

        const resultado = gameManager.entrarMesa(dados.mesaId, usuario, socket);

        if (!resultado.sucesso) {
            // Devolve buyIn se não conseguiu entrar
            if (!jaEstaNaMesa) await creditarSaidaMesa(usuario.uid, mesa.valorBuyIn);
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        socket.data.mesaId = dados.mesaId;
        socketMesa.set(socket.id, dados.mesaId);

        socket.emit('entrou_mesa', { mesaId: dados.mesaId });

        if (!jaEstaNaMesa) {
            // Notifica frontend do saldo atualizado após débito
            await emitirSaldoAtualizado(socket, usuario.uid);
        }

        console.log(`🚪 ${usuario.nome} entrou na mesa ${dados.mesaId}`);
    });


    // ----------------------------------------------------------------
    // iniciar_rodada
    // ----------------------------------------------------------------
    socket.on('iniciar_rodada', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        if (mesa.host !== socket.data.uid) {
            socket.emit('erro', { mensagem: 'Somente o host pode iniciar.' });
            return;
        }
        if (Object.keys(mesa.jogadores).length < 2) {
            socket.emit('erro', { mensagem: 'Mínimo 2 jogadores para iniciar.' });
            return;
        }

        gameManager.iniciarRodada(mesaId);
        console.log(`▶️  Rodada iniciada na mesa ${mesaId}`);
    });


    // ----------------------------------------------------------------
    // acao (fold / check / call / raise)
    // ----------------------------------------------------------------
    socket.on('acao', (dados) => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        const acao  = dados?.acao?.toUpperCase();
        const valor = parseInt(dados?.valor) || 0;

        const acoesValidas = ['FOLD', 'CHECK', 'CALL', 'RAISE'];
        if (!acoesValidas.includes(acao)) {
            socket.emit('erro', { mensagem: 'Ação inválida.' });
            return;
        }

        gameManager.processarAcao(mesaId, uid, acao, valor, socket.id);
    });


    // ----------------------------------------------------------------
    // adicionar_bot
    // ----------------------------------------------------------------
    socket.on('adicionar_bot', (dados) => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa || mesa.host !== socket.data.uid) return;

        gameManager.adicionarBot(mesaId, dados?.rankPontos || 0);
    });


    // ----------------------------------------------------------------
    // rebuy
    // Jogador já está na mesa mas ficou sem fichas.
    // Debita novo buy-in do saldo real e recarrega fichas na mesa.
    // ----------------------------------------------------------------
    socket.on('rebuy', async (dados) => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        const valor = parseInt(dados?.valor) || 0;
        if (valor <= 0) {
            socket.emit('erro', { mensagem: 'Valor de rebuy inválido.' });
            return;
        }

        // ── DÉBITO DO REBUY ────────────────────────────────────────
        const debito = await debitarEntradaMesa(uid, valor);
        if (!debito.sucesso) {
            socket.emit('erro', { mensagem: debito.erro });
            return;
        }
        // ─────────────────────────────────────────────────────────

        const resultado = gameManager.fazerRebuy(mesaId, uid, valor);
        if (!resultado.sucesso) {
            // Devolve o débito se o rebuy falhou (ex: mão ativa)
            await creditarSaidaMesa(uid, valor);
            socket.emit('erro', { mensagem: resultado.erro });
        } else {
            socket.emit('rebuy_ok', { valor });
            await emitirSaldoAtualizado(socket, uid);
        }
    });


    // ----------------------------------------------------------------
    // sair_mesa  (voluntário)
    // ----------------------------------------------------------------
    socket.on('sair_mesa', async () => {
        await processarSaidaMesa(socket, 'voluntária');
        socket.emit('saiu_mesa', { sucesso: true });
    });


    // ----------------------------------------------------------------
    // disconnect
    // ----------------------------------------------------------------
    socket.on('disconnect', (motivo) => {
        console.log(`🔴 Desconectado: ${socket.id} (${motivo})`);

        // Guarda referência antes de limpar o map
        const mesaId = socketMesa.get(socket.id);
        const uid    = socket.data.uid;

        socketMesa.delete(socket.id);

        if (!mesaId || !uid) return;

        // Aguarda 5s para dar chance de reconexão antes de remover
        setTimeout(async () => {
            const mesa = gameManager.getMesa(mesaId);
            if (!mesa || !mesa.jogadores[uid]) return;

            // Verifica se o socket reconectou (outro socket.id para o mesmo uid)
            let reconectou = false;
            for (const [, s] of io.sockets.sockets) {
                if (s.data.uid === uid && s.data.mesaId === mesaId) {
                    reconectou = true;
                    break;
                }
            }

            if (!reconectou) {
                await processarSaidaMesa(socket, 'desconexão');
            }
        }, 5000);
    });


    // ----------------------------------------------------------------
    // pedir_estado
    // ----------------------------------------------------------------
    socket.on('pedir_estado', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        const estadoFiltrado = gameManager.filtrarEstadoParaJogador(mesa, socket.data.uid);
        socket.emit('estado_mesa', estadoFiltrado);
    });

});


// ================================================================
// BLOCO 6: HELPERS DO SERVIDOR
// ================================================================

/**
 * Processa saída completa da mesa:
 * 1. Captura fichas restantes do jogador na memória
 * 2. Remove da mesa via game-manager
 * 3. Credita fichas restantes no saldo real do Firestore
 *
 * IMPORTANTE: só credita se o jogador realmente está saindo.
 * Reconexões são tratadas no evento disconnect com delay de 5s.
 */
async function processarSaidaMesa(socket, motivo = 'saída') {
    const mesaId = socket.data.mesaId || socketMesa.get(socket.id);
    const uid    = socket.data.uid;
    if (!mesaId || !uid) return;

    // Captura fichas ANTES de remover da mesa
    const mesa            = gameManager.getMesa(mesaId);
    const fichasRestantes = mesa?.jogadores?.[uid]?.saldo || 0;

    // Remove da mesa (em memória)
    socket.leave(mesaId);
    socketMesa.delete(socket.id);
    socket.data.mesaId = null;
    gameManager.sairMesa(mesaId, uid);

    // Credita fichas restantes no Firestore como saldo real
    // Isso inclui: buyIn original + fichas ganhas nas rodadas - fichas perdidas
    if (fichasRestantes > 0) {
        await creditarSaidaMesa(uid, fichasRestantes);
        // Emite saldo atualizado para o frontend
        await emitirSaldoAtualizado(socket, uid);
    }

    console.log(`🚪 ${socket.data.nome} saiu (${motivo}): ₿C ${fichasRestantes} devolvidos`);
}

/**
 * Busca saldo atualizado do Firestore e emite para o socket.
 * Chamado após qualquer operação que altere o saldo.
 * Importação estática (buscarSaldo já importado no topo).
 */
async function emitirSaldoAtualizado(socket, uid) {
    try {
        const saldos = await buscarSaldo(uid);
        socket.emit('wallet:saldo_atualizado', {
            saldo:      saldos.saldo      || 0,
            saldoBonus: saldos.saldoBonus || 0,
            sacadoHoje: saldos.sacadoHoje || 0,
        });
    } catch (e) {
        console.error('emitirSaldoAtualizado erro:', e.message);
    }
}


// ================================================================
// BLOCO 7: INICIALIZAÇÃO
// ================================================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   🃏 Servidor Poker Online               ║
║   Porta:    ${PORT}                          ║
║   Ambiente: ${(process.env.NODE_ENV || 'desenvolvimento').padEnd(16)}    ║
║   Buy-in:   debitado ao sentar           ║
║   Prêmio:   creditado ao sair            ║
╚══════════════════════════════════════════╝
    `);
});


// ================================================================
// BLOCO 8: RESET DIÁRIO DO LIMITE DE SAQUE (meia-noite)
// ================================================================

function agendarResetDiario() {
    const agora     = new Date();
    const meianoite = new Date(agora);
    meianoite.setHours(24, 0, 0, 0);
    const ms = meianoite.getTime() - agora.getTime();

    setTimeout(async () => {
        await resetarLimiteDiario();
        setInterval(resetarLimiteDiario, 24 * 60 * 60 * 1000);
    }, ms);

    console.log(`🕐 Reset diário em ${Math.round(ms / 60000)} minutos.`);
}

agendarResetDiario();


// ================================================================
// BLOCO 9: ERROS GLOBAIS
// ================================================================

process.on('unhandledRejection', (e) => console.error('Erro async:', e));
process.on('uncaughtException',  (e) => console.error('Erro sync:',  e));
