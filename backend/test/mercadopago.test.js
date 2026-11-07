import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { assinaturaWebhookValida } from '../wallet/assinatura-mp.js';

// Formato oficial do Mercado Pago: HMAC-SHA256 (chave secreta) de
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", enviado em x-signature "ts=...,v1=..."
const secret = 'segredo-de-teste';
function assinar(dataId, requestId, ts) {
    const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
    return `ts=${ts},v1=${v1}`;
}

test('aceita a assinatura no formato oficial do Mercado Pago', () => {
    const xSignature = assinar('123456789', 'req-abc', '1704908010');
    assert.equal(assinaturaWebhookValida({ secret, xSignature, xRequestId: 'req-abc', dataId: '123456789' }), true);
});

test('recusa assinatura de outro pagamento ou com chave errada', () => {
    const xSignature = assinar('123456789', 'req-abc', '1704908010');
    assert.equal(assinaturaWebhookValida({ secret, xSignature, xRequestId: 'req-abc', dataId: '999' }), false);
    assert.equal(assinaturaWebhookValida({ secret: 'outra', xSignature, xRequestId: 'req-abc', dataId: '123456789' }), false);
    assert.equal(assinaturaWebhookValida({ secret, xSignature: 'lixo', xRequestId: 'req-abc', dataId: '123456789' }), false);
    assert.equal(assinaturaWebhookValida({ secret, xSignature: undefined, xRequestId: 'req-abc', dataId: '123456789' }), false);
});

test('id alfanumérico entra em minúsculas (regra do Mercado Pago)', () => {
    const xSignature = assinar('abc123', 'r1', '1');
    assert.equal(assinaturaWebhookValida({ secret, xSignature, xRequestId: 'r1', dataId: 'ABC123' }), true);
});
