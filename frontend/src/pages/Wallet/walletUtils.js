/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/walletUtils.js

   CONCEITO GERAL:
   Centraliza TODA a lógica financeira da carteira.
   Nenhum componente deve fazer cálculos de dinheiro fora daqui.

   COTAÇÃO FIXA:
     R$ 1,00  =  ₿C 1.000
     ₿C 1.000 =  R$ 1,00

   TAXAS:
     Depósito : 5%  sobre o valor em R$ (cobrada em R$)
     Saque    : 3%  sobre o valor em R$ equivalente (descontada do valor sacado)
     Envio    : 1%  sobre o valor em ₿C (cobrada em ₿C, mínimo ₿C 10)

   LIMITES:
     Depósito mínimo     : R$ 1,00   → ₿C 1.000
     Depósito máximo     : R$ 500,00 → ₿C 500.000  (por transação)
     Saque mínimo        : ₿C 5.000  → R$ 5,00
     Saque máximo diário : ₿C 500.000 → R$ 500,00
     Envio mínimo        : ₿C 100
     Envio máximo        : ₿C 100.000 (por transação)
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES GLOBAIS
// Altere aqui para ajustar o sistema inteiro de uma vez.
// ================================================================

export const COTACAO = {
    BC_POR_REAL: 1000,       // 1 real = 1000 ₿C
};

export const TAXAS = {
    DEPOSITO:  0.05,         // 5% sobre R$ (cobrada em R$ além do valor)
    SAQUE:     0.03,         // 3% sobre R$ equivalente (descontada do valor)
    ENVIO:     0.01,         // 1% sobre ₿C enviados
    ENVIO_MIN: 10,           // taxa mínima de envio em ₿C
};

export const LIMITES = {
    DEPOSITO_MIN_BRL:    1.00,
    DEPOSITO_MAX_BRL:  500.00,
    SAQUE_MIN_BC:      5_000,
    SAQUE_MAX_DIARIO_BC: 500_000,
    ENVIO_MIN_BC:        100,
    ENVIO_MAX_BC:      100_000,
};

// Tipos de transação para o histórico
export const TIPO_TX = {
    DEPOSITO:    'deposito',
    SAQUE:       'saque',
    ENVIO:       'envio',
    RECEBIMENTO: 'recebimento',
    PREMIO:      'premio',
    COMPRA:      'compra',       // compra de tema, item na loja
    TAXA:        'taxa',
    BONUS:       'bonus',
};

// Labels legíveis para cada tipo
export const LABEL_TX = {
    deposito:    'Depósito',
    saque:       'Saque',
    envio:       'Envio',
    recebimento: 'Recebimento',
    premio:      'Prêmio de mesa',
    compra:      'Compra na loja',
    taxa:        'Taxa',
    bonus:       'Bônus',
};

// Ícone para cada tipo de transação
export const ICONE_TX = {
    deposito:    '⬇️',
    saque:       '⬆️',
    envio:       '➡️',
    recebimento: '⬅️',
    premio:      '🏆',
    compra:      '🛒',
    taxa:        '📋',
    bonus:       '🎁',
};


// ================================================================
// BLOCO 2: CONVERSÃO R$ ↔ ₿C
// ================================================================

/**
 * Converte reais para ₿C.
 * @param {number} brl - valor em reais
 * @returns {number} valor em ₿C (inteiro)
 */
export function brlParaBC(brl) {
    return Math.floor(brl * COTACAO.BC_POR_REAL);
}

/**
 * Converte ₿C para reais.
 * @param {number} bc - valor em ₿C
 * @returns {number} valor em reais (2 casas decimais)
 */
export function bcParaBRL(bc) {
    return parseFloat((bc / COTACAO.BC_POR_REAL).toFixed(2));
}


// ================================================================
// BLOCO 3: CÁLCULO DE DEPÓSITO
// ================================================================

/**
 * Calcula os valores de um depósito com base no valor em R$.
 *
 * @param {number} valorBRL - valor que o jogador quer depositar (em R$)
 * @returns {object} breakdown completo do depósito
 *
 * Exemplo: depositar R$ 10,00
 *   taxa     = R$ 0,50   (5%)
 *   totalBRL = R$ 10,50  (o jogador paga isso)
 *   bc       = ₿C 10.000 (o que entra na carteira)
 */
