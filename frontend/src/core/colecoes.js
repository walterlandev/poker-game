/* ================================================================
   ARQUIVO: frontend/src/core/colecoes.js

   Coleções de baralho desenhadas em SVG (aprovadas em 07/11/2026,
   prévia em frontend/design-preview/colecoes/). Cada coleção define
   cores, fonte, emblemas das figuras (J, Q, K) e o verso. As 52 cartas
   saem daqui: valor + naipe no estilo da coleção.

   O layout da face é pensado para carta PEQUENA (46–56 px na mesa):
   valor e naipe grandes no canto superior esquerdo e um naipe grande
   (ou o emblema, nas figuras) no canto inferior direito.

   Os SVGs são montados só com dados deste arquivo (nada vem do
   usuário), por isso podem ir em dangerouslySetInnerHTML.
================================================================ */

// ---------- naipes (viewBox 0 0 100 100) ----------
const NAIPE_PATH = {
    '♠': 'M50 4C50 4 8 40 8 62c0 17 19 25 34 15-2 9-6 15-12 19h40c-6-4-10-10-12-19 15 10 34 2 34-15C92 40 50 4 50 4Z',
    '♥': 'M50 93C50 93 5 61 5 33 5 17 17 6 31 6c9 0 16 6 19 12 3-6 10-12 19-12 14 0 26 11 26 27 0 28-45 60-45 60Z',
    '♦': 'M50 3 89 50 50 97 11 50Z',
    '♣': 'M50 6a20 20 0 0 0-19 27 20 20 0 1 0 12 34c-2 12-6 20-13 27h40c-7-7-11-15-13-27a20 20 0 1 0 12-34A20 20 0 0 0 50 6Z',
};

function naipe(simbolo, x, y, s, cor, filtro = '') {
    return `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${s / 100})" ${filtro}><path d="${NAIPE_PATH[simbolo]}" fill="${cor}"/></g>`;
}

