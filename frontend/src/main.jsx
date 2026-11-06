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
import './styles/tema.css';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

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
    font-family: var(--fonte);
    background: var(--cor-fundo);
    color: var(--cor-texto);
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
    background: var(--cor-linha-forte);
    border-radius: 2px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--cor-texto-3);
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

  /* CartasComunitarias.jsx (CartaRevelada) — mesmo padrão de risco de
     tela preta: o <style> ficava dentro do componente que monta/desmonta
     a cada flop/turn/river. */
  @keyframes virarCarta {
    0%   { transform: rotateY(90deg) scale(0.8); opacity: 0; }
    50%  { transform: rotateY(45deg) scale(0.9); opacity: 0.5; }
    100% { transform: rotateY(0deg)  scale(1);   opacity: 1; }
  }
  .carta-revelada { animation: virarCarta 0.4s ease forwards; }

  /* Lobby/index.jsx, Header.jsx e Loja/index.jsx — mesmo padrão: essas
     telas inteiras montam/desmontam ao trocar Lobby <-> Game, então um
     <style> preso a elas corre o mesmo risco de tela preta. */
  .lobby-pagina   { max-width: 480px; }
  .lobby-body     { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .lobby-esquerda { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .lobby-direita  { display: none; }
  .lobby-conteudo {
    flex: 1; overflow-y: auto;
    padding: 12px 14px 100px;
    -webkit-overflow-scrolling: touch;
  }
  .lobby-rodape {
    position: fixed; bottom: 0;
    left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 480px;
    padding: 10px 14px max(14px, env(safe-area-inset-bottom));
    background: linear-gradient(to top, #0a0f1e 70%, transparent);
    z-index: 100; box-sizing: border-box;
  }
  /* Sub-filtro mesas */
  .sub-filtro-btn {
    flex: 1; padding: 7px 4px;
    border-radius: 7px; cursor: pointer;
    font-size: 12px; font-family: inherit;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  @media (min-width: 768px) {
    .lobby-pagina   { max-width: 1200px !important; }
    .lobby-body     { flex-direction: row; }
    .lobby-esquerda { flex: 1; border-right: 1px solid rgba(255,255,255,0.06); min-width: 0; }
    .lobby-direita  { display: flex; flex-direction: column; width: 320px; flex-shrink: 0; background: #0d1424; }
    .lobby-conteudo { padding: 16px 20px 100px; }
    .lobby-rodape   { max-width: 1200px; padding: 12px 20px max(16px, env(safe-area-inset-bottom)); }
  }
  @media (min-width: 1024px) {
    .lobby-direita { width: 380px; }
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    gap: 10px;
    max-width: 1200px;
    margin: 0 auto;
    box-sizing: border-box;
    width: 100%;
  }
  .header-nome {
    font-size: 15px;
    font-weight: 600;
    color: #F8FAFC;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }
  .header-rank-texto { font-size: 11px; margin: 2px 0 0; }
  .header-saldo-valor {
    font-size: 17px;
    font-weight: 700;
    color: #F59E0B;
    line-height: 1;
    white-space: nowrap;
  }
  @media (min-width: 768px) {
    .header-inner { padding: 14px 32px; }
    .header-nome  { font-size: 18px; max-width: 300px; }
    .header-rank-texto   { font-size: 13px; }
    .header-saldo-valor  { font-size: 22px; }
  }

  .loja-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .loja-corpo { display: flex; flex-direction: column; gap: 14px; }
  @media (min-width: 768px) {
    .loja-tabs { display: none; }
    .loja-corpo { flex-direction: row; align-items: flex-start; gap: 20px; }
    .loja-col { flex: 1; display: block !important; }
  }

  /* Tela de jogo, slider e ActionBar: ver styles/tema.css */

  @keyframes hs-pop   { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes hs-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
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
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>
);
