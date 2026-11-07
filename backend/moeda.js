/* ================================================================
   ARQUIVO: backend/moeda.js

   Moeda da mesa / torneio: 'real' (saldo sacável) ou 'bonus' (saldoBonus,
   nunca sacável nem enviável). Funções puras — sem Firebase — para o
   servidor decidir e validar a moeda e planejar débitos e créditos.
   Spec: docs/superpowers/specs/2026-11-06-moeda-da-mesa-design.md
================================================================ */

export const MSG_MOEDA = {
    BOTS_SO_BONUS: 'Bots só jogam em mesa de bônus.',
};

const fmt = v => Number(v).toLocaleString('pt-BR');

export function msgSemSaldo(moeda, valor) {
    return moeda === 'bonus'
        ? `Esta mesa é de bônus. Você precisa de ₿C ${fmt(valor)} de bônus para entrar.`
        : `Esta mesa é de saldo real. Você precisa de ₿C ${fmt(valor)} de saldo real para entrar.`;
}

/**
 * Débito de entrada/rebuy na moeda da mesa: 'real' tira só de saldo,
 * 'bonus' só de saldoBonus. Nunca mistura; sem saldo na moeda, recusa.
 */
export function planejarDebito({ saldo = 0, saldoBonus = 0 } = {}, valor, moeda) {
    const m = normalizarMoeda(moeda);
    const disponivel = m === 'bonus' ? saldoBonus : saldo;
    if (disponivel < valor) return { sucesso: false, erro: msgSemSaldo(m, valor) };
    return {
        sucesso:         true,
        fichasDebitadas: valor,
        debitarReal:     m === 'bonus' ? 0 : valor,
        debitarBonus:    m === 'bonus' ? valor : 0,
    };
}

/**
 * Crédito de saída/prêmio/estorno na moeda da mesa. 'bonus': tudo em
 * saldoBonus. 'real': rede de segurança — a parte origemBonus (se por erro
 * houver bônus numa mesa real) volta como bônus, nunca como real.
 */
export function planejarCredito(fichas, moeda, origemBonus = 0) {
    const f = Math.max(0, Math.floor(Number(fichas)) || 0);
    if (normalizarMoeda(moeda) === 'bonus') return { real: 0, bonus: f };
    const bonus = Math.min(Math.max(Math.floor(Number(origemBonus)) || 0, 0), f);
    return { real: f - bonus, bonus };
}

/**
 * Envio de ₿C (wallet:enviar): só o saldo REAL sai da conta, e o
 * destinatário recebe só em real. Bônus nunca é enviável.
 * totalDebitado = valor + taxa; valorLiquido = o que o destinatário recebe.
 */
export function planejarEnvio({ saldo = 0 } = {}, totalDebitado, valorLiquido) {
    if (saldo < totalDebitado) {
        return { sucesso: false, erro: `Só o saldo real pode ser enviado. Seu saldo real é ₿C ${fmt(saldo)}.` };
    }
    return { sucesso: true, debitarReal: totalDebitado, debitarBonus: 0, creditarReal: valorLiquido, creditarBonus: 0 };
}

/** Qualquer valor diferente de 'bonus' vira 'real'. */
export function normalizarMoeda(moeda) {
    return moeda === 'bonus' ? 'bonus' : 'real';
}

/**
 * Decide a moeda de uma mesa nova a partir do config do cliente (o servidor
 * é quem decide). Bots só em bônus; cliente antigo (sem moeda, com bots)
 * vira bônus.
 */
export function decidirMoedaMesa(config = {}, qtdBots = 0) {
    if (config.moeda === undefined || config.moeda === null) {
        return { sucesso: true, moeda: qtdBots > 0 ? 'bonus' : 'real' };
    }
    const moeda = normalizarMoeda(config.moeda);
    if (moeda === 'real' && qtdBots > 0) return { sucesso: false, erro: MSG_MOEDA.BOTS_SO_BONUS };
    return { sucesso: true, moeda };
}

/**
 * Conversão de saldo REAL em bônus, só nesse sentido (bônus nunca vira
 * real). 1 ₿C real vira TAXA_CONVERSAO_BONUS ₿C de bônus. O valor é a
 * única entrada do cliente; o resto é calculado aqui.
 */
export const TAXA_CONVERSAO_BONUS = 10;
export const CONVERSAO_MAX_BC     = 1_000_000;

export function planejarConversaoBonus({ saldo = 0 } = {}, valor) {
    const v = Number(valor);
    if (!Number.isInteger(v) || v < 1 || v > CONVERSAO_MAX_BC) {
        return { sucesso: false, erro: `Informe um valor inteiro entre ₿C 1 e ₿C ${fmt(CONVERSAO_MAX_BC)}.` };
    }
    if ((Number(saldo) || 0) < v) {
        return { sucesso: false, erro: `Saldo real insuficiente. Seu saldo real é ₿C ${fmt(saldo)}.` };
    }
    return { sucesso: true, debitarReal: v, creditarBonus: v * TAXA_CONVERSAO_BONUS };
}

/**
 * Promoção de lançamento: toda conta que ainda não ganhou o bônus de
 * boas-vindas recebe ₿C 10.000 de bônus automaticamente ao entrar, até o
 * fim de 07/12/2026 (horário de Brasília). Depois disso, não há mais.
 */
export const BONUS_PROMO_FIM_MS = Date.parse('2026-12-08T00:00:00-03:00');

export function bonusBoasVindasAtivo(agoraMs = Date.now()) {
    return agoraMs < BONUS_PROMO_FIM_MS;
}
