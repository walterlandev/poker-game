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
import fs               from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv           from 'dotenv';
import { GameManager        } from './game-manager.js';
import { TournamentManager  } from './tournament-manager.js';
import { criarServicoMesas  } from './servico-mesas.js';

import {
    inicializarFirebase,
    buscarRanking,
    buscarPerfil,
    buscarSaldo,
    debitarEntradaMesa,
    creditarSaidaMesa,
    atualizarAvatar,
    verificarIdToken,
    firebaseEstaAtivo,
} from './firebase-admin.js';

import { registrarEventosWallet, resetarLimiteDiario, minerarBlocoSeNecessario } from './wallet/wallet-manager.js';
import { blockchain } from './wallet/blockchain.js';
import { processarWebhookMP }                          from './wallet/mercadopago.js';
import { registrarEventosTemas }                       from './temas.js';
import { registrarEventosAdmin }                       from './admin.js';

dotenv.config();


// ================================================================
// BLOCO 1: SERVIDOR HTTP + SOCKET.IO
// ================================================================

const app    = express();
const server = createServer(app);

const ORIGENS_PERMITIDAS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:3001',                 // site servido pelo backend local
    'https://btcpokerclub.online',           // site servido pelo próprio servidor
    'https://www.btcpokerclub.online',
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
    // Ping mais frequente que o padrão (era 25s/60s) — hospedagens
    // compartilhadas costumam ter timeout de inatividade no proxy mais
    // curto que isso, derrubando o WebSocket achando que está ocioso.
    // Pacotes mais frequentes tendem a evitar isso.
    pingTimeout:       20000,
    pingInterval:      8000,
    maxHttpBufferSize: 5e6,   // 5 MB — cobre avatares base64 grandes
});

const gameManager        = new GameManager(io);
const tournamentManager  = new TournamentManager(io, gameManager);
gameManager.setTournamentManager(tournamentManager);


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

