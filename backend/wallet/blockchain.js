/* ================================================================
   ARQUIVO: backend/wallet/blockchain.js

   CONCEITO GERAL:
   Estrutura da blockchain do Bitchager (₿C).
   
   SITUAÇÃO ATUAL (Fase 1 — Centralizada):
   O servidor é a autoridade central. Ele valida e confirma
   todas as transações. É mais simples e suficiente para começar.
   As transações já são encadeadas e assinadas digitalmente —
   o histórico é imutável e auditável.

   FUTURO (Fase 2 — Blockchain Própria):
   Múltiplos nós validam as transações por consenso.
   Nenhum servidor central pode alterar o histórico.
   Qualquer pessoa pode rodar um nó e verificar tudo.

   ESTA ESTRUTURA JÁ PREPARA A TRANSIÇÃO:
   Os blocos, a cadeia e o algoritmo de prova de trabalho
   estão implementados aqui. Quando quiser descentralizar,
   é só conectar esta classe ao sistema de nós da rede.

   COMO UMA BLOCKCHAIN FUNCIONA:
   
   Bloco → contém N transações + hash do bloco anterior
   
   Genesis → Bloco 1 → Bloco 2 → Bloco 3 → ...
   
   Cada bloco referencia o anterior pelo hash.
   Alterar qualquer bloco muda seu hash, invalidando todos
   os blocos subsequentes. É matematicamente impossível
   adulterar silenciosamente.

   PROVA DE TRABALHO (Proof of Work):
   Para adicionar um bloco, o minerador precisa encontrar um
   número (nonce) tal que o hash do bloco comece com N zeros.
   Isso exige muito processamento — dificulta ataques.
   Bitcoin usa dificuldade ~70 zeros em binário.
   Nós usamos dificuldade menor para ser mais rápido.
================================================================ */

import crypto from 'crypto';
import admin  from 'firebase-admin';

// Import só pelo efeito colateral: força o Node a esperar o
// admin.initializeApp() de firebase-admin.js terminar (ele usa top-level
// await) ANTES do código deste arquivo rodar. Sem isso, como este módulo
// só importava o pacote 'firebase-admin' cru (não o wrapper do projeto),
// a ordem de avaliação dos módulos ES não garantia isso — na prática a
// blockchain tentava ler o Firestore antes da inicialização terminar e
// sempre caía no modo só-memória.
import '../firebase-admin.js';


// ================================================================
// BLOCO 1: CONFIGURAÇÕES DA BLOCKCHAIN
//
// DIFICULDADE: quantos zeros o hash do bloco deve começar.
//   Dificuldade 2 → hash começa com "00..."
//   Dificuldade 3 → hash começa com "000..."
//   Quanto maior, mais lento minerar (mais seguro).
//   Bitcoin usa dificuldade equivalente a ~19 zeros em hex.
//   Começamos com 2 para ser rápido em desenvolvimento.
//
// MAX_TRANSACOES_POR_BLOCO: quantas transações cabem em um bloco.
//   Bitcoin tem limite de 1MB por bloco (~3.000 transações).
//   Ethereum tem limite de gas (~200 transações simples).
//   Começamos com 10 para simplicidade.
//
// RECOMPENSA_MINERADOR: ₿C dados ao validador do bloco.
//   Bitcoin: começou com 50 BTC, reduz à metade a cada 4 anos (halving).
//   Aqui fica ZERO — esta é a Fase 1 (ledger centralizado, sem rede de
//   nós de verdade). O papel do "minerador" é só o próprio servidor
//   selando os blocos; dar recompensa criaria ₿C do nada, sem lastro em
//   depósito real, o que quebraria a contabilidade da carteira (saldo
//   real de cada jogador continua sendo a fonte de verdade — a
//   blockchain aqui é o registro auditável e à prova de adulteração
//   desse histórico, não uma segunda fonte de saldo).
// ================================================================

const CONFIG_BLOCKCHAIN = {
    DIFICULDADE:                 2,
    MAX_TRANSACOES_POR_BLOCO:    10,
    RECOMPENSA_MINERADOR:        0,
    VERSAO:                      '1.0',
    NOME_REDE:                   'Bitchager Mainnet',
    SIMBOLO:                     'BC',
};