export function calcularDeposito(valorBRL) {
    const valor = parseFloat(valorBRL) || 0;
    const taxa  = parseFloat((valor * TAXAS.DEPOSITO).toFixed(2));
    const total = parseFloat((valor + taxa).toFixed(2));
    const bc    = brlParaBC(valor);

    return {
        valorBRL:   valor,   // valor base que o jogador quer depositar
        taxaBRL:    taxa,    // taxa cobrada em R$
        totalBRL:   total,   // total que sai do bolso do jogador
        bcRecebido: bc,      // ₿C creditados na carteira
        taxaPerc:   TAXAS.DEPOSITO * 100,
    };
}


// ================================================================
// BLOCO 4: CÁLCULO DE SAQUE
// ================================================================

/**
 * Calcula os valores de um saque com base em ₿C.
 *
 * @param {number} valorBC - quantidade de ₿C que o jogador quer sacar
 * @returns {object} breakdown completo do saque
 *
 * Exemplo: sacar ₿C 10.000 (= R$ 10,00)
 *   taxa    = R$ 0,30  (3%)
 *   líquido = R$ 9,70  (o que o jogador recebe)
 *   bcDebitado = ₿C 10.000
 */
export function calcularSaque(valorBC) {
    const bc          = Math.floor(parseFloat(valorBC) || 0);
    const brlBruto    = bcParaBRL(bc);
    const taxaBRL     = parseFloat((brlBruto * TAXAS.SAQUE).toFixed(2));
    const brlLiquido  = parseFloat((brlBruto - taxaBRL).toFixed(2));

    return {
        bcDebitado:  bc,           // ₿C debitados da carteira
        brlBruto:    brlBruto,     // equivalente em R$ sem taxa
        taxaBRL:     taxaBRL,      // taxa descontada em R$
        brlLiquido:  brlLiquido,   // valor líquido recebido pelo jogador
        taxaPerc:    TAXAS.SAQUE * 100,
    };
}


// ================================================================
// BLOCO 5: CÁLCULO DE ENVIO (P2P)
// ================================================================

/**
 * Calcula os valores de um envio de ₿C entre jogadores.
 *
 * @param {number} valorBC - ₿C que o remetente quer enviar
 * @returns {object} breakdown do envio
 *
 * Exemplo: enviar ₿C 1.000
 *   taxa        = max(₿C 10, 1% de 1000) = ₿C 10
 *   totalDebitado = ₿C 1.010
 *   destinatário recebe ₿C 1.000
 */
export function calcularEnvio(valorBC) {
    const bc         = Math.floor(parseFloat(valorBC) || 0);
    const taxaCalc   = Math.ceil(bc * TAXAS.ENVIO);
    const taxaBC     = Math.max(taxaCalc, TAXAS.ENVIO_MIN);
    const totalDebitado = bc + taxaBC;

    return {
        bcEnviado:      bc,            // ₿C que o destinatário recebe
        taxaBC:         taxaBC,        // taxa em ₿C cobrada do remetente
        totalDebitado:  totalDebitado, // total debitado da carteira do remetente
        taxaPerc:       TAXAS.ENVIO * 100,
    };
}


// ================================================================
// BLOCO 6: VALIDAÇÕES
// ================================================================

