# DESIGN.md — ₿C Bitchager

Direção visual proposta para o redesenho do frontend. **Status: aguardando aprovação do dono.**
Prévia navegável: `frontend/design-preview/index.html` (arquivo estático, abre direto no navegador).

---

## 1. Ideia

**"Salão de carteado, não cassino de neon."**

A própria arte do jogo (`public/logo.png`) já mostra o mundo do Bitchager: salão de madeira escura,
feltro vinho, latão nas ferragens, fichas de barro. A direção pega esse mundo e o deixa disciplinado
para uma interface de jogo rápida: superfícies de madeira/couro quase sem ornamento, um feltro vinho
com textura de pano, e **uma única cor de destaque, o latão**, reservada para dinheiro (₿C) e para
"é a sua vez".

O que fica de fora de propósito:
- o roxo atual (`#7C3AED` e afins), que é a assinatura do "visual gerado por IA" e não tem relação
  com o mundo do jogo;
- o feltro verde + dourado + preto, que é o clichê de cassino online;
- emojis como ícones (🃏 🏆 📊 💰 🤖), trocados por um conjunto próprio de ícones SVG de traço.

O elemento memorável é **a mesa**: trilho de couro com uma costura de latão pontilhada, feltro vinho
texturizado. Todo o resto (cabeçalho, listas, carteira) fica quieto para não competir com ela.

### Referências de método (não de identidade)

| Referência | O que foi aproveitado (método) |
|---|---|
| Kraken (`awesome-design-md/library/kraken.md`) | App de dinheiro em tempo real: uma cor de marca só, verde apenas para estado positivo, sombras quase invisíveis, botões com raio médio (não pílula), números sempre em algarismos tabulares. |
| PlayStation (`playstation.md`) | Faixa saturada reservada só para o momento de maior prioridade (aqui: a faixa de latão "Sua vez" no painel de ações); contraste forte de peso entre rótulo e botão. |
| Revolut (`revolut.md`) | Elevação por luminância da superfície, não por sombra; escada de superfícies escuras com poucos degraus; nenhuma segunda cor de marca. |

Nenhuma cor, fonte, logo ou texto dessas marcas foi copiado.

---

## 2. Paleta

```yaml
colors:
  tabaco:      "#1C1714"  # fundo do app — madeira escura do salão (marrom, não preto)
  couro:       "#2A221D"  # superfície 1 — painéis, cabeçalho, painel de ações
  couro-claro: "#3A2F28"  # superfície 2 — campos, botões neutros, linhas em hover
  vinho:       "#6E1F2B"  # feltro da mesa
  vinho-fundo: "#4A1420"  # borda interna do feltro / sombra do feltro
  marfim:      "#F1E8D8"  # texto principal e face clássica das cartas
  latao:       "#D9A441"  # ÚNICO destaque: ₿C, botão principal, "sua vez", aba ativa

  # derivados (não são novas cores, são passos das acima)
  marfim-2:    "#B8A893"  # texto secundário
  marfim-3:    "#857766"  # texto terciário, rótulos
  linha:       "rgba(241,232,216,0.10)"  # divisórias
  latao-tinta: "rgba(217,164,65,0.14)"   # fundo de item ativo

  # semânticas (uso restrito, nunca decoração)
  salvia:      "#6FAE84"  # Check/Call, ganho, saldo positivo
  brasa:       "#E0573A"  # All-in, erro, ação destrutiva
  naipe-verm:  "#B3261E"  # copas/ouros no baralho clássico
  naipe-preto: "#1C1714"  # espadas/paus no baralho clássico
```

Regras:
- Latão aparece no máximo em **um elemento dominante por tela** (o botão principal ou o anel do turno)
  e nos valores em ₿C. Não usar latão em bordas decorativas.
- Fold é **neutro** (couro-claro), não vermelho: desistir não é erro.
- Brasa só para All-in e erros. Sálvia só para Check/Call e ganhos.
- Cinzas são sempre derivados do marfim (quentes). Nada de cinza azulado (`#6B7280`, `#94A3B8`).
- Sombra, quando houver, é marrom (`rgba(10,6,4,0.55)`), nunca preto puro.

---

## 3. Tipografia

Uma família só: **Archivo** (Google Fonts, variável em peso 100–900 e largura 62–125).
A variação de **largura** é o que dá personalidade e resolve o espaço no celular:

| Papel | Largura | Peso | Uso |
|---|---|---|---|
| Marca / título | 118 (expandida) | 800 | Logo "Bitchager", título de seção |
| Números de jogo | 88 (condensada) | 700 | Pote, stacks, apostas, valores em ₿C (sempre `tabular-nums`) |
| Botões de ação | 88 | 700 | Fold / Call ₿C 120 / Raise — cabe em 3 colunas a 390px |
| Texto de interface | 100 | 400 / 500 / 600 | Nomes, rótulos, parágrafos |

