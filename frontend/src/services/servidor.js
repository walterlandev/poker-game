// Endereço do servidor do jogo (API + Socket.io).
// Em produção o site é servido pelo próprio servidor, no mesmo domínio
// (btcpokerclub.online), então usa a origem da página. Em desenvolvimento
// usa VITE_SERVER_URL (frontend/.env.local) ou o backend local na 3001.
export const SERVER_URL = import.meta.env.DEV
    ? (import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
    : window.location.origin;