// Fotos de perfil — servidas como arquivo estático, direto do disco do
// servidor. Usado no lugar do Firebase Storage (que exige plano pago)
// já que já pagamos a hospedagem do backend mesmo.
const __filename    = fileURLToPath(import.meta.url);
const __dirname      = dirname(__filename);
const PASTA_AVATARES = join(__dirname, 'public', 'avatares');
fs.mkdirSync(PASTA_AVATARES, { recursive: true });
app.use('/avatares', express.static(PASTA_AVATARES));


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
    // Mostra mesas com vaga (< 9), mesmo já em andamento — o jogador entra
    // sentado e é servido a partir da próxima mão (entrarMesa não bloqueia
    // por fase). Mesas cheias somem da lista, estejam ou não em jogo, já
    // que ninguém consegue mesmo entrar nelas.
    const mesas = gameManager.getMesasAtivas()
        .filter(m => Object.keys(m.jogadores).length < 9)
        .map(m => ({
            id:           m.id,
            nome:         m.nome,
            fase:         m.fase,
            jogadores:    Object.keys(m.jogadores).length,
            maxJogadores: 9,
            bigBlind:     m.bigBlind,
            buyIn:        m.valorBuyIn,
            temSenha:     !!m.senha,
            moeda:        m.moeda || 'real',
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
    // Nunca expõe pinHash ou dados bancários ao cliente — só um booleano
    // dizendo se o PIN já foi configurado, pra saber se mostra "criar" ou "alterar"
    const { pinHash, dadosBancarios, chavePrivadaCriptografada, ...publico } = perfil;
    res.json({ ...publico, temPin: !!pinHash });
});

app.post('/webhook/mercadopago', processarWebhookMP(io));

// Site (frontend já compilado) servido pelo próprio servidor, no mesmo
// domínio: assim site e API ficam em btcpokerclub.online, sem Vercel e sem
// CORS entre domínios. A pasta é gerada por `npm run build:site` no frontend.
// Fica DEPOIS das rotas da API, para /mesas, /ranking etc. nunca caírem aqui.
const PASTA_SITE = join(__dirname, 'public', 'site');
const INDEX_SITE = join(PASTA_SITE, 'index.html');
app.use(express.static(PASTA_SITE, { index: 'index.html' }));
// Qualquer outro GET (ex.: recarregar a página com ?mesa=...) devolve o app
// React, que decide a tela. /socket.io é tratado pelo Socket.io antes daqui.
app.use((req, res, next) => {
    if (req.method !== 'GET' || !fs.existsSync(INDEX_SITE)) return next();
    res.sendFile(INDEX_SITE);
});


// ================================================================
// BLOCO 4: MAP DE SOCKETS ATIVOS
// ================================================================

// socketMesa: socket.id → mesaId  (para limpeza no disconnect)
const socketMesa = new Map();

// Débito/crédito em volta das mesas (ver servico-mesas.js, testável sem
// Firebase). emitirSaldoAtualizado é uma function declaration (hoisted).
const servicoMesas = criarServicoMesas({
    io, gameManager, tournamentManager, socketMesa,
    debitar:     debitarEntradaMesa,
    creditar:    creditarSaidaMesa,
    emitirSaldo: emitirSaldoAtualizado,
});

// Remoção automática por inatividade (3 faltas seguidas, decidida dentro do
// game-manager): devolve as fichas igual a um sair_mesa voluntário. Antes
// ninguém creditava nada — o stack inteiro do jogador removido sumia.
gameManager.setAoRemoverPorInatividade(servicoMesas.removidoPorInatividade);


// ================================================================
// BLOCO 5: EVENTOS DO SOCKET.IO
// ================================================================

io.on('connection', (socket) => {
    console.log(`🔌 Conectado: ${socket.id}`);

    // Registra eventos da carteira (depósito, saque, envio P2P)
    registrarEventosWallet(socket, io);

    // Registra eventos de temas (comprar, ativar)
    registrarEventosTemas(socket);

    // Registra eventos do painel de administração
    registrarEventosAdmin(socket, io);


    // ----------------------------------------------------------------
    // autenticar
    // ----------------------------------------------------------------
    socket.on('autenticar', async (dados) => {
        // Nunca confiar no uid que o cliente afirma ser: ele é público
        // (visível pra outros jogadores na mesma mesa e via GET /jogador/:uid),
        // então sem verificar o ID token do Firebase qualquer um podia abrir
        // uma conexão alegando ser outro uid — inclusive um admin — e
        // assumir a conta dele (sentar a vítima numa mesa e sacar o saldo
        // real dela). Em modo offline (testes locais sem Firebase) não tem
        // como verificar token, então confia no uid só nesse caso.
        let uid = dados?.uid;
        if (firebaseEstaAtivo()) {
            uid = await verificarIdToken(dados?.idToken);
            if (!uid) {
                socket.emit('erro', { mensagem: 'Sessão inválida. Faça login novamente.' });
                return;
            }
        } else if (!uid) {
            socket.emit('erro', { mensagem: 'UID inválido.' });
            return;
        }

        socket.data.uid    = uid;
        socket.data.nome   = dados.nome   || 'Anônimo';
        socket.data.avatar = dados.avatar || '';

        // Checagem de admin fica no SERVIDOR (não dá pra confiar em nada
        // que o cliente mande sobre isso) — lida direto do Firestore.
        const perfil = await buscarPerfil(uid);
        socket.data.isAdmin = !!perfil?.isAdmin;
        // Tema comprado/ativo também vem do Firestore — assim os outros
        // jogadores na mesa veem o baralho de verdade, não só quem comprou.
        socket.data.tema = perfil?.tema || 'classico';

        // Reconexão: se esse jogador já está sentado em alguma mesa (caiu a
        // conexão e o Socket.io reconectou sozinho — o socket é novo pro
        // servidor, então perde a sala e o socket.data antigo), reencontra
        // a mesa e reentra na sala automaticamente. Sem isso, depois de uma
        // queda de WebSocket o jogador ficava "fantasma": não recebia mais
        // estado_mesa e os cliques de ação não faziam nada (silenciosamente).
        const mesaExistente = gameManager.getMesasAtivas().find(m => m.jogadores[uid]);
        if (mesaExistente) {
            socket.data.mesaId = mesaExistente.id;
            socket.join(mesaExistente.id);
            socketMesa.set(socket.id, mesaExistente.id);
            const estadoFiltrado = gameManager.filtrarEstadoParaJogador(mesaExistente, uid);
            socket.emit('estado_mesa', estadoFiltrado);
            console.log(`🔁 ${dados.nome} reconectado à mesa ${mesaExistente.id}`);
        }

        console.log(`✅ Autenticado: ${dados.nome} (${uid})${socket.data.isAdmin ? ' [admin]' : ''}`);
        socket.emit('autenticado', { sucesso: true, isAdmin: socket.data.isAdmin });
    });


    // ----------------------------------------------------------------
    // upload_avatar
    // Recebe a foto em base64, salva como arquivo no próprio servidor
    // (em vez do Firebase Storage, que exige plano pago) e atualiza o
    // perfil no Firestore. A URL resultante é pública — outros
    // jogadores na mesa conseguem carregar a mesma foto.
    // ----------------------------------------------------------------
    socket.on('upload_avatar', async ({ imagemBase64 } = {}) => {
        if (!socket.data.uid) {
            socket.emit('avatar_erro', { mensagem: 'Autentique-se primeiro.' });
            return;
        }

        try {
            const match = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(imagemBase64 || '');
            if (!match) {
                socket.emit('avatar_erro', { mensagem: 'Formato de imagem inválido.' });
                return;
            }

            const [, extBruta, dadosBase64] = match;
            const ext    = extBruta === 'jpeg' ? 'jpg' : extBruta;
            const buffer = Buffer.from(dadosBase64, 'base64');

            if (buffer.length > 2 * 1024 * 1024) {
                socket.emit('avatar_erro', { mensagem: 'Imagem muito grande. Máximo 2MB.' });
                return;
            }

            const nomeArquivo = `${socket.data.uid}.${ext}`;
            fs.writeFileSync(join(PASTA_AVATARES, nomeArquivo), buffer);

            // Cache-busting: sem isso, o navegador (e os outros jogadores)
            // continuariam vendo a foto antiga em cache pelo mesmo nome de arquivo.
            const avatarUrl = `${process.env.SERVER_URL || ''}/avatares/${nomeArquivo}?v=${Date.now()}`;

            const resultado = await atualizarAvatar(socket.data.uid, avatarUrl);
            if (!resultado.sucesso) {
                socket.emit('avatar_erro', { mensagem: resultado.erro });
                return;
            }

            socket.data.avatar = avatarUrl;
            socket.emit('avatar_atualizado', { avatarUrl });
            console.log(`🖼️  Avatar atualizado: ${socket.data.nome} (${socket.data.uid})`);

        } catch (e) {
            console.error('upload_avatar erro:', e.message);
            socket.emit('avatar_erro', { mensagem: 'Erro ao processar imagem.' });
        }
    });


    // ----------------------------------------------------------------
    // criar_mesa
    // ----------------------------------------------------------------
    socket.on('criar_mesa', (config) => servicoMesas.criarMesa(socket, config || {}));

    // ----------------------------------------------------------------
    // entrar_mesa
    // ----------------------------------------------------------------
    socket.on('entrar_mesa', (dados) => servicoMesas.entrarMesa(socket, dados));


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

        const r = gameManager.adicionarBot(mesaId, dados?.rankPontos || 0);
        if (r && !r.sucesso) socket.emit('erro', { mensagem: r.erro });
    });


    // ----------------------------------------------------------------
    // rebuy
    // Jogador já está na mesa mas ficou sem fichas.
    // Debita novo buy-in do saldo real e recarrega fichas na mesa.
    // ----------------------------------------------------------------
    socket.on('rebuy', (dados) => servicoMesas.rebuy(socket, dados));


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
    socket.on('pedir_estado', async () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        const estadoFiltrado = gameManager.filtrarEstadoParaJogador(mesa, socket.data.uid);
        socket.emit('estado_mesa', estadoFiltrado);

        // Emite saldo atualizado para que o header do jogo exiba o valor correto
        await emitirSaldoAtualizado(socket, socket.data.uid);
    });


    // ================================================================
    // EVENTOS DE TORNEIO
    // ================================================================

    // ----------------------------------------------------------------
    // criar_torneio
    // ----------------------------------------------------------------
    socket.on('criar_torneio', (config) => servicoMesas.criarTorneio(socket, config || {}));


    // ----------------------------------------------------------------
    // entrar_torneio
    // ----------------------------------------------------------------
    socket.on('entrar_torneio', (dados) => servicoMesas.entrarTorneio(socket, dados || {}));


    // ----------------------------------------------------------------
    // iniciar_torneio
    // ----------------------------------------------------------------
    socket.on('iniciar_torneio', ({ torneioId }) => {
        if (!socket.data.uid) return;

        const resultado = tournamentManager.iniciarTorneio(torneioId, socket.data.uid);
        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        io.emit('torneios_atualizados', tournamentManager.listarTorneios());
        console.log(`▶️  Torneio ${torneioId} iniciado`);
    });


    // ----------------------------------------------------------------
    // listar_torneios
    // ----------------------------------------------------------------
    socket.on('listar_torneios', () => {
        socket.emit('torneios_lista', tournamentManager.listarTorneios());
    });


    // ----------------------------------------------------------------
    // pedir_estado_torneio
    // ----------------------------------------------------------------
    socket.on('pedir_estado_torneio', ({ torneioId }) => {
        if (!torneioId) return;
        const torneio = tournamentManager.getTorneio(torneioId);
        if (!torneio) return;
        tournamentManager.emitirEstadoTorneio(torneioId);
    });


    // ----------------------------------------------------------------
    // torneio_rebuy — jogador paga para re-entrar no próximo round
    // ----------------------------------------------------------------
    socket.on('torneio_rebuy', (dados) => servicoMesas.rebuyTorneio(socket, dados || {}));

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
 *
 * MESA DE TORNEIO: fichas de torneio NÃO são dinheiro — só o campeão
 * recebe prêmio real, e só ao fim do torneio (winner-take-all, ver
 * tournament-manager.js). Sair/desconectar de uma mesa de torneio no meio
 * do jogo tinha que ser tratado como desistência (forfeit), sem creditar
 * nada — antes disso, sair era um jeito de "sacar" o stack acumulado como
 * saldo real na hora, furando o winner-take-all e deixando uma entrada
 * fantasma presa em torneio.jogadores[uid].
 */
