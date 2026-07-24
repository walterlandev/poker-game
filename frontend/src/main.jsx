/* ================================================================
   ARQUIVO: frontend/src/main.jsx

   CONCEITO GERAL:
   É o ponto de entrada do React — o primeiro arquivo executado.
   Ele "monta" o componente App dentro do elemento #root do HTML.

   O QUE ELE FAZ:
   1. Importa o React e o método createRoot
   2. Importa os estilos globais (index.css)
   3. Importa o componente App
   4. Renderiza o App dentro do div#root do index.html

   STRICTMODE:
   O <StrictMode> é um wrapper do React que ajuda durante
   o desenvolvimento. Ele:
     → Detecta efeitos colaterais inesperados
     → Avisa sobre APIs depreciadas
     → Renderiza os componentes DUAS vezes em dev (para detectar bugs)
   Em produção ele é removido automaticamente — sem impacto.

   POR QUE createRoot E NÃO ReactDOM.render?
   createRoot é a API moderna do React 18+.
   Habilita funcionalidades como Concurrent Mode e Transitions.
   ReactDOM.render foi removido no React 19.
================================================================ */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// ================================================================
// ESTILOS GLOBAIS INLINE
//
// Por que não usar index.css?
//   O Vite gera um index.css com estilos do template padrão
//   que vão conflitar com o nosso design de poker.
//   Definir os estilos globais aqui garante que só o necessário
//   seja aplicado — sem resíduos do template.
//
// O que cada estilo faz:
//   box-sizing: border-box  → padding e border incluídos na largura
//                             sem isso, um elemento de 100px + 10px padding
//                             ficaria com 120px total — confuso e bugado
//   margin/padding: 0       → remove espaços padrão dos navegadores
//   font-family             → fonte padrão de todo o app
//   background              → fundo escuro base (evita flash branco ao carregar)
//   color                   → cor de texto padrão clara
//   -webkit-tap-highlight-color → remove o destaque azul ao tocar no mobile
// ================================================================

