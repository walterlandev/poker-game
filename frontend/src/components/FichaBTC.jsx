/* ================================================================
   ARQUIVO: frontend/src/components/FichaBTC.jsx

   A ficha ₿ da identidade "BTC Poker Club" (mesma arte da imagem de
   compartilhamento public/og-btcpokerclub.png), em SVG: fica nítida em
   qualquer tamanho. Usada no painel da tela de login. Só decoração.
================================================================ */

export default function FichaBTC({ className = '' }) {
    return (
        <svg className={className} viewBox="0 0 560 560" aria-hidden="true" focusable="false">
            <defs>
                <radialGradient id="ficha-face" cx="45%" cy="40%" r="70%">
                    <stop offset="0" stopColor="#3a2a1a" />
                    <stop offset="1" stopColor="#1b1612" />
                </radialGradient>
                <linearGradient id="ficha-borda" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffd27a" />
                    <stop offset=".5" stopColor="#d98a1c" />
                    <stop offset="1" stopColor="#7a4a10" />
                </linearGradient>
            </defs>

            {/* trilhas de circuito saindo da ficha */}
            <g stroke="#f7a531" strokeWidth="2.5" fill="none" opacity=".55">
                <path d="M60 150 H20" /><path d="M50 280 H0" /><path d="M60 410 H20" />
                <path d="M500 150 H540" /><path d="M510 280 H560" /><path d="M500 410 H540" />
                <path d="M280 50 V0" /><path d="M280 510 V560" />
            </g>

            <circle cx="280" cy="280" r="225" fill="url(#ficha-borda)" />
            <g fill="#141517">
                {[0, 45, 90, 135, 180, 225, 270, 315].map(g => (
                    <rect key={g} x="260" y="55" width="40" height="52" rx="6" transform={`rotate(${g} 280 280)`} />
                ))}
            </g>
            <circle cx="280" cy="280" r="160" fill="url(#ficha-face)" stroke="#ffd27a" strokeWidth="3" />
            <circle cx="280" cy="280" r="140" fill="none" stroke="#f7a531" strokeWidth="2" strokeDasharray="6 9" opacity=".8" />
            <text x="280" y="337" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="170" fill="#ffd27a">₿</text>
        </svg>
    );
}