async function processarSaidaMesa(socket, motivo = 'saída') {
    return servicoMesas.sairMesa(socket, motivo);
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


// ================================================================
// BLOCO 9: INICIALIZAÇÃO ASSÍNCRONA
//
// Nada de top-level await aqui — a Hostinger (e outros hosts que
// carregam o servidor via require() clássico do Node) não suporta
// um módulo ESM com await fora de função (ERR_REQUIRE_ASYNC_MODULE).
// Por isso toda a ordem de inicialização (Firebase → blockchain →
// só então aceitar conexões) é orquestrada aqui dentro, e chamada
// no fim do arquivo sem await no nível do módulo.
// ================================================================

async function main() {
    await inicializarFirebase();
    await blockchain.carregarDoFirestore();
    console.log('₿C Blockchain iniciada:', blockchain.getInfo());

    agendarResetDiario();

    // Mineração periódica da blockchain (a cada 20s, só se houver
    // transação pendente na mempool)
    setInterval(minerarBlocoSeNecessario, 20_000);

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
}

main().catch((erro) => {
    console.error('❌ Erro fatal na inicialização do servidor:', erro);
    process.exit(1);
});


// ================================================================
// BLOCO 9: ERROS GLOBAIS
// ================================================================

process.on('unhandledRejection', (e) => console.error('Erro async:', e));
process.on('uncaughtException',  (e) => console.error('Erro sync:',  e));