// ---------- emblemas das figuras (centrados em 0,0; ~120 de largura) ----------
const EMB = {
    // Riviera Noir
    taca:    (c, c2) => `<path d="M-40-46H40L4 2V36H22V44H-22V36H-4V2Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/><path d="M-26-32H26L0-6Z" fill="${c2}"/><circle cx="18" cy="-38" r="7" fill="${c2}"/>`,
    gravata: (c, c2) => `<path d="M-50-24 0 0-50 24Z M50-24 0 0 50 24Z" fill="${c}"/><rect x="-10" y="-12" width="20" height="24" rx="4" fill="${c2}"/>`,
    perolas: (c) => Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.15 + 0.7 * i / 10); return `<circle cx="${(Math.cos(a) * -50).toFixed(1)}" cy="${(Math.sin(a) * 42 - 20).toFixed(1)}" r="7.5" fill="${c}"/>`; }).join('') + `<circle cx="0" cy="34" r="12" fill="${c}"/>`,
    // Satoshi
    chave:   (c, c2) => `<circle cx="-26" cy="0" r="22" fill="none" stroke="${c}" stroke-width="8"/><circle cx="-26" cy="0" r="7" fill="${c2}"/><path d="M-4 0H52M30 0V18M44 0V14" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`,
    moeda:   (c, c2) => `<circle r="46" fill="none" stroke="${c}" stroke-width="8"/><circle r="35" fill="none" stroke="${c}" stroke-width="2.5" stroke-dasharray="4 5"/><text y="21" text-anchor="middle" font-family="'Chakra Petch', sans-serif" font-weight="700" font-size="60" fill="${c2}">₿</text>`,
    blocos:  (c) => [[-32, 14], [0, -16], [32, 14]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0-19 17-10V10L0 19-17 10V-10Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/><path d="M-17-10 0 0 17-10M0 0V19" stroke="${c}" stroke-width="3.5" fill="none"/></g>`).join(''),
    // Las Vegas 1970
    ficha:   (c, c2) => `<circle r="46" fill="${c}"/>${Array.from({ length: 8 }, (_, i) => `<rect x="-7" y="-46" width="14" height="16" fill="${c2}" transform="rotate(${i * 45})"/>`).join('')}<circle r="28" fill="${c2}"/><circle r="22" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="5 4"/>`,
    dados:   (c, c2) => `<g transform="rotate(-14 -18 0)"><rect x="-58" y="-30" width="56" height="56" rx="11" fill="${c}"/>${[[-43, -15], [-16, 11], [-29.5, -2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${c2}"/>`).join('')}</g><g transform="rotate(12 26 6)"><rect x="2" y="-20" width="56" height="56" rx="11" fill="${c2}" stroke="${c}" stroke-width="5"/>${[[16, -6], [44, -6], [16, 22], [44, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${c}"/>`).join('')}</g>`,
    cerejas: (c, c2) => `<path d="M-20 18C-14-14 0-30 18-40M22 22C18-6 14-26 18-40" stroke="${c2}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M18-40c10-6 26-4 32 4-12 6-24 4-32-4Z" fill="${c2}"/><circle cx="-22" cy="28" r="21" fill="${c}"/><circle cx="24" cy="32" r="21" fill="${c}"/>`,
    // Cyber Neon
    raio:    (c, c2) => `<path d="M12-52-30 6H0L-14 52 32-10H2Z" fill="${c2}" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>`,
    viseira: (c, c2) => `<path d="M-54 4C-42-28 42-28 54 4L42 22H-42Z" fill="none" stroke="${c}" stroke-width="6"/><path d="M-38 2H38L30 13H-30Z" fill="${c2}"/><path d="M-60 38H60" stroke="${c}" stroke-width="4" stroke-dasharray="10 6"/>`,
    losango: (c, c2) => `<path d="M0-52 42 0 0 52-42 0Z" fill="none" stroke="${c}" stroke-width="6"/><path d="M0-31 25 0 0 31-25 0Z" fill="${c2}"/>`,
    // Ouro Imperial
    cetro:   (c, c2) => `<path d="M0-30V56" stroke="${c}" stroke-width="9" stroke-linecap="round"/><circle cx="0" cy="-38" r="14" fill="${c2}" stroke="${c}" stroke-width="5"/><path d="M-22-14H22" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M0-58V-66" stroke="${c}" stroke-width="5"/>`,
    coroa:   (c, c2) => `<path d="M-52 26-58-30-27 2 0-42 27 2 58-30 52 26Z" fill="${c}" stroke="${c2}" stroke-width="4" stroke-linejoin="round"/><rect x="-54" y="26" width="108" height="13" rx="3" fill="${c2}"/><circle cx="0" cy="-46" r="7" fill="${c2}"/>`,
    tiara:   (c, c2) => `<path d="M-56 22C-42-6-20-20 0-34 20-20 42-6 56 22Z" fill="none" stroke="${c}" stroke-width="6"/>${[-34, -17, 0, 17, 34].map((x, i) => `<path d="M${x} ${18 - [6, 22, 40, 22, 6][i]}l8 11-8 11-8-11Z" fill="${c2}"/>`).join('')}<path d="M-58 27H58" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`,
    // Tropical Brasil
    folha:   (c, c2) => `<path d="M0 56C-50 30-54-30 0-56 54-30 50 30 0 56Z" fill="${c}"/><path d="M0 56V-46M0 20-26 0M0 0 26-20M0-20-22-34M0 36 24 18" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    sol:     (c, c2) => Array.from({ length: 12 }, (_, i) => `<path d="M0-60 8-41H-8Z" fill="${c2}" transform="rotate(${i * 30})"/>`).join('') + `<circle r="34" fill="${c}"/>`,
    hibisco: (c, c2) => Array.from({ length: 5 }, (_, i) => `<ellipse cx="0" cy="-29" rx="22" ry="31" fill="${c}" transform="rotate(${i * 72})"/>`).join('') + `<circle r="13" fill="${c2}"/><path d="M0 0 22-34" stroke="${c2}" stroke-width="5"/><circle cx="22" cy="-36" r="6" fill="${c2}"/>`,
};

// ---------- versos (viewBox 0 0 250 350) ----------
const raiosRiviera = Array.from({ length: 36 }, (_, i) => `<path d="M125 175 L${(125 + Math.cos(i * Math.PI / 18) * 260).toFixed(1)} ${(175 + Math.sin(i * Math.PI / 18) * 260).toFixed(1)}" stroke="#c9a24f" stroke-width="${i % 2 ? 0.8 : 2}" opacity=".55"/>`).join('');
const roletaRiviera = Array.from({ length: 24 }, (_, i) => { const p = (k) => `${(125 + Math.cos(k * Math.PI / 12) * 46).toFixed(1)} ${(175 + Math.sin(k * Math.PI / 12) * 46).toFixed(1)}`; return `<path d="M125 175 L${p(i)} A46 46 0 0 1 ${p(i + 1)}Z" fill="${i % 2 ? '#8e1c26' : '#151313'}"/>`; }).join('');
const trilhasSatoshi = Array.from({ length: 14 }, (_, i) => { const y = 30 + i * 22, x1 = 20 + (i * 37) % 60, x2 = 230 - (i * 53) % 70; return `<path d="M${x1} ${y}H${x1 + 40}l12 12H${x2}" stroke="#f7931a" stroke-width="1.6" fill="none" opacity=".45"/><circle cx="${x1}" cy="${y}" r="3" fill="#f7931a" opacity=".7"/>`; }).join('');
const lampadasVegas = Array.from({ length: 26 }, (_, i) => { const a = i / 26 * Math.PI * 2; return `<circle cx="${(125 + Math.cos(a) * 70).toFixed(1)}" cy="${(175 + Math.sin(a) * 92).toFixed(1)}" r="4.5" fill="#ffd66b" stroke="#c8102e" stroke-width="1"/>`; }).join('');
const gradeCyber = [
    ...Array.from({ length: 11 }, (_, i) => `<path d="M125 205 L${-125 + i * 50} 350" stroke="#21e6f2" stroke-width="1.6" opacity=".7"/>`),
    ...[212, 224, 242, 268, 304].map(y => `<path d="M0 ${y}H250" stroke="#21e6f2" stroke-width="1.6" opacity=".7"/>`),
].join('');
const ondasBrasil = Array.from({ length: 12 }, (_, i) => { const y = 60 + i * 22; return `<path d="M-10 ${y} Q 20 ${y - 12} 50 ${y} T 110 ${y} T 170 ${y} T 230 ${y} T 290 ${y}" stroke="#1b1b1b" stroke-width="9" fill="none"/>`; }).join('');

const VERSOS = {
    rivieraNoir: `<rect width="250" height="350" fill="#0e0d0c"/>${raiosRiviera}
        <rect x="14" y="14" width="222" height="322" rx="6" fill="none" stroke="#c9a24f" stroke-width="3"/>
        <circle cx="125" cy="175" r="62" fill="#0e0d0c" stroke="#c9a24f" stroke-width="4"/>${roletaRiviera}
        <circle cx="125" cy="175" r="18" fill="#c9a24f"/>`,
    satoshi: `<rect width="250" height="350" fill="#1a1c1f"/>${trilhasSatoshi}
        <rect x="12" y="12" width="226" height="326" rx="8" fill="none" stroke="#f7931a" stroke-width="3"/>
        <path d="M125 113 179 144V206L125 237 71 206V144Z" fill="#1a1c1f" stroke="#f7931a" stroke-width="5"/>
        <text x="125" y="200" text-anchor="middle" font-family="'Chakra Petch', sans-serif" font-weight="700" font-size="74" fill="#f7931a">₿</text>`,
    lasVegas: `<rect width="250" height="350" fill="#c8102e"/>
        ${Array.from({ length: 13 }, (_, i) => `<path d="M${-175 + i * 40} 0 L${175 + i * 40 - 175} 350" stroke="#a50d26" stroke-width="14"/><path d="M${i * 40 + 75} 0 L${i * 40 - 275} 350" stroke="#a50d26" stroke-width="14"/>`).join('')}
        <rect x="12" y="12" width="226" height="326" rx="10" fill="none" stroke="#fbf3e2" stroke-width="7"/>
        <ellipse cx="125" cy="175" rx="82" ry="104" fill="#fbf3e2"/>${lampadasVegas}
        <text x="125" y="165" text-anchor="middle" font-family="Righteous, sans-serif" font-size="34" fill="#c8102e">LUCKY</text>
        <text x="125" y="205" text-anchor="middle" font-family="Righteous, sans-serif" font-size="40" fill="#1d1a17">₿C</text>`,
    cyberNeon: `<rect width="250" height="350" fill="#0b0518"/>
        <defs><clipPath id="col-sol-cyber"><circle cx="125" cy="150" r="62"/></clipPath></defs>
        <g clip-path="url(#col-sol-cyber)"><rect x="60" y="86" width="130" height="28" fill="#ff3fb4"/>${[0, 1, 2, 3, 4, 5].map(i => `<rect x="60" y="${118 + i * 16}" width="130" height="${10 - i}" fill="#ff3fb4"/>`).join('')}</g>
        ${gradeCyber}
        <rect x="12" y="12" width="226" height="326" rx="8" fill="none" stroke="#ff3fb4" stroke-width="4"/>`,
    ouroImperial: `<rect width="250" height="350" fill="#5e0f1c"/>
        ${Array.from({ length: 7 }, (_, cx) => Array.from({ length: 10 }, (_, cy) => `<g transform="translate(${cx * 36 + 18} ${cy * 36 + 18})"><path d="M0-14C6-6 6 6 0 14-6 6-6-6 0-14ZM-14 0C-6-6 6-6 14 0 6 6-6 6-14 0Z" fill="none" stroke="#c99a3c" stroke-width="1.3" opacity=".7"/></g>`).join('')).join('')}
        <rect x="12" y="12" width="226" height="326" rx="6" fill="none" stroke="#d4a640" stroke-width="6"/>
        <ellipse cx="125" cy="175" rx="58" ry="74" fill="#5e0f1c" stroke="#d4a640" stroke-width="5"/>
        <g transform="translate(125 168) scale(.62)">${EMB.coroa('#d4a640', '#5e0f1c')}</g>`,
    tropicalBrasil: `<rect width="250" height="350" fill="#009c3b"/>
        <rect x="12" y="12" width="226" height="326" rx="10" fill="#f5f0e3"/>
        <svg x="12" y="12" width="226" height="326" viewBox="12 12 226 326">${ondasBrasil}</svg>
        <rect x="12" y="12" width="226" height="326" rx="10" fill="none" stroke="#009c3b" stroke-width="8"/>
        <path d="M125 104 205 175 125 246 45 175Z" fill="#ffdf00" stroke="#009c3b" stroke-width="5"/>
        <circle cx="125" cy="175" r="38" fill="#0b3d91"/>
        <path d="M89 168C110 160 142 162 161 176" stroke="#fff" stroke-width="5" fill="none"/>`,
};

// ---------- catálogo ----------
// preto = cor de ♠ e ♣; vermelho = cor de ♥ e ♦
export const COLECOES = {
    rivieraNoir: {
        fonte: "'Bodoni Moda', serif", peso: 800,
        face: '#f6efdf', moldura: '#b8913f', preto: '#151313', vermelho: '#8e1c26',
        J: ['taca', '#151313', '#8e1c26'], Q: ['perolas', '#b8913f'], K: ['gravata', '#151313', '#b8913f'],
    },
    satoshi: {
        fonte: "'Chakra Petch', sans-serif", peso: 700,
        face: '#202326', moldura: '#f7931a', preto: '#eae6df', vermelho: '#f7931a',
        J: ['chave', '#f7931a', '#eae6df'], Q: ['blocos', '#f7931a'], K: ['moeda', '#f7931a', '#eae6df'],
    },
    lasVegas: {
        fonte: 'Righteous, sans-serif', peso: 400,
        face: '#fbf3e2', moldura: '#c8102e', preto: '#1d1a17', vermelho: '#c8102e',
        J: ['ficha', '#1d1a17', '#fbf3e2'], Q: ['cerejas', '#c8102e', '#1f6b3a'], K: ['dados', '#c8102e', '#fbf3e2'],
    },
    cyberNeon: {
        fonte: 'Audiowide, sans-serif', peso: 400, brilho: true,
        face: '#120a26', moldura: '#21e6f2', preto: '#21e6f2', vermelho: '#ff3fb4',
        J: ['raio', '#21e6f2', '#ff3fb4'], Q: ['losango', '#ff3fb4', '#21e6f2'], K: ['viseira', '#21e6f2', '#ff3fb4'],
    },
    ouroImperial: {
        fonte: "'Cinzel Decorative', serif", peso: 900,
        face: '#f4e7c8', moldura: '#a8822f', preto: '#1f1712', vermelho: '#7a1424',
        J: ['cetro', '#a8822f', '#7a1424'], Q: ['tiara', '#7a1424', '#d4a640'], K: ['coroa', '#d4a640', '#7a1424'],
    },
    tropicalBrasil: {
        fonte: "'Bricolage Grotesque', sans-serif", peso: 800,
        face: '#ffffff', moldura: '#009c3b', preto: '#0b3d91', vermelho: '#00873a',
        J: ['folha', '#00873a', '#ffffff'], Q: ['hibisco', '#e8457a', '#ffdf00'], K: ['sol', '#ffdf00', '#f2a900'],
    },
};

export function ehColecao(temaId) {
    return Object.prototype.hasOwnProperty.call(COLECOES, temaId);
}

const VALORES_OK = new Set(['A', 'K', 'Q', 'J', 'T', '10', '9', '8', '7', '6', '5', '4', '3', '2']);

const BRILHO = '<defs><filter id="col-brilho" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

/** Conteúdo SVG (viewBox 0 0 250 350) da face de uma carta da coleção. */
export function svgFace(temaId, valor, simbolo) {
    const c = COLECOES[temaId];
    // Lista fechada: só valores e naipes conhecidos entram no SVG (o valor
    // vem do servidor; nada fora desta lista chega ao innerHTML).
    if (!c || !VALORES_OK.has(String(valor)) || !NAIPE_PATH[simbolo]) return '';
    const cor    = simbolo === '♠' || simbolo === '♣' ? c.preto : c.vermelho;
    const filtro = c.brilho ? 'filter="url(#col-brilho)"' : '';
    const rotulo = valor === 'T' ? '10' : valor;
    const fs     = rotulo.length > 1 ? 96 : 118;
    const fig    = c[rotulo];
    const destaque = fig
        ? `<g transform="translate(160 248) scale(1.18)" ${filtro}>${EMB[fig[0]](fig[1], fig[2])}</g>`
        : naipe(simbolo, 172, 262, 132, cor, filtro);
    return `${c.brilho ? BRILHO : ''}<rect width="250" height="350" fill="${c.face}"/>
        <rect x="9" y="9" width="232" height="332" rx="14" fill="none" stroke="${c.moldura}" stroke-width="4" opacity=".75"/>
        <text x="26" y="${rotulo.length > 1 ? 104 : 116}" font-family="${c.fonte}" font-weight="${c.peso}" font-size="${fs}" letter-spacing="${rotulo.length > 1 ? -6 : 0}" fill="${cor}" ${filtro}>${rotulo}</text>
        ${naipe(simbolo, 62, 164, 66, cor, filtro)}${destaque}`;
}

/** Conteúdo SVG (viewBox 0 0 250 350) do verso da coleção. */
export function svgVerso(temaId) {
    return VERSOS[temaId] || '';
}