Escala (px): **12 · 14 · 16 · 19 · 23 · 28 · 40** (razão ~1,2).
- Mínimo absoluto na mesa: **11px** (hoje há textos de 6–9px nos badges e na fase).
- Rótulos em caixa normal (sentence case). Nada de caixa-alta espaçada em todo rótulo.
- Carregamento: `<link>` do Google Fonts no `index.html` com `display=swap`; fallback
  `"Archivo", "Arial Narrow", system-ui, sans-serif`. Não precisa de dependência npm.

---

## 4. Espaço, raios, camadas

```yaml
space:   [4, 8, 12, 16, 24, 32, 48]   # --s-1 … --s-7
radius:
  carta:  6px     # cartas e fichas de aposta
  badge:  4px     # D / SB / BB, etiquetas
  botao:  10px    # botões e campos
  painel: 14px    # painel de ações, cartões de mesa
  folha:  20px    # bottom sheets e modais
  mesa:   999px   # estádio da mesa (retrato no celular, oval no desktop)
toque-minimo: 44px      # todo alvo de toque; botões de ação 56px no celular
z:
  mesa: 0
  assento: 10
  aposta: 20
  centro-mesa: 30
  painel-acoes: 40
  cabecalho: 50
  aviso: 60
  modal: 70
```

---

## 5. Estados

| Estado | Tratamento |
|---|---|
| Hover (desktop) | superfície sobe um degrau (couro → couro-claro); sem escala |
| Pressionado | `translateY(1px)` + 6% mais escuro; 120ms |
| Foco de teclado | anel 2px latão com 2px de folga (`outline-offset: 2px`) em todo elemento interativo |
| Desabilitado | 40% de opacidade + cursor padrão; nunca esconder a ação |
| Fora da sua vez | painel de ações visível, botões desabilitados e o texto "Vez de Rafa" no lugar da faixa |
| Sua vez | faixa de latão no topo do painel com o tempo restante; anel de latão animado no seu avatar |
| Jogador que desistiu | avatar dessaturado (grayscale 1, 55% de opacidade) + etiqueta "Fold" |
| All-in | etiqueta brasa "All-in" no assento |
| Carregando | esqueleto no formato do conteúdo (linhas de mesa), sem spinner genérico |
| Vazio | frase que leva à ação ("Nenhuma mesa aberta agora. Crie a sua e chame os amigos.") + botão |
| Movimento reduzido | `prefers-reduced-motion`: sem pulso do anel, transições instantâneas |

---

## 6. Componentes

### Mesa
- **Celular (retrato):** mesa em formato de estádio vertical ocupando a altura entre o cabeçalho e
  o painel de ações. Adversários na borda; **você fica embaixo, fora do feltro**, com as duas
  cartas grandes (≈56×80px) e a força da mão logo acima do painel. Hoje a mesa é uma oval deitada
  de ~366×209px numa tela de 390px, com avatares de 44px e cartas minúsculas.
- **Desktop:** oval deitada, até 9 lugares, painel de ações ancorado no canto inferior direito com
  dicas de atalho (F, C, R, A, ← →).
- Centro: fase ("Turn"), pote em latão condensado grande, 5 espaços de carta (vazios tracejados).
- Trilho: couro com costura pontilhada de latão a 35% — a assinatura visual.

### Assento (Jogador)
- Avatar circular (o anel do temporizador é circular) + plaquinha com primeiro nome e stack.
- Aposta da rodada: ficha + valor posicionada **entre o assento e o centro** (hoje fica em cima
  do avatar e cobre outros elementos).
- Dealer = disco marfim "D"; SB/BB = etiquetas neutras de texto. Sem azul/roxo por posição.
- Bot sem foto: monograma com as iniciais, não emoji.

### Painel de ações (ActionBar)
- Três botões grandes na zona do polegar: **Fold** (neutro) · **Check / Call ₿C x** (sálvia) ·
  **Raise ₿C x** (latão). O valor do raise aparece no próprio botão.
- Linha de atalhos de aposta acima: Mín · ½ pote · ⅔ pote · Pote · **All-in** (brasa). All-in
  continua sendo uma ação direta, como hoje.
- Slider de raise com o valor ao lado, passo = big blind.
- Ações disparam no clique/soltar (`click`), não no `pointerdown`, para evitar fold acidental ao
  rolar a tela no celular. **Isto é mudança de comportamento: só aplicar com aprovação.**

### Cabeçalho do lobby
- Celular: marca à esquerda; à direita o saldo em ₿C (toque abre a Carteira) e o avatar (toque abre
  o menu Perfil / Configurações / Sair).
- Desktop: marca, navegação horizontal com as seções, saldo com "Comprar ₿C", avatar com menu.

### Navegação
- Celular: **barra inferior fixa** com 5 destinos — Mesas, Torneio, Ranking, Loja, Carteira —
  ícone + rótulo, item ativo em latão. Admin entra como 6º item só para admin.