/**
 * Valida um valor de depósito em R$.
 * @param {number} valorBRL
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarDeposito(valorBRL) {
    const v = parseFloat(valorBRL) || 0;
    if (v < LIMITES.DEPOSITO_MIN_BRL)
        return { valido: false, erro: `Depósito mínimo: R$ ${fmt(LIMITES.DEPOSITO_MIN_BRL)}` };
    if (v > LIMITES.DEPOSITO_MAX_BRL)
        return { valido: false, erro: `Depósito máximo por transação: R$ ${fmt(LIMITES.DEPOSITO_MAX_BRL)}` };
    return { valido: true, erro: null };
}

/**
 * Valida um valor de saque em ₿C.
 * @param {number} valorBC
 * @param {number} saldoBC       - saldo atual do jogador
 * @param {number} sacadoHojeBC  - quanto já foi sacado hoje
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarSaque(valorBC, saldoBC, sacadoHojeBC = 0) {
    const v = Math.floor(parseFloat(valorBC) || 0);
    if (v < LIMITES.SAQUE_MIN_BC)
        return { valido: false, erro: `Saque mínimo: ₿C ${fmtBC(LIMITES.SAQUE_MIN_BC)}` };
    if (v > saldoBC)
        return { valido: false, erro: 'Saldo insuficiente.' };
    if (sacadoHojeBC + v > LIMITES.SAQUE_MAX_DIARIO_BC)
        return { valido: false, erro: `Limite diário de saque: ₿C ${fmtBC(LIMITES.SAQUE_MAX_DIARIO_BC)}` };
    return { valido: true, erro: null };
}

/**
 * Valida um envio de ₿C entre jogadores.
 * @param {number} valorBC
 * @param {number} saldoBC - saldo atual do remetente
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarEnvio(valorBC, saldoBC) {
    const v     = Math.floor(parseFloat(valorBC) || 0);
    const envio = calcularEnvio(v);
    if (v < LIMITES.ENVIO_MIN_BC)
        return { valido: false, erro: `Envio mínimo: ₿C ${fmtBC(LIMITES.ENVIO_MIN_BC)}` };
    if (v > LIMITES.ENVIO_MAX_BC)
        return { valido: false, erro: `Envio máximo por transação: ₿C ${fmtBC(LIMITES.ENVIO_MAX_BC)}` };
    if (envio.totalDebitado > saldoBC)
        return { valido: false, erro: `Saldo insuficiente (inclui taxa de ₿C ${fmtBC(envio.taxaBC)}).` };
    return { valido: true, erro: null };
}

/**
 * Valida o PIN do jogador (formato: 4 a 6 dígitos numéricos).
 * A verificação real acontece no backend — aqui só valida o formato.
 * @param {string} pin
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarFormatoPin(pin) {
    if (!pin || typeof pin !== 'string')
        return { valido: false, erro: 'PIN inválido.' };
    if (!/^\d{4,6}$/.test(pin))
        return { valido: false, erro: 'PIN deve ter entre 4 e 6 dígitos numéricos.' };
    return { valido: true, erro: null };
}


// ================================================================
// BLOCO 7: FORMATAÇÃO
// ================================================================

/**
 * Formata número em reais (sem símbolo R$).
 * Ex: 10.5 → "10,50"
 */
export function fmt(n) {
    return Number(n).toLocaleString('pt-BR', {
        minimumFractionDigits:  2,
        maximumFractionDigits: 2,
    });
}

/**
 * Formata número em ₿C com separador de milhar.
 * Ex: 10000 → "10.000"
 */
export function fmtBC(n) {
    return Number(n).toLocaleString('pt-BR');
}

/**
 * Formata data/hora de uma transação.
 * @param {string|Date} data
 * @returns {string} ex: "11/04/2026 às 14:32"
 */
