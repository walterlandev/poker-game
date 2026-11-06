/* ================================================================
   ARQUIVO: frontend/src/core/deck.js
   VERSÃO:  THEMED — Lógica do Baralho + Sistema de Temas Visuais

   CONCEITO GERAL:
   Este arquivo resolve dois problemas separados:

     1. LÓGICA DO BARALHO (backend também usa uma cópia disso)
        Gerar as 52 cartas e embaralhá-las de forma matematicamente justa.
        Isso NUNCA muda independente do tema visual escolhido.

     2. SISTEMA DE TEMAS (só o frontend usa)
        Definir como cada carta vai aparecer na tela:
        cores, ícones dos naipes, estilo do verso da carta, etc.

   POR QUE SEPARAR OS DOIS?
     A lógica do baralho é a MESMA independente do visual.
     Um "A♥" continua sendo um Ás de Copas seja no tema Clássico ou Neon.
     Separar garante que mudar o visual nunca quebra a lógica do jogo.

   COMO O REACT VAI USAR ISSO:
     1. O backend embaralha e distribui as cartas (strings como "A♥")
     2. O frontend recebe essas strings via Socket.io
     3. O componente CardHand.jsx chama getTemaAtual() para saber
        como renderizar cada carta visualmente
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES DO BARALHO
//
// Por que exportar NAIPES e VALORES separadamente?
//   Outros módulos podem precisar dessas listas.
//   Exemplo: o render.js pode querer saber quais naipes existem
//   para colorir corretamente sem precisar re-declarar a lista.
//
// Por que usar símbolos Unicode (♥ ♦ ♣ ♠) e não palavras?
//   Porque o engine-poker.js usa .slice(-1) para extrair o naipe
//   da string da carta. "10♥".slice(-1) → "♥" funciona perfeitamente.
//   Se usássemos "10-copas" precisaríamos de uma lógica mais complexa.
// ================================================================

import { randomInt } from 'node:crypto';

export const NAIPES  = ['♥', '♦', '♣', '♠'];
export const VALORES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];


// ================================================================
// BLOCO 2: CATÁLOGO DE TEMAS
//
// O que é um tema?
//   É um objeto que descreve COMO as cartas devem ser exibidas.
//   Não muda as cartas em si, só a aparência delas.
//
// Estrutura de cada tema:
//   id        → identificador único (usado para salvar no perfil do jogador)
//   nome      → nome exibido na tela de configurações
//   descricao → texto explicativo para o jogador
//   premium   → se true, só jogadores que pagaram podem usar
//
//   naipes → objeto que mapeia cada símbolo para suas propriedades visuais:
//     cor    → cor do texto/símbolo da carta (CSS color)
//     icone  → o símbolo que aparece na carta (pode ser emoji ou SVG path)
//     sombra → cor do efeito de brilho/sombra ao redor do símbolo
//
//   verso → como o fundo da carta é exibido quando está virada pra baixo:
//     cor        → cor de fundo do verso
//     padrao     → 'xadrez' | 'listras' | 'pontos' | 'diamantes'
//     corPadrao  → cor do padrão desenhado sobre o fundo
//
//   frente → estilos da face da carta (quando está aberta):
//     fundoCor   → cor do fundo da carta
//     bordaCor   → cor da borda da carta
//     raio       → arredondamento dos cantos em pixels
//     sombra     → sombra da carta (CSS box-shadow)
// ================================================================

export const TEMAS = {

    // ---- TEMA CLÁSSICO (gratuito, padrão) ----
    classico: {
        id: 'classico',
        nome: 'Clássico',
        descricao: 'O visual tradicional do poker. Vermelho e preto.',
        premium: false,

        naipes: {
            '♥': { cor: '#DC2626', icone: '♥', sombra: 'rgba(220,38,38,0.3)' },  // Vermelho
            '♦': { cor: '#DC2626', icone: '♦', sombra: 'rgba(220,38,38,0.3)' },  // Vermelho
            '♣': { cor: '#1a1a1a', icone: '♣', sombra: 'rgba(0,0,0,0.3)'     },  // Preto
            '♠': { cor: '#1a1a1a', icone: '♠', sombra: 'rgba(0,0,0,0.3)'     },  // Preto
        },

        verso: {
            cor: '#1E3A8A',        // Azul escuro
            padrao: 'xadrez',
            corPadrao: '#1E40AF',
        },

        frente: {
            fundoCor: '#FFFFFF',
            bordaCor: '#D1D5DB',
            raio: 8,
            sombra: '0 2px 8px rgba(0,0,0,0.15)',
        },
    },

    // ---- TEMA 4 CORES (gratuito) ----
    // Variação popular: cada naipe tem sua própria cor.
    // Ajuda jogadores a identificarem os naipes mais rápido.
    quatroCores: {
        id: 'quatroCores',
        nome: '4 Cores',
        descricao: 'Cada naipe com sua cor. Mais fácil de identificar.',
        premium: false,

        naipes: {
            '♥': { cor: '#DC2626', icone: '♥', sombra: 'rgba(220,38,38,0.3)' },  // Vermelho
            '♦': { cor: '#2563EB', icone: '♦', sombra: 'rgba(37,99,235,0.3)'  },  // Azul
            '♣': { cor: '#16A34A', icone: '♣', sombra: 'rgba(22,163,74,0.3)'  },  // Verde
            '♠': { cor: '#1a1a1a', icone: '♠', sombra: 'rgba(0,0,0,0.3)'      },  // Preto
        },

        verso: {
            cor: '#111827',
            padrao: 'diamantes',
            corPadrao: '#374151',
        },

        frente: {
            fundoCor: '#FFFFFF',
            bordaCor: '#9CA3AF',
            raio: 8,
            sombra: '0 2px 8px rgba(0,0,0,0.2)',
        },
    },

    // ---- TEMA NEON (premium) ----
    neon: {
        id: 'neon',
        nome: 'Neon',
        descricao: 'Visual futurista com brilhos e cores vibrantes.',
        premium: true,

        naipes: {
            '♥': { cor: '#F472B6', icone: '♥', sombra: 'rgba(244,114,182,0.6)' }, // Rosa neon
            '♦': { cor: '#34D399', icone: '♦', sombra: 'rgba(52,211,153,0.6)'  }, // Verde neon
            '♣': { cor: '#60A5FA', icone: '♣', sombra: 'rgba(96,165,250,0.6)'  }, // Azul neon
            '♠': { cor: '#A78BFA', icone: '♠', sombra: 'rgba(167,139,250,0.6)' }, // Roxo neon
        },

        verso: {
            cor: '#0F0F1A',
            padrao: 'pontos',
            corPadrao: '#7C3AED',
        },

        frente: {
            fundoCor: '#0F172A',   // Fundo escuro
            bordaCor: '#7C3AED',   // Borda roxa
            raio: 10,
            sombra: '0 0 15px rgba(124,58,237,0.4)',
        },
    },

    // ---- TEMA DOURADO (premium) ----
    dourado: {
        id: 'dourado',
        nome: 'Dourado',
        descricao: 'Luxo e elegância. Visual premium em tons de ouro.',
        premium: true,

        naipes: {
            '♥': { cor: '#EF4444', icone: '♥', sombra: 'rgba(239,68,68,0.4)'    },
            '♦': { cor: '#F59E0B', icone: '♦', sombra: 'rgba(245,158,11,0.5)'   },
            '♣': { cor: '#92400E', icone: '♣', sombra: 'rgba(146,64,14,0.4)'    },
            '♠': { cor: '#78350F', icone: '♠', sombra: 'rgba(120,53,15,0.4)'    },
        },

        verso: {
            cor: '#78350F',
            padrao: 'diamantes',
            corPadrao: '#B45309',
        },

        frente: {
            fundoCor: '#FFFBEB',   // Creme dourado
            bordaCor: '#D97706',   // Borda âmbar
            raio: 8,
            sombra: '0 2px 12px rgba(217,119,6,0.3)',
        },
    },

    // ---- TEMA MINIMALISTA (premium) ----
    minimalista: {
        id: 'minimalista',
        nome: 'Minimalista',
        descricao: 'Design clean e moderno. Sem distrações.',
        premium: true,

        naipes: {
            '♥': { cor: '#6B7280', icone: '♥', sombra: 'none' },
            '♦': { cor: '#6B7280', icone: '♦', sombra: 'none' },
            '♣': { cor: '#374151', icone: '♣', sombra: 'none' },
            '♠': { cor: '#374151', icone: '♠', sombra: 'none' },
        },

        verso: {
            cor: '#F9FAFB',
            padrao: 'listras',
            corPadrao: '#E5E7EB',
        },

        frente: {
            fundoCor: '#FFFFFF',
            bordaCor: '#E5E7EB',
            raio: 4,              // Cantos menos arredondados
            sombra: '0 1px 3px rgba(0,0,0,0.1)',
        },
    },
};


// ================================================================
// BLOCO 3: GERENCIADOR DE TEMA ATIVO
//
// Como funciona a seleção de tema?
//   1. O jogador escolhe um tema no componente de configurações
//   2. A escolha é salva no perfil dele no banco (Supabase)
//   3. Quando o jogo carrega, chamamos setTema(idDoTema)
//   4. Todos os componentes que precisam renderizar cartas chamam
//      getTemaAtual() para saber como exibir
//
// Por que usar uma variável de módulo e não Context do React?
//   O tema é lido por funções puras (como parsearCarta abaixo).
//   Manter no módulo é mais simples e evita prop drilling.
//   O React Context ainda pode ser usado para REAGIR a mudanças de tema.
// ================================================================

// Tema padrão ao carregar o jogo pela primeira vez
let temaAtivo = TEMAS.classico;

// Muda o tema ativo — chamado quando jogador escolhe nas configurações
export function setTema(idTema) {
    if (TEMAS[idTema]) {
        temaAtivo = TEMAS[idTema];
    } else {
        console.warn(`Tema "${idTema}" não encontrado. Usando clássico.`);
        temaAtivo = TEMAS.classico;
    }
}

// Retorna o tema atualmente ativo
export function getTemaAtual() {
    return temaAtivo;
}

// Retorna lista de todos os temas (para exibir no seletor de temas)
export function listarTemas() {
    return Object.values(TEMAS);
}

// Verifica se o jogador pode usar um tema premium
// premiumAtivo vem do perfil do jogador no banco de dados
export function temaDisponivel(idTema, premiumAtivo = false) {
    const tema = TEMAS[idTema];
    if (!tema) return false;
    if (tema.premium && !premiumAtivo) return false;
    return true;
}


// ================================================================
// BLOCO 4: PARSER DE CARTA
//
// O que é parsear?
//   Pegar uma string como "10♥" e transformar em um objeto
//   com todas as informações necessárias para renderizar a carta.
//
// Por que isso existe?
//   O backend envia strings simples ("A♠", "10♥").
//   O componente React precisa de um objeto rico para renderizar:
//   - qual cor usar?
//   - qual ícone do naipe?
//   - qual texto de valor?
//   - é carta vermelha ou preta?
//
// Esta função centraliza essa lógica. Assim o componente CardHand.jsx
// fica limpo — só recebe o objeto e renderiza.
// ================================================================

export function parsearCarta(cartaString) {
    if (!cartaString) return null;

    // Extrai o naipe (último caractere) e o valor (tudo antes)
    const naipe = cartaString.slice(-1);           // "10♥" → "♥"
    const valor = cartaString.slice(0, -1);        // "10♥" → "10"

    // Pega as configurações visuais do tema ativo para esse naipe
    const configNaipe = temaAtivo.naipes[naipe];

    return {
        // Dados lógicos (usados pelo engine-poker.js)
        cartaOriginal: cartaString,   // "10♥" — formato que o engine entende
        valor: valor,                  // "10", "A", "K", "J", etc.
        naipe: naipe,                  // "♥", "♦", "♣", "♠"

        // Dados visuais (usados pelo componente CardHand.jsx)
        cor: configNaipe?.cor || '#000000',
        icone: configNaipe?.icone || naipe,
        sombra: configNaipe?.sombra || 'none',
        frente: temaAtivo.frente,
        verso: temaAtivo.verso,

        // Atalho útil para CSS: "vermelho" ou "preto"
        // Permite fazer: carta.ehVermelho ? 'red-card' : 'black-card'
        ehVermelho: naipe === '♥' || naipe === '♦',
    };
}


// ================================================================
// BLOCO 5: GERAÇÃO E EMBARALHAMENTO DO BARALHO
//
// IMPORTANTE: Esta parte é idêntica ao que o backend usa.
// O backend tem sua própria cópia em backend/core/deck.js.
// O frontend usa isso para simulações locais (ex: mostrar cartas
// de demonstração na tela inicial sem precisar do servidor).
//
// Para o jogo real, o BACKEND embaralha e distribui.
// O frontend só EXIBE as cartas que recebe via Socket.io.
// ================================================================

export function gerarBaralho() {
    let deck = [];

    // Duplo loop: para cada naipe, cria todas as 13 cartas
    // Resultado: 4 naipes × 13 valores = 52 cartas
    for (let naipe of NAIPES) {
        for (let valor of VALORES) {
            // Formato: valor + naipe concatenados
            // Ex: "2" + "♥" = "2♥", "10" + "♠" = "10♠", "A" + "♦" = "A♦"
            deck.push(valor + naipe);
        }
    }

    // Sempre embaralha antes de retornar
    return embaralhar(deck);
}

// ------------------------------------------------------------
// Fisher-Yates Shuffle — O embaralhamento mais justo que existe
//
// POR QUE NÃO USAR .sort(() => Math.random() - 0.5)?
//   Esse método é comum mas INCORRETO matematicamente.
//   Ele não garante distribuição uniforme — algumas ordens
//   aparecem com mais frequência que outras.
//
// COMO O FISHER-YATES FUNCIONA?
//   Começa pelo último elemento e vai até o primeiro.
//   Em cada passo, troca o elemento atual por um aleatório
//   de qualquer posição ANTERIOR (inclusive a própria).
//
//   Exemplo com 4 elementos [A, B, C, D]:
//     i=3: sorteia j entre 0-3, troca D com o sorteado
//     i=2: sorteia j entre 0-2, troca C com o sorteado
//     i=1: sorteia j entre 0-1, troca B com o sorteado
//     i=0: loop termina
//
//   Cada elemento tem exatamente 1/52 de chance de
//   estar em qualquer posição. É matematicamente provado.
// ------------------------------------------------------------
function embaralhar(lista) {
    for (let i = lista.length - 1; i > 0; i--) {
        // Sorteia um índice entre 0 e i (inclusive)
        // crypto.randomInt (CSPRNG, sem viés de módulo). Math.random do V8
        // é xorshift128+: dá pra reconstruir o estado a partir de saídas
        // observáveis (ids de mesa, frases/atrasos dos bots) e prever o
        // baralho — inaceitável num jogo com dinheiro real.
        const j = randomInt(i + 1);

        // Troca lista[i] com lista[j] usando destructuring
        // Sem uma variável temporária:
        //   temp = lista[i]
        //   lista[i] = lista[j]
        //   lista[j] = temp
        // Com destructuring: [lista[i], lista[j]] = [lista[j], lista[i]]
        [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
}