- Desktop: as mesmas 5 seções no cabeçalho, mesma ordem.
- Uma cor só para aba ativa (hoje cada aba tem uma cor diferente).

### Lista de mesas
- Linha por mesa, **blinds em destaque** (é o que o jogador procura primeiro), nome, buy-in,
  lugares como pontos (●●●○○○ 3/6), estado (Aguardando / Em jogo / Cheia), botão Entrar.
- Filtro segmentado Públicas / Privadas com contagem, e "Criar mesa" como botão principal ao lado.
- Desktop: tabela com colunas alinhadas + ranking fixo na lateral direita (como hoje).

### Temas de baralho
- Os temas da loja (`core/temas.js`) continuam definindo face, borda, verso e cor dos naipes.
  O design só define tamanho, raio (6px) e sombra das cartas. O tema exibido é sempre o do dono
  das cartas, como hoje.

### Ícones
- Conjunto SVG próprio, traço 1,75px, cantos arredondados, 20/24px. Sem emojis na interface.

---

## 7. Auditoria do visual atual (resumo)

**Mesa e jogabilidade (celular ~390px)**
1. A mesa é uma oval deitada (1,75:1) em tela retrato: sobra ~60% da altura vazia e a mesa fica com
   ~366×209px; avatares de 44px e cartas comunitárias de 32px.
2. Textos minúsculos: badges de 6–8px (D/SB/BB, ALL-IN, FOLD), fase de 8px, stacks de 8–9px.
3. A ficha de aposta flutua em cima do avatar e briga com cartas e nome em mesas cheias.
4. Botões de ação disparam em `pointerdown`: um toque ao rolar pode virar Fold sem querer.
5. Fora da sua vez o painel inteiro cai para 28% de opacidade: difícil ler pote e custo.
6. Quatro botões do mesmo peso (Fold, Call, Raise, All-in) na mesma linha; All-in tem o mesmo
   destaque que Call.
7. "← Sair" no topo sai na hora, sem confirmação, mesmo no meio da mão.
8. Saldo no topo da mesa mostra só o saldo real; no lobby mostra real + bônus — números diferentes
   para o "mesmo" saldo.

**Hierarquia e identidade**
9. Roxo como cor de "você" e do slider, âmbar para turno, azul para saldo, verde, vermelho, azul e
   roxo nos badges de posição: muitas cores sem papel definido.
10. Emojis como ícones em todo lugar (abas, menu, rank, avatar padrão, notificação de vitória).
11. Fonte do sistema em todo o app; números proporcionais (valores "pulam" ao mudar).
12. `index.css` ainda tem o tema do template do Vite (`#root` com 1126px, roxo `#aa3bff`, modo
    claro) misturado com o tema escuro do app; `index.html` com `lang="en"` e título "frontend".

**Navegação**
13. Perfil, Configurações e Sair ficam escondidos atrás de um "⋮" sem rótulo.
14. Carteira aparece duas vezes (aba e menu) e o saldo do cabeçalho abre a Loja, não a Carteira.
15. Abas no topo com rolagem horizontal no celular (6 abas com admin), longe do polegar, cada uma
    de uma cor.
16. "Criar Mesa" é um rodapé fixo com gradiente roxo→índigo; com a barra de navegação inferior
    proposta, ele sobe para o topo da lista, ao lado do filtro Públicas / Privadas.

**Lista de mesas**
17. Cartões todos iguais com grade de 3 informações; blinds (o critério principal de escolha) têm o
    mesmo peso que o resto.

---

## 8. Checklist para a implementação (Web Interface Guidelines)

- `index.html`: `lang="pt-BR"`, título "Bitchager", `<meta name="theme-color" content="#1C1714">`,
  `color-scheme: dark` no `:root`, `preconnect` + link do Archivo.
- Tokens das seções 2 a 4 como variáveis CSS globais (`--c-*`, `--t-*`, `--s-*`, `--r-*`, `--z-*`)
  no CSS global; remover o tema do template do Vite do `index.css`.
- Painel de ações e barra inferior respeitam `env(safe-area-inset-bottom)`.
- `touch-action: manipulation` em botões; foco visível com `:focus-visible` em tudo.
- Botões só com ícone (avatar, saldo, sair) com `aria-label`; ícones decorativos com `aria-hidden`.
- "Sua vez" e as notificações da mesa em região `aria-live="polite"`.
- O slider de raise continua sendo um `<input type="range">` de verdade (a prévia só desenha).
- Números sempre com `toLocaleString('pt-BR')` (como hoje) e `tabular-nums`.
- Mudanças de comportamento que precisam de aprovação à parte: ações em `click` em vez de
  `pointerdown`, confirmação ao sair da mesa no meio da mão, Mesas como aba inicial.
- `@keyframes` (anel do turno etc.) só no CSS global, nunca em `<style>` dentro de componente.