// ================================================================
// BLOCO 2: ESTRUTURA DE UM BLOCO
//
// O que é um bloco?
//   Um bloco é um "contêiner" de transações.
//   Junto com as transações, ele guarda metadados:
//     → índice:        posição na cadeia (0, 1, 2, ...)
//     → timestamp:     quando foi criado
//     → transacoes:    lista de transações incluídas
//     → hashAnterior:  hash do bloco anterior (o encadeamento)
//     → nonce:         número usado na prova de trabalho
//     → minerador:     endereço que recebeu a recompensa
//     → hash:          hash deste bloco (calculado por último)
//     → merkleRoot:    hash raiz da árvore de todas as transações
//
// O que é Merkle Root?
//   É um resumo criptográfico de todas as transações do bloco.
//   Calculado em árvore binária:
//     tx1, tx2, tx3, tx4
//     hash(tx1+tx2), hash(tx3+tx4)
//     hash( hash(tx1+tx2) + hash(tx3+tx4) ) = Merkle Root
//   Com o Merkle Root, é possível provar que uma transação
//   específica está no bloco sem baixar o bloco inteiro.
//   Isso é fundamental para "light clients" (carteiras leves).
// ================================================================

// Hash calculado a partir do CONTEÚDO real da transação — não do campo
// tx.hash já gravado nela. Se calcularMerkleRoot confiasse em tx.hash,
// alguém poderia mudar tx.valor sem tocar em tx.hash e a raiz de Merkle
// recalculada bateria do mesmo jeito (bug real encontrado em teste:
// adulterar o valor de uma tx minerada não derrubava validarCadeia()).
// Recalculando o hash do conteúdo aqui, qualquer alteração em qualquer
// campo muda a folha da árvore, muda a raiz, e derruba a validação.
function hashConteudoTx(tx) {
    const payload = JSON.stringify({
        tipo:                 tx.tipo,
        remetenteUid:         tx.remetenteUid,
        remetenteEndereco:    tx.remetenteEndereco,
        destinatarioEndereco: tx.destinatarioEndereco,
        valor:                tx.valor,
        taxa:                 tx.taxa,
        valorLiquido:         tx.valorLiquido,
        timestamp:            tx.timestamp,
        hashAnterior:         tx.hashAnterior,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

function calcularMerkleRoot(transacoes) {
    if (!transacoes || transacoes.length === 0) {
        return '0'.repeat(64);
    }

    // Começa com os hashes do CONTEÚDO de cada transação (não tx.hash)
    let nivel = transacoes.map(hashConteudoTx);

    // Sobe a árvore até restar apenas um hash (a raiz)
    while (nivel.length > 1) {

        const proximoNivel = [];

        for (let i = 0; i < nivel.length; i += 2) {
            const esquerda = nivel[i];
            // Se o número for ímpar, duplica o último (convenção Bitcoin)
            const direita  = nivel[i + 1] || nivel[i];

            const hashPar = crypto
                .createHash('sha256')
                .update(esquerda + direita)
                .digest('hex');

            proximoNivel.push(hashPar);
        }

        nivel = proximoNivel;
    }

    return nivel[0];
}

function calcularHashBloco(bloco) {
    // Serializa todos os campos relevantes do bloco
    // O nonce é incluído — é ele que mudamos durante a mineração
    const payload = JSON.stringify({
        indice:       bloco.indice,
        timestamp:    bloco.timestamp,
        merkleRoot:   bloco.merkleRoot,
        hashAnterior: bloco.hashAnterior,
        nonce:        bloco.nonce,
        minerador:    bloco.minerador,
        versao:       bloco.versao,
    });

    return crypto
        .createHash('sha256')
        .update(payload)
        .digest('hex');
}

function criarBloco({ indice, transacoes, hashAnterior, minerador }) {
    const timestamp  = new Date().toISOString();
    const merkleRoot = calcularMerkleRoot(transacoes);

    return {
        versao:       CONFIG_BLOCKCHAIN.VERSAO,
        indice,
        timestamp,
        transacoes,
        hashAnterior,
        merkleRoot,
        minerador:    minerador || 'BC_SISTEMA_MINT_000000000000',
        nonce:        0,     // será incrementado durante a mineração
        hash:         null,  // calculado após a mineração
    };
}


// ================================================================
// BLOCO 3: PROVA DE TRABALHO (Proof of Work)
//
// O que é Proof of Work?
//   É o mecanismo que torna difícil adicionar blocos falsos.
//   Para adicionar um bloco, você precisa encontrar um nonce
//   tal que o hash do bloco comece com N zeros.
//
//   Como funciona:
//   1. Monta o bloco com nonce = 0
//   2. Calcula o hash
//   3. Hash começa com "00..."? Mineração completa!
//   4. Não começa? Incrementa nonce e tenta de novo.
//   5. Repete até encontrar (pode levar bilhões de tentativas)
//
//   Por que isso é seguro?
//   Para alterar um bloco antigo, você precisaria:
//   1. Refazer a prova de trabalho daquele bloco
//   2. E de TODOS os blocos seguintes
//   3. Mais rápido que toda a rede está criando novos blocos
//   Computacionalmente impossível para um atacante sozinho.
//
//   Por que começamos com dificuldade 2?
//   Em desenvolvimento, dificuldade alta tornaria os testes lentos.
//   Dificuldade 2 = hash começa com "00" = ~256 tentativas em média.
//   Dificuldade 4 = "0000" = ~65.000 tentativas em média.
//   Dificuldade Bitcoin = ~77 zeros em binário = quintilhões de tentativas.
// ================================================================

function minerar(bloco, dificuldade = CONFIG_BLOCKCHAIN.DIFICULDADE) {
    // O prefixo que o hash deve ter (ex: "00" para dificuldade 2)
    let prefixoAlvo = '0'.repeat(dificuldade);

    let tentativas = 0;
    const inicio   = Date.now();

    // Loop até encontrar um hash válido
    while (true) {
        const hash = calcularHashBloco(bloco);

        // Verifica se começa com os zeros necessários
        if (hash.startsWith(prefixoAlvo)) {
            const tempoMs = Date.now() - inicio;
            return {
                ...bloco,
                hash,
                tentativas,
                tempoMineracao: tempoMs,
            };
        }

        // Não encontrou → incrementa nonce e tenta novamente
        // O nonce é o único campo que muda entre tentativas
        bloco.nonce++;
        tentativas++;

        // Proteção: limite de tentativas para não travar o servidor
        // Em produção, mineração acontece em worker threads ou nós externos
        if (tentativas > 10000000) {
            console.warn('Limite de tentativas atingido. Reduzindo dificuldade.');
            dificuldade = Math.max(1, dificuldade - 1);
            prefixoAlvo = '0'.repeat(dificuldade); // sem isso a redução não tinha efeito nenhum
        }
    }
}


// ================================================================
// BLOCO 4: BLOCO GÊNESIS
//
// O que é o bloco gênesis?
//   É o primeiro bloco da blockchain — o bloco zero.
//   Não tem bloco anterior, então hashAnterior = "000...000".
//   É gerado uma única vez quando a rede é iniciada.
//   Todos os nós da rede concordam com o mesmo bloco gênesis.
//   É como a "certidão de nascimento" da blockchain.
//
// O bloco gênesis do Bitcoin foi minerado por Satoshi Nakamoto
// em 3 de janeiro de 2009. Ele incluiu a manchete do The Times
// "Chancellor on brink of second bailout for banks" — uma
// mensagem sobre o porquê das criptomoedas existirem.
//
// Nosso bloco gênesis inclui a data de fundação do Bitchager.
// ================================================================

function criarBlocoGenesis() {
    const transacaoGenesis = {
        id:                   '0'.repeat(64),
        hash:                 '0'.repeat(64),
        tipo:                 'BONUS',
        remetenteUid:         'SATOSHI_BITCHAGER',
        remetenteEndereco:    'BC_GENESIS_000000000000000000',
        destinatarioEndereco: 'BC_GENESIS_000000000000000000',
        valor:                0,
        taxa:                 0,
        valorLiquido:         0,
        timestamp:            '2024-01-01T00:00:00.000Z',
        metadados: {
            descricao: 'Bitchager Genesis Block — O começo de tudo.',
            mensagem:  'Construindo o futuro do poker digital.',
        },
        status:       'CONFIRMADA',
        confirmadaEm: '2024-01-01T00:00:00.000Z',
        assinatura:   null,
        hashAnterior: '0'.repeat(64),
    };

    const genesis = criarBloco({
        indice:       0,
        transacoes:   [transacaoGenesis],
        hashAnterior: '0'.repeat(64),
        minerador:    'BC_GENESIS_000000000000000000',
    });

    // Minera o bloco gênesis (com dificuldade 1 para ser rápido)
    return minerar(genesis, 1);
}


// ================================================================
// BLOCO 5: CLASSE BLOCKCHAIN
//
// A classe principal que gerencia toda a cadeia.
// Em Fase 1 (centralizada), uma instância roda no servidor.
// Em Fase 2 (descentralizada), cada nó terá sua instância
// e elas se sincronizam via protocolo P2P (peer-to-peer).
// ================================================================

export class Blockchain {

    constructor() {
        // A cadeia começa com o bloco gênesis
        this.cadeia = [criarBlocoGenesis()];

        // Fila de transações aguardando inclusão no próximo bloco
        // Transações confirmadas no servidor mas ainda não mineradas
        this.mempool = [];

        // Estatísticas da rede
        this.stats = {
            totalBlocos:      1,
            totalTransacoes:  1,
            dificuldadeAtual: CONFIG_BLOCKCHAIN.DIFICULDADE,
            iniciadaEm:       new Date().toISOString(),
        };
    }


    // ----------------------------------------------------------------
    // Retorna o último bloco da cadeia
    // É o "bloco atual" ao qual o próximo será encadeado
    // ----------------------------------------------------------------
    get ultimoBloco() {
        return this.cadeia[this.cadeia.length - 1];
    }


    // ----------------------------------------------------------------
    // Adiciona transação à mempool (fila de espera)
    //
    // A mempool é onde as transações ficam antes de serem mineradas.
    // No Bitcoin, há taxas de prioridade — transações que pagam mais
    // são incluídas nos blocos primeiro.
    // Por enquanto, usamos FIFO simples (primeiro a chegar, primeiro a sair).
    // ----------------------------------------------------------------
    adicionarTransacao(transacao) {
        if (!transacao || !transacao.hash) {
            return { sucesso: false, erro: 'Transação inválida.' };
        }

        // Evita duplicatas na mempool
        const jaNaFila = this.mempool.some(tx => tx.hash === transacao.hash);
        if (jaNaFila) {
            return { sucesso: false, erro: 'Transação já está na fila.' };
        }

        this.mempool.push(transacao);
        return { sucesso: true, posicaoNaFila: this.mempool.length };
    }


    // ----------------------------------------------------------------
    // Minera um novo bloco com as transações da mempool
    //
    // Processo:
    //   1. Pega até MAX_TRANSACOES_POR_BLOCO da mempool
    //   2. Adiciona transação de recompensa para o minerador
    //   3. Cria o bloco
    //   4. Faz a prova de trabalho (mining)
    //   5. Adiciona à cadeia
    //   6. Remove as transações processadas da mempool
    // ----------------------------------------------------------------
    async minarBloco(enderecoMinerador) {
        if (this.mempool.length === 0) {
            return { sucesso: false, erro: 'Mempool vazia. Nada para minerar.' };
        }

        // Pega as primeiras N transações da fila
        const transacoesDoBloco = this.mempool.slice(
            0,
            CONFIG_BLOCKCHAIN.MAX_TRANSACOES_POR_BLOCO
        );

        // Recompensa de mineração fica em 0 (ver CONFIG_BLOCKCHAIN) — não
        // criamos transação de recompensa pra não inflar ₿C sem depósito.
        const todasTransacoes = CONFIG_BLOCKCHAIN.RECOMPENSA_MINERADOR > 0
            ? [{
                id:                   crypto.randomBytes(32).toString('hex'),
                hash:                 crypto.randomBytes(32).toString('hex'),
                tipo:                 'BONUS',
                remetenteUid:         'SISTEMA',
                remetenteEndereco:    'BC_SISTEMA_MINT_000000000000',
                destinatarioEndereco: enderecoMinerador,
                valor:                CONFIG_BLOCKCHAIN.RECOMPENSA_MINERADOR,
                taxa:                 0,
                valorLiquido:         CONFIG_BLOCKCHAIN.RECOMPENSA_MINERADOR,
                timestamp:            new Date().toISOString(),
                metadados: { descricao: `Recompensa de mineração — Bloco #${this.cadeia.length}` },
                status:       'CONFIRMADA',
                assinatura:   null,
                hashAnterior: '0'.repeat(64),
              }, ...transacoesDoBloco]
            : transacoesDoBloco;

        // Cria o bloco
        const novoBloco = criarBloco({
            indice:       this.cadeia.length,
            transacoes:   todasTransacoes,
            hashAnterior: this.ultimoBloco.hash,
            minerador:    enderecoMinerador,
        });

        // Faz a prova de trabalho (pode demorar alguns milissegundos)
        const blocoMinerado = minerar(novoBloco, this.stats.dificuldadeAtual);

        // Valida antes de adicionar (segurança extra)
        if (!this.validarBloco(blocoMinerado, this.ultimoBloco)) {
            return { sucesso: false, erro: 'Bloco inválido após mineração.' };
        }

        // Adiciona à cadeia
        this.cadeia.push(blocoMinerado);
        await this.persistirBloco(blocoMinerado);

        // Remove as transações processadas da mempool
        this.mempool = this.mempool.slice(
            CONFIG_BLOCKCHAIN.MAX_TRANSACOES_POR_BLOCO
        );

        // Atualiza estatísticas
        this.stats.totalBlocos++;
        this.stats.totalTransacoes += todasTransacoes.length;

        return {
            sucesso:         true,
            bloco:           blocoMinerado,
            transacoes:      todasTransacoes.length,
            tentativas:      blocoMinerado.tentativas,
            tempoMineracao:  blocoMinerado.tempoMineracao + 'ms',
        };
    }


    // ================================================================
    // PERSISTÊNCIA (Firestore)
    //
    // Sem isso, a cadeia inteira vivia só em memória — um restart do
    // servidor "esquecia" tudo e recomeçava do bloco gênesis, o que
    // anula qualquer alegação de histórico imutável. Cada bloco minerado
    // é salvo assim que fechado; no boot, a cadeia é recarregada do
    // Firestore em vez de sempre recriar do zero.
    // ================================================================

    async persistirBloco(bloco) {
        if (!admin.apps.length) return;
        try {
            await admin.firestore()
                .collection('blockchain_blocos')
                .doc(String(bloco.indice))
                .set(bloco);
        } catch (e) {
            console.error('Erro ao persistir bloco da blockchain:', e.message);
        }
    }

    async carregarDoFirestore() {
        if (!admin.apps.length) {
            console.warn('⚠️  Blockchain: Firebase não inicializado — rodando só em memória (não sobrevive a restarts).');
            return;
        }

        try {
            const snap = await admin.firestore()
                .collection('blockchain_blocos')
                .orderBy('indice', 'asc')
                .get();

            if (snap.empty) {
                // Primeira vez rodando — persiste o gênesis já criado no construtor
                await this.persistirBloco(this.cadeia[0]);
                console.log('⛓️  Blockchain: bloco gênesis persistido no Firestore (primeira execução).');
                return;
            }

            const cadeiaCarregada = snap.docs.map(d => d.data());
            const validacao = this._validarCadeiaArray(cadeiaCarregada);

            if (!validacao.valida) {
                console.error('❌ Blockchain persistida está inválida:', validacao.motivo, '— mantendo apenas o gênesis em memória.');
                return;
            }

            this.cadeia = cadeiaCarregada;
            this.stats.totalBlocos     = cadeiaCarregada.length;
            this.stats.totalTransacoes = cadeiaCarregada.reduce((t, b) => t + b.transacoes.length, 0);
            console.log(`⛓️  Blockchain: ${cadeiaCarregada.length} bloco(s) carregado(s) do Firestore.`);

        } catch (e) {
            console.error('Erro ao carregar blockchain do Firestore:', e.message);
        }
    }

    // Valida um array de blocos já carregado (antes de assumi-lo como this.cadeia)
    _validarCadeiaArray(cadeia) {
        for (let i = 1; i < cadeia.length; i++) {
            if (!this.validarBloco(cadeia[i], cadeia[i - 1])) {
                return { valida: false, motivo: `Bloco #${i} é inválido.` };
            }
        }
        return { valida: true };
    }


    // ----------------------------------------------------------------
    // Valida um bloco individual
    //
    // Verificações:
    //   1. O hash do bloco está correto (não foi alterado)
    //   2. O hashAnterior corresponde ao bloco anterior na cadeia
    //   3. O hash atende à dificuldade atual (prova de trabalho)
    //   4. O Merkle Root está correto (transações não foram alteradas)
    // ----------------------------------------------------------------
    validarBloco(bloco, blocoAnterior) {
        // 1. Recalcula o hash e compara
        const hashCalculado = calcularHashBloco(bloco);
        if (hashCalculado !== bloco.hash) {
            console.error(`Bloco #${bloco.indice}: hash inválido.`);
            return false;
        }

        // 2. Verifica o encadeamento com o bloco anterior
        if (blocoAnterior && bloco.hashAnterior !== blocoAnterior.hash) {
            console.error(`Bloco #${bloco.indice}: hashAnterior não confere.`);
            return false;
        }

        // 3. Verifica a prova de trabalho
        const prefixoAlvo = '0'.repeat(this.stats.dificuldadeAtual);
        if (!bloco.hash.startsWith(prefixoAlvo)) {
            console.error(`Bloco #${bloco.indice}: prova de trabalho insuficiente.`);
            return false;
        }

        // 4. Verifica o Merkle Root
        const merkleCalculado = calcularMerkleRoot(bloco.transacoes);
        if (merkleCalculado !== bloco.merkleRoot) {
            console.error(`Bloco #${bloco.indice}: Merkle Root inválido. Transações adulteradas.`);
            return false;
        }

        return true;
    }


    // ----------------------------------------------------------------
    // Valida toda a cadeia
    //
    // Percorre todos os blocos verificando:
    //   1. Cada bloco individualmente
    //   2. O encadeamento entre blocos consecutivos
    //
    // Em uma blockchain descentralizada, qualquer nó pode
    // chamar este método para verificar a cadeia que recebeu.
    // ----------------------------------------------------------------
    validarCadeia() {
        for (let i = 1; i < this.cadeia.length; i++) {
            const blocoAtual   = this.cadeia[i];
            const blocoAnterior = this.cadeia[i - 1];

            if (!this.validarBloco(blocoAtual, blocoAnterior)) {
                return {
                    valida:  false,
                    indice:  i,
                    motivo: `Bloco #${i} é inválido.`,
                };
            }
        }

        return {
            valida:        true,
            totalBlocos:   this.cadeia.length,
            verificadoEm:  new Date().toISOString(),
        };
    }


    // ----------------------------------------------------------------
    // Busca todas as transações de um endereço
    //
    // Percorre todos os blocos procurando transações onde
    // o endereço é remetente ou destinatário.
    // Útil para exibir o histórico na carteira do jogador.
    // ----------------------------------------------------------------
    getHistoricoEndereco(endereco) {
        const historico = [];

        for (const bloco of this.cadeia) {
            for (const tx of bloco.transacoes) {
                if (
                    tx.remetenteEndereco    === endereco ||
                    tx.destinatarioEndereco === endereco
                ) {
                    historico.push({
                        ...tx,
                        bloco: bloco.indice, // em qual bloco está
                    });
                }
            }
        }

        // Ordena do mais recente para o mais antigo
        return historico.sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
    }


    // ----------------------------------------------------------------
    // Calcula o saldo de um endereço diretamente da blockchain
    //
    // Este é o saldo "oficial" — calculado a partir de
    // todas as transações confirmadas na cadeia.
    // Deve coincidir com o saldo no banco Supabase.
    // Se divergir, houve inconsistência.
    // ----------------------------------------------------------------
    getSaldo(endereco) {
        let saldo = 0;

        for (const bloco of this.cadeia) {
            for (const tx of bloco.transacoes) {
                if (tx.destinatarioEndereco === endereco) {
                    saldo += tx.valorLiquido || 0;
                }
                if (tx.remetenteEndereco === endereco) {
                    saldo -= tx.valor || 0;
                }
            }
        }

        return Math.max(0, saldo);
    }


    // ----------------------------------------------------------------
    // Exporta o estado atual da blockchain
    // Usado para sincronizar com outros nós (Fase 2)
    // ----------------------------------------------------------------
    exportar() {
        return {
            config:  CONFIG_BLOCKCHAIN,
            cadeia:  this.cadeia,
            mempool: this.mempool,
            stats:   this.stats,
        };
    }


    // ----------------------------------------------------------------
    // Importa uma blockchain de outro nó
    // Aceita apenas se for mais longa E válida que a atual
    // (Regra do consenso: a cadeia mais longa vence)
    // ----------------------------------------------------------------
    importar(dadosExternos) {
        const cadeiaExterna = dadosExternos.cadeia;

        // Só aceita se for mais longa
        if (cadeiaExterna.length <= this.cadeia.length) {
            return { aceita: false, motivo: 'Cadeia externa não é mais longa.' };
        }

        // Valida a cadeia externa antes de aceitar
        const blockchain = new Blockchain();
        blockchain.cadeia = cadeiaExterna;
        const validacao   = blockchain.validarCadeia();

        if (!validacao.valida) {
            return { aceita: false, motivo: validacao.motivo };
        }

        // Aceita a cadeia mais longa e válida
        const blocosNovos = cadeiaExterna.length - this.cadeia.length; // antes de reatribuir — senão dá sempre 0
        this.cadeia = cadeiaExterna;
        this.stats.totalBlocos     = cadeiaExterna.length;
        this.stats.totalTransacoes = cadeiaExterna.reduce(
            (total, bloco) => total + bloco.transacoes.length, 0
        );

        return { aceita: true, blocosNovos };
    }


    // Retorna informações resumidas da blockchain
    getInfo() {
        return {
            rede:             CONFIG_BLOCKCHAIN.NOME_REDE,
            simbolo:          CONFIG_BLOCKCHAIN.SIMBOLO,
            versao:           CONFIG_BLOCKCHAIN.VERSAO,
            totalBlocos:      this.cadeia.length,
            totalTransacoes:  this.stats.totalTransacoes,
            dificuldade:      this.stats.dificuldadeAtual,
            mempoolSize:      this.mempool.length,
            ultimoBlocoHash:  this.ultimoBloco.hash.slice(0, 16) + '...',
            ultimoBlocoIdx:   this.ultimoBloco.indice,
            iniciadaEm:       this.stats.iniciadaEm,
        };
    }
}


// ================================================================
// BLOCO 6: INSTÂNCIA SINGLETON
//
// O que é Singleton?
//   Um padrão de design onde apenas UMA instância da classe existe.
//   Todo o servidor compartilha a mesma blockchain.
//   Se criássemos múltiplas instâncias, cada uma teria
//   uma cadeia diferente — inconsistência grave.
//
// Como funciona:
//   Exportamos a instância já criada, não a classe.
//   Qualquer arquivo que importar 'blockchain' receberá
//   a mesma instância — o Node.js faz isso automaticamente
//   através do sistema de cache de módulos.
//
// Em Fase 2 (descentralizada):
//   Cada nó terá sua própria instância.
//   Elas se sincronizarão via protocolo P2P.
// ================================================================

export const blockchain = new Blockchain();

// Recarrega do Firestore antes de qualquer outro módulo terminar de
// importar isto — mesmo padrão de top-level await já usado em
// firebase-admin.js, garante que quem importar `blockchain` já recebe
// a cadeia real (ou o gênesis recém-persistido, na primeira execução).
await blockchain.carregarDoFirestore();

// Log inicial para confirmar que a blockchain foi iniciada
console.log('₿C Blockchain iniciada:', blockchain.getInfo());