export function fmtData(data) {
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR') + ' às ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna a cor associada a um tipo de transação.
 * Verde = entrada de ₿C, Vermelho = saída, Amarelo = neutro/taxa
 */
export function corTipoTx(tipo) {
    const entradas = [TIPO_TX.DEPOSITO, TIPO_TX.RECEBIMENTO, TIPO_TX.PREMIO, TIPO_TX.BONUS];
    const saidas   = [TIPO_TX.SAQUE, TIPO_TX.ENVIO, TIPO_TX.COMPRA];
    if (entradas.includes(tipo)) return '#22C55E';   // verde
    if (saidas.includes(tipo))   return '#EF4444';   // vermelho
    return '#F59E0B';                                // amarelo (taxa, etc)
}

/**
 * Retorna sinal de uma transação: '+' para entradas, '-' para saídas.
 */
export function sinalTx(tipo) {
    const entradas = [TIPO_TX.DEPOSITO, TIPO_TX.RECEBIMENTO, TIPO_TX.PREMIO, TIPO_TX.BONUS];
    return entradas.includes(tipo) ? '+' : '-';
}


// ================================================================
// BLOCO 8: SUMÁRIO DO EXTRATO
// ================================================================

/**
 * Recebe array de transações e retorna um resumo.
 * @param {Array} transacoes
 * @returns {{ totalEntradas, totalSaidas, totalTaxas, saldoPeriodo }}
 */
export function resumoExtrato(transacoes = []) {
    let totalEntradas = 0;
    let totalSaidas   = 0;
    let totalTaxas    = 0;

    const entradas = [TIPO_TX.DEPOSITO, TIPO_TX.RECEBIMENTO, TIPO_TX.PREMIO, TIPO_TX.BONUS];
    const saidas   = [TIPO_TX.SAQUE, TIPO_TX.ENVIO, TIPO_TX.COMPRA];

    for (const tx of transacoes) {
        if (entradas.includes(tx.tipo)) totalEntradas += tx.valorBC || 0;
        if (saidas.includes(tx.tipo))   totalSaidas   += tx.valorBC || 0;
        // Taxa nunca vem como transação própria (tipo 'taxa' não existe no
        // backend) — vem como campo `taxaBC` dentro de cada transação.
        totalTaxas += tx.taxaBC || 0;
    }

    return {
        totalEntradas,
        totalSaidas,
        totalTaxas,
        saldoPeriodo: totalEntradas - totalSaidas - totalTaxas,
    };
}


// ================================================================
// BÔNUS DE BOAS-VINDAS
// Concedido uma única vez ao jogador no 1º acesso.
// Não pode ser sacado nem enviado — some se zerar nas mesas.
// ================================================================

export const BONUS = {
    VALOR_BC:      10_000,   // ₿C 10.000 = R$ 10,00 equivalente
    VALOR_BRL:     10.00,    // apenas para exibição
    PODE_SACAR:    false,    // nunca pode ser sacado
    PODE_ENVIAR:   false,    // nunca pode ser enviado P2P
    PODE_JOGAR:    true,     // pode usar em qualquer mesa
    EXPIRA_DIAS:   null,     // null = não expira por tempo
    SOME_SE_ZERAR: true,     // se perder tudo o bônus some definitivamente
    LABEL:         'Bônus de boas-vindas',
    DESCRICAO:     'Presente para você começar a jogar. Não pode ser sacado.',
};

/**
 * Retorna true se o jogador ainda tem bônus ativo.
 * @param {number} saldoBonus
 */
export function temBonus(saldoBonus) {
    return typeof saldoBonus === 'number' && saldoBonus > 0;
}

/**
 * Detalha o saldo separando real de bônus.
 * @param {number} saldoReal  - saldo de depósitos e prêmios (sacável)
 * @param {number} saldoBonus - saldo de bônus (não sacável)
 */
export function detalheSaldo(saldoReal = 0, saldoBonus = 0) {
    const total     = saldoReal + saldoBonus;
    const percBonus = total > 0 ? Math.round((saldoBonus / total) * 100) : 0;
    return { total, real: saldoReal, bonus: saldoBonus, percBonus };
}

/**
 * Valida saque usando APENAS saldo real — bônus nunca entra.
 * @param {number} valorBC
 * @param {number} saldoReal
 * @param {number} sacadoHojeBC
 */
export function validarSaqueReal(valorBC, saldoReal, sacadoHojeBC = 0) {
    const v = Math.floor(parseFloat(valorBC) || 0);
    if (v < LIMITES.SAQUE_MIN_BC)
        return { valido: false, erro: `Saque mínimo: ₿C ${fmtBC(LIMITES.SAQUE_MIN_BC)}` };
    if (v > saldoReal)
        return { valido: false, erro: 'Saldo real insuficiente. O bônus não pode ser sacado.' };
    if (sacadoHojeBC + v > LIMITES.SAQUE_MAX_DIARIO_BC)
        return { valido: false, erro: `Limite diário de saque: ₿C ${fmtBC(LIMITES.SAQUE_MAX_DIARIO_BC)}` };
    return { valido: true, erro: null };
}