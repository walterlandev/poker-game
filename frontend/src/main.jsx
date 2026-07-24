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
