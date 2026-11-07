/* ================================================================
   ARQUIVO: backend/wallet/assinatura-mp.js

   Validação da assinatura do webhook do Mercado Pago, no formato
   oficial: HMAC-SHA256, com a chave secreta do webhook, do texto
     "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
   comparado com o v1 do header x-signature ("ts=...,v1=...").
   data.id vem da query string (?data.id=...) e, se alfanumérico,
   entra em minúsculas. Sem x-request-id, esse trecho é omitido.

   Antes (até 07/11/2026) o texto saía sem o id e sem o request-id,
   então TODO webhook real era recusado e o PIX não era creditado.
================================================================ */

import crypto from 'crypto';

export function assinaturaWebhookValida({ secret, xSignature, xRequestId, dataId }) {
    if (!secret || !xSignature || typeof xSignature !== 'string') return false;
    const partes = {};
    for (const p of xSignature.split(',')) {
        const [k, ...v] = p.split('=');
        if (k) partes[k.trim()] = v.join('=').trim();
    }
    const { ts, v1 } = partes;
    if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;

    let manifesto = '';
    if (dataId !== undefined && dataId !== null && dataId !== '') manifesto += `id:${String(dataId).toLowerCase()};`;
    if (xRequestId) manifesto += `request-id:${xRequestId};`;
    manifesto += `ts:${ts};`;

    const esperado = crypto.createHmac('sha256', secret).update(manifesto).digest('hex');
    const a = Buffer.from(esperado, 'hex');
    const b = Buffer.from(v1, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