const estilosGlobais = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    height: 100%;
    width: 100%;
    overflow-x: hidden;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0f1e;
    color: #F8FAFC;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
  }

  /* Remove estilo padrão dos botões */
  button {
    font-family: inherit;
    font-size: inherit;
  }

  /* Remove estilo padrão dos inputs */
  input, select, textarea {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  /* Scrollbar fina no estilo dark para o lobby */
  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  /* Animação de fadeIn usada em vários componentes */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Animação de pulso usada no HandStrength */
  @keyframes pulsar {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  /* ================================================================
     Animações movidas de <style> soltos dentro de componentes que
     entram/saem do DOM (spinners, modal de PIN, troca AGUARDANDO→jogo
     ativo). Um <style> preso a um bloco condicional é desmontado e
     remontado junto com ele — em alguns navegadores (reproduzido no
     Chrome, celular e PC) isso coincidiu com um erro do React
     ('NotFoundError: insertBefore') bem no momento da troca. Aqui elas
     nunca desmontam, então esse risco desaparece.
     ================================================================ */

  @keyframes girar {
    to { transform: rotate(360deg); }
  }

  @keyframes agitar {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-8px); }
    40%     { transform: translateX(8px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.35; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  @keyframes winIn {
    from { opacity: 0; transform: translateY(-16px) scale(0.9); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes winGlow {
    0%,100% { box-shadow: 0 0 30px rgba(245,158,11,0.4); }
    50%      { box-shadow: 0 0 60px rgba(245,158,11,0.8); }
  }

  /* Layout da tela de jogo (era um <style> dentro do componente Game) */
  .game-pagina { max-width: 100vw; }
  @media (min-width: 900px) {
    .game-pagina {
      max-width:  920px;
      margin:     0 auto;
      border-left:  1px solid rgba(255,255,255,0.06);
      border-right: 1px solid rgba(255,255,255,0.06);
    }
  }

  /* Slider personalizado (usado no ActionBar e ModalCriarMesa) */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #7C3AED;
    cursor: pointer;
    box-shadow: 0 0 6px rgba(124, 58, 237, 0.5);
    transition: transform 0.1s;
  }

  input[type="range"]::-webkit-slider-thumb:active {
    transform: scale(1.2);
  }

  input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 50%;
    background: #7C3AED;
    cursor: pointer;
  }

  /* ================================================================
     ActionBar.jsx e HandStrength.jsx (movidos de <style> dentro do
     componente — ambos entram/saem do DOM a cada fold/all-in/mão nova,
     o mesmo padrão de risco de tela preta descrito acima).
     ================================================================ */

  .ab-root { font-family: sans-serif; }

  .ab-bar {
    background: #0d1424;
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 10px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Linha do slider: label + display + track + atalhos */
  .ab-raise-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ab-raise-label {
    font-size: 10px;
    color: rgba(255,255,255,0.30);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    flex-shrink: 0;
    width: 32px;
  }
  .ab-raise-val {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    flex-shrink: 0;
    min-width: 96px;
    text-align: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 4px 8px;
    transition: color 0.15s, border-color 0.15s;
  }
  .ab-raise-val.allin { color: #f87171; border-color: rgba(248,113,113,0.30); }
  .ab-slider { flex: 1; accent-color: #a855f7; cursor: pointer; height: 4px; }
  .ab-slider:disabled { opacity: 0.3; cursor: default; }

  /* Atalhos rápidos de aposta */
  .ab-shortcuts { display: flex; gap: 5px; flex-shrink: 0; }
  .ab-sc {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 5px;
    color: rgba(255,255,255,0.42);
    font-size: 11px;
    padding: 3px 7px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    font-family: inherit;
    line-height: 1.6;
    text-align: center;
  }
  .ab-sc:hover { background: rgba(255,255,255,0.09); color: #f8fafc; }
  .ab-sc span  { display: block; font-size: 9px; opacity: 0.5; }

  /* Linha de botões */
  .ab-btns {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr 86px;
    gap: 7px;
  }
  .ab-btn {
    border-radius: 9px;
    border: 1px solid;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 9px 6px;
    transition: transform 0.08s, opacity 0.08s, background 0.12s;
    font-family: inherit;
    min-height: 50px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .ab-btn:active   { transform: scale(0.96); opacity: 0.80; }
  .ab-btn:disabled { opacity: 0.25; cursor: default; pointer-events: none; }
  .ab-btn .lbl  { font-size: 14px; font-weight: 600; white-space: nowrap; }
  .ab-btn .hkey {
    font-size: 10px; opacity: 0.40;
    background: rgba(255,255,255,0.07);
    border-radius: 3px; padding: 0px 5px;
    letter-spacing: 0.04em;
  }

  .btn-fold   { color:#f87171; background:rgba(248,113,113,0.08); border-color:rgba(248,113,113,0.22); }
  .btn-fold:hover   { background:rgba(248,113,113,0.16); }
  .btn-check  { color:#4ade80; background:rgba(74,222,128,0.09); border-color:rgba(74,222,128,0.26); }
  .btn-check:hover  { background:rgba(74,222,128,0.17); }
  .btn-call   { color:#60a5fa; background:rgba(96,165,250,0.09); border-color:rgba(96,165,250,0.26); }
  .btn-call:hover   { background:rgba(96,165,250,0.17); }
  .btn-raise  { color:#c084fc; background:rgba(192,132,252,0.09); border-color:rgba(192,132,252,0.24); }
  .btn-raise:hover  { background:rgba(192,132,252,0.17); }
  .btn-allin  { color:#f87171; background:rgba(248,113,113,0.09); border-color:rgba(248,113,113,0.24); }
  .btn-allin:hover  { background:rgba(248,113,113,0.17); }

  /* Linha de info */
  .ab-info {
    display: flex;
    gap: 0;
    font-size: 11px;
    color: rgba(255,255,255,0.30);
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ab-info-item { display: flex; gap: 4px; align-items: center; }
  .ab-info-item b { color: rgba(255,255,255,0.58); font-weight: 500; }

  .ab-turn-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; color: #f59e0b;
    background: rgba(245,158,11,0.10);
    border: 1px solid rgba(245,158,11,0.22);
    border-radius: 20px; padding: 2px 9px; font-weight: 600;
  }
  .ab-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #f59e0b; flex-shrink: 0;
    animation: ab-pulse 1.4s ease-in-out infinite;
  }
  @keyframes ab-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .ab-disabled { opacity: 0.28; pointer-events: none; }

  /* Mobile: botões maiores */
  @media (max-width: 520px) {
    .ab-btns { grid-template-columns: 1fr 1.4fr 1fr 72px; gap: 6px; }
    .ab-btn  { min-height: 54px; }
    .ab-shortcuts { display: none; }
    .ab-hkeys { display: none; }
  }

  @keyframes hs-pop   { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes hs-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .hs-root { font-family: sans-serif; }
  .hs-ring-fill {
    fill: none; stroke-width: 5; stroke-linecap: round;
    transition: stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s;
  }
  .hs-ring-bg { fill: none; stroke-width: 5; }
  .hs-bar     { height: 100%; border-radius: 3px; transition: width 0.6s ease, background 0.4s; }
  .hs-badge   { transition: background 0.4s, color 0.4s, border-color 0.4s; }
  .hs-improved {
    font-size: 11px; font-weight: 600; text-align: center;
    margin-top: 6px; animation: hs-pop 0.35s ease;
  }
  .hs-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%;
            animation: hs-pulse 1.4s ease-in-out infinite; margin-right: 4px; }
`;

// Injeta os estilos globais no <head> do documento
// Fazemos assim para não depender do index.css do Vite
const styleTag = document.createElement('style');
styleTag.textContent = estilosGlobais;
document.head.appendChild(styleTag);


// ================================================================
// MONTAGEM DO APP
//
// document.getElementById('root') → encontra o div no index.html
// createRoot()                    → prepara o React 18 para renderizar
// .render()                       → renderiza o App dentro do div
//
// StrictMode: wrapper de desenvolvimento que detecta problemas.
// Renderiza componentes 2x em dev para pegar bugs de efeitos colaterais.
// Em produção é removido — zero impacto no usuário final.
// ================================================================

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
);
