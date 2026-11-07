import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checarReautenticacao, validarPinNovo, JANELA_REAUTENTICACAO_MS } from '../wallet/redefinir-pin.js';

const agora = 1_800_000_000_000;
const tok = (uid, segAtras) => ({ uid, auth_time: Math.floor((agora - segAtras * 1000) / 1000) });

test('aceita login recente da mesma conta', () => {
    assert.equal(checarReautenticacao(tok('a', 30), 'a', agora), null);
});

test('recusa token de outra conta', () => {
    assert.ok(checarReautenticacao(tok('b', 30), 'a', agora));
});

test('recusa login antigo (sessão aberta há tempo não prova nada)', () => {
    assert.ok(checarReautenticacao(tok('a', JANELA_REAUTENTICACAO_MS / 1000 + 1), 'a', agora));
});

test('recusa token sem auth_time ou sem uid do socket', () => {
    assert.ok(checarReautenticacao({ uid: 'a' }, 'a', agora));
    assert.ok(checarReautenticacao(tok('a', 30), null, agora));
    assert.ok(checarReautenticacao(null, 'a', agora));
});

test('PIN novo segue as regras da tela', () => {
    assert.equal(validarPinNovo('Abc12!'), null);
    assert.ok(validarPinNovo('abc12!'));
    assert.ok(validarPinNovo('Abcdef!'));
    assert.ok(validarPinNovo('Abc123'));
    assert.ok(validarPinNovo('A1!'));
    assert.ok(validarPinNovo(123456));
});

// ── Trava de 24 h depois de redefinir o PIN ─────────────────────────
import { checarTravaPosRedefinicao, TRAVA_POS_REDEFINICAO_MS } from '../wallet/redefinir-pin.js';

test('sem redefinição de PIN, saque/envio liberados', () => {
    assert.equal(checarTravaPosRedefinicao({}, agora), null);
});

test('até 24 h depois de redefinir o PIN, saque/envio bloqueados', () => {
    const perfil = { pinRedefinidoEm: { toMillis: () => agora - 60 * 60 * 1000 } };
    assert.match(checarTravaPosRedefinicao(perfil, agora), /23 h/);
});

test('passadas 24 h, saque/envio liberados de novo', () => {
    const perfil = { pinRedefinidoEm: { toMillis: () => agora - TRAVA_POS_REDEFINICAO_MS - 1 } };
    assert.equal(checarTravaPosRedefinicao(perfil, agora), null);
});
