/* ================================================================
   ARQUIVO: backend/wallet/redefinir-pin.js

   "Esqueci o PIN": o jogador prova que é o dono da conta entrando de
   novo (Google ou senha) e o servidor confere o token do Firebase.
   auth_time é assinado pelo Google: o cliente não consegue forjar um
   login recente. Funções puras, testadas em test/redefinir-pin.test.js.
================================================================ */

export const JANELA_REAUTENTICACAO_MS = 5 * 60 * 1000;

/** Mesmas regras da tela (AlterarPin.jsx), checadas de novo no servidor. */
export function validarPinNovo(pin) {
    const p = typeof pin === 'string' ? pin : '';
    if (p.length < 6 || p.length > 64)  return 'O PIN precisa ter de 6 a 64 caracteres.';
    if (!/[A-Z]/.test(p))               return 'O PIN precisa de pelo menos 1 letra maiúscula.';
    if (!/[0-9]/.test(p))               return 'O PIN precisa de pelo menos 1 número.';
    if (!/[^A-Za-z0-9]/.test(p))        return 'O PIN precisa de pelo menos 1 símbolo.';
    return null;
}

/**
 * decoded: token já verificado pelo Admin SDK. uidSocket: dono da conexão.
 * Só aceita se o token é da mesma conta e o login foi feito há pouco.
 */
export function checarReautenticacao(decoded, uidSocket, agoraMs = Date.now()) {
    if (!decoded || !uidSocket || decoded.uid !== uidSocket) {
        return 'Não foi possível confirmar sua identidade.';
    }
    const loginMs = Number(decoded.auth_time) * 1000;
    if (!Number.isFinite(loginMs) || loginMs <= 0 || agoraMs - loginMs > JANELA_REAUTENTICACAO_MS) {
        return 'Confirme sua identidade de novo e tente em seguida.';
    }
    return null;
}
