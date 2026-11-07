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
