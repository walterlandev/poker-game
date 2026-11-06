# DESIGN-claro.md — ₿C Bitchager, tema claro

Proposta do tema claro, irmã do tema escuro aprovado (`frontend/DESIGN.md` da branch do tema escuro).
**Status: aguardando aprovação do dono.**
Prévia: `frontend/design-preview-claro/index.html` (abre direto no navegador; os botões
"Claro / Escuro" no topo trocam só os valores das variáveis; `?tema=escuro` abre no escuro).
Screenshots: `frontend/design-preview-claro/shots/`.

---

## 1. Ideia: o mesmo salão, de dia

O tema escuro é o salão de carteado à noite: tabaco, couro, feltro vinho, marfim e latão.
O claro é **o mesmo salão com a janela aberta**: linho cru no fundo, papel nos painéis, madeira
clara (carvalho/freijó) no trilho da mesa. Nada de layout, fonte, ícone ou componente muda;
só os valores das cores.

- **Fundo em linho cru (`#DCD5C8`), não creme.** É um tom de tecido acinzentado, mais escuro e
  mais frio que o creme-padrão (`#F4F1EA`) que hoje denuncia página gerada por IA. Leva uma trama
  de dois fios quase invisível (`--textura-fundo`), que no escuro é `none`.
- **Painéis em papel (`#F1EDE5`), um degrau mais claros que o fundo.** É a mesma lógica do escuro
  (elevação por luminância, couro mais claro que tabaco), só que no sentido do claro. Não há
  branco puro em lugar nenhum.
- **Neutros (Fold, Entrar, atalhos) em camurça (`#D0C6B5`)**, um degrau mais escuros que o papel,
  para continuarem lendo como botão sem precisar de borda ou sombra.
- **Texto em tinta sépia (`#2B211B`)**, marrom quase preto, nunca `#000` nem cinza azulado.
- **Sem serifa e sem terracota.** Continua Archivo nas três larguras; a brasa continua só estado.

### Por que o feltro continua vinho

O feltro fica **exatamente igual ao do escuro** (`#6E1F2B` → `#4A1420`). Motivos:
1. A mesa é o elemento memorável do sistema. Sobre linho claro ela vira uma ilha escura ainda mais
   marcante do que no escuro; trocar o tom enfraqueceria justamente a assinatura.
2. Tudo que vive em cima do feltro (pote em latão, apostas, cartas com face marfim, versos, fase)
   continua com o mesmo contraste nos dois temas, sem segundo jogo de valores para manter.
3. Os temas de baralho da loja (`core/temas.js`) foram pensados para aparecer sobre o feltro;
   mantendo o feltro, nenhum tema da loja precisa de revisão.
4. Um feltro verde ou azul "para combinar com o claro" seria outro app; um vinho mais claro
   (rosado) sobre linho perde o peso de pano e fica com cara de cassino de neon.

O que muda em volta da mesa: o **trilho deixa de ser couro escuro e vira madeira clara**
(`#D6BD95` → `#A3855D`), com a costura em latão envelhecido (`rgba(110,70,10,.42)`), e as plaquinhas
dos jogadores ficam em papel com texto em tinta.

### Latão no claro: um destaque, duas tintas

O latão `#D9A441` do escuro, usado como **texto** sobre papel, dá cerca de 2:1 (ilegível). Então o
token de destaque foi dividido em dois papéis que no escuro têm o mesmo valor:
- `--c-destaque` (preenchimento: faixa "Sua vez", Raise, Criar mesa, anel do turno): `#C99532`,
  um latão um pouco mais fechado para ter presença sobre papel, sempre com texto em tinta por cima.
- `--c-destaque-texto` (₿C escrito, aba ativa, valor do slider): `#7A510C`, latão envelhecido.

O mesmo vale para sálvia e brasa (`--c-positivo` / `--c-positivo-texto`, `--c-perigo` /
`--c-perigo-texto`). Continua sendo **uma cor de destaque só**; são dois tons do mesmo metal.

### Sombras viram degraus de tom

No escuro, as sombras são marrons pesadas. No claro, painéis e listas se separam por degrau de
tom (linho → papel → camurça) e por `--c-linha`. Sobra sombra só onde há objeto físico em cima de
outro: a moldura do aparelho, o painel de ações flutuante do desktop, o menu, a mesa e as cartas,
sempre marrom-quente e curta (`rgba(84,60,36,.16)`), nunca preta.

---

## 2. Tabela de tokens

Pronta para virar CSS: os valores "escuro" vão em `:root`, os "claro" em `[data-tema="claro"]`.
Os nomes são semânticos (o papel, não o material); a coluna "Prévia escura" mostra de onde cada um
veio, para quem está aplicando o escuro com outros nomes.

### Superfícies e texto

| Token | Prévia escura | Escuro | Claro | Uso |
|---|---|---|---|---|
| `--c-fundo` | `--c-tabaco` | `#1C1714` | `#DCD5C8` linho | Fundo do app, lista do lobby, área da mesa |
| `--c-superficie` | `--c-couro` | `#2A221D` | `#F1EDE5` papel | Cabeçalhos, painel de ações, barra inferior, menu, segmento |
| `--c-superficie-2` | `--c-couro-claro` | `#3A2F28` | `#D0C6B5` camurça | Botões neutros (Fold, Entrar, atalhos), trilho do slider, item pressionado |
| `--c-superficie-2-hover` | `#4A3D34` fixo | `#4A3D34` | `#C4B8A4` | Hover de botão neutro |
| `--c-texto` | `--c-marfim` | `#F1E8D8` | `#2B211B` tinta | Texto principal |
| `--c-texto-2` | `--c-marfim-2` | `#B8A893` | `#4A3E34` | Texto secundário, stacks nas placas |
| `--c-texto-3` | `--c-marfim-3` | `#857766` | `#5B4D41` | Rótulos, metadados, aba inativa |
| `--c-linha` | `--c-linha` | `rgba(241,232,216,.10)` | `rgba(43,33,27,.13)` | Divisórias e bordas finas |
| `--c-hover-linha` | `rgba(…,.03)` fixo | `rgba(241,232,216,.03)` | `rgba(43,33,27,.035)` | Hover de linha de tabela |
| `--textura-fundo` | (não havia) | `none` | trama de linho (2 gradientes repetidos) | Camada sobre `--c-fundo` |
| `--c-pagina` | `#120E0C` fixo | `#120E0C` | `#CEC6B7` | Só a moldura da prévia; no app = `--c-fundo` |

### Destaque (latão) e foco

| Token | Prévia escura | Escuro | Claro | Uso |
|---|---|---|---|---|
| `--c-destaque` | `--c-latao` | `#D9A441` | `#C99532` | Preenchimento: faixa "Sua vez", Raise, Criar mesa, botão +, anel do turno, slider |
| `--c-destaque-texto` | `--c-latao` | `#D9A441` | `#7A510C` | ₿C escrito, aba ativa e seu traço, valor do slider, posição no ranking |
| `--c-sobre-destaque` | `--c-tabaco` | `#1C1714` | `#2B211B` | Texto sobre latão |
| `--c-destaque-tinta` | `--c-latao-tinta` | `rgba(217,164,65,.14)` | `rgba(201,149,50,.20)` | Fundo de item ativo (atalho, "Você" no ranking, Comprar ₿C) |
| `--c-destaque-borda` | `rgba(217,164,65,.55)` fixo | `rgba(217,164,65,.55)` | `rgba(122,81,12,.55)` | Contorno do atalho ativo e da placa de quem está na vez |
| `--c-foco` | `--c-latao` | `#D9A441` | `#7A510C` | Anel de foco de teclado (2px, folga 2px) |

### Estados (sálvia e brasa)

| Token | Prévia escura | Escuro | Claro | Uso |
|---|---|---|---|---|
| `--c-positivo` | `--c-salvia` | `#6FAE84` | `#69A87E` | Botão Check/Call, barra de força da mão |
| `--c-positivo-texto` | `--c-salvia` | `#6FAE84` | `#2B6340` | "Em jogo", ganhos escritos |
| `--c-sobre-positivo` | `#10261A` fixo | `#10261A` | `#10261A` | Texto sobre sálvia |
| `--c-perigo` | `--c-brasa` | `#E0573A` | `#BE4220` | Etiqueta All-in no assento (preenchida) |
| `--c-perigo-rotulo` | `--c-brasa` | `#E0573A` | `#9E3116` | Rótulo "All-in" no atalho |
| `--c-perigo-texto` | `#F08A6F` fixo | `#F08A6F` | `#9E3116` | Valor do All-in, "Sair da conta", erros |
| `--c-sobre-perigo` | `#fff` fixo | `#FFFFFF` | `#FFFFFF` | Texto sobre brasa |
| `--c-perigo-tinta` | `rgba(224,87,58,.08)` fixo | `rgba(224,87,58,.08)` | `rgba(190,66,32,.07)` | Fundo do atalho All-in |
| `--c-perigo-borda` | `rgba(224,87,58,.5)` fixo | `rgba(224,87,58,.5)` | `rgba(158,49,22,.45)` | Contorno do atalho All-in |

### Mesa

| Token | Prévia escura | Escuro | Claro | Uso |
|---|---|---|---|---|
| `--c-feltro` | `--c-vinho` | `#6E1F2B` | igual | Feltro (meio do gradiente), selo da marca, verso das cartas |
| `--c-feltro-luz` | `#83283A` fixo | `#83283A` | igual | Centro iluminado do feltro |
| `--c-feltro-fundo` | `--c-vinho-fundo` | `#4A1420` | igual | Borda do feltro, listra do verso |
| `--c-feltro-sombra` | `rgba(20,5,8,.6)` fixo | `rgba(20,5,8,.6)` | igual | Sombra interna do feltro |
| `--c-feltro-texto` | `--c-marfim` | `#F1E8D8` | igual | Texto sobre o feltro (apostas) |
| `--c-feltro-texto-2` | `rgba(241,232,216,.62)` fixo | `rgba(241,232,216,.62)` | `rgba(241,232,216,.78)` | Fase ("Turn"). Ver nota de contraste |
| `--c-feltro-vidro` | `rgba(28,23,20,.55)` fixo | `rgba(28,23,20,.55)` | igual | Fundo do pote |
| `--c-feltro-vidro-2` | `rgba(28,23,20,.75)` fixo | `rgba(28,23,20,.75)` | igual | Fundo das apostas |
| `--c-feltro-destaque` | `--c-latao` | `#D9A441` | igual | Valor do pote, selo "₿C" |
| `--c-verso-borda` | `rgba(217,164,65,.55/.6)` fixos | `rgba(217,164,65,.58)` | igual | Borda do verso das cartas e do selo (unificados) |
| `--c-carta-vazia` | `rgba(241,232,216,.22)` fixo | `rgba(241,232,216,.22)` | igual | Espaço tracejado de carta ainda não virada |
| `--c-trilho-1/2/3` | `#4A3A2E` `#2E241E` `#241C17` | couro escuro | `#D6BD95` `#BB9D71` `#A3855D` madeira clara | Gradiente do trilho |
| `--c-trilho-brilho` | `rgba(241,232,216,.08)` fixo | `rgba(241,232,216,.08)` | `rgba(255,250,240,.45)` | Filete de luz no topo do trilho |
| `--c-costura` | `rgba(217,164,65,.35)` fixo | `rgba(217,164,65,.35)` | `rgba(110,70,10,.42)` | Costura tracejada do trilho |
| `--c-placa` | `rgba(28,23,20,.92)` fixo | `rgba(28,23,20,.92)` | `#F7F3EC` | Plaquinha nome + stack |
| `--c-av-borda` | `--c-tabaco` | `#1C1714` | `#F1EDE5` | Aro do avatar |
| `--c-anel-vazio` | `rgba(241,232,216,.14)` fixo | `rgba(241,232,216,.14)` | `rgba(43,33,27,.14)` | Parte já gasta do anel do temporizador |
| `--c-dealer` / `--c-sobre-dealer` | marfim / tabaco | `#F1E8D8` / `#1C1714` | igual | Disco "D" (objeto físico, não inverte) |
| `--c-polegar` | `--c-marfim` | `#F1E8D8` | `#FBF8F2` | Bolinha do slider de raise |

### Cartas e fichas (iguais nos dois temas, salvo a borda)

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--c-carta-face` | `#FBF6EC` | igual | Face clássica (temas da loja sobrescrevem) |
| `--c-carta-borda` | `#D9CDB8` | `#C4B7A1` | Borda da carta; mais firme para a sua mão, que fica sobre o linho |
| `--c-naipe-verm` / `--c-naipe-preto` | `#B3261E` / `#1C1714` | igual | Naipes |
| `--c-ficha-azul/vermelha/preta/verde` | `#2F5D8A` `#9E2A2B` `#2B2523` `#3E7A57` | igual | Fichas |
| `--c-ficha-aro` | `rgba(241,232,216,.85)` | igual | Aro da ficha |

### Sombras

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--sombra` | `0 10px 30px rgba(10,6,4,.55)` | `0 1px 0 rgba(255,252,245,.6) inset, 0 12px 28px rgba(84,60,36,.16)` | Painel flutuante, menu, moldura |
| `--sombra-mesa` | `0 18px 50px rgba(10,6,4,.7)` | `0 16px 36px rgba(84,58,32,.30)` | Mesa |
| `--sombra-carta` | `0 2px 6px rgba(10,6,4,.5)` | `0 1px 3px rgba(60,40,25,.28)` | Cartas |
| `--sombra-peq` | `0 2px 6px rgba(10,6,4,.6)` | `0 1px 3px rgba(60,40,25,.35)` | Dealer, bolinha do slider |

Também por tema: `color-scheme: dark` / `light` e `<meta name="theme-color">` = `--c-fundo`
(`#1C1714` / `#DCD5C8`).

---

## 3. Contraste (WCAG 2.1, tema claro)

Calculado pela fórmula de luminância relativa. AA pede 4,5:1 para texto normal e 3:1 para texto
grande e para indicadores (foco).

| Par | Cores | Razão |
|---|---|---|
| Texto sobre linho | `#2B211B` / `#DCD5C8` | 10,77 |
| Texto sobre papel | `#2B211B` / `#F1EDE5` | 13,46 |
| Texto sobre camurça (Fold, Entrar) | `#2B211B` / `#D0C6B5` | 9,30 |
| Texto sobre placa | `#2B211B` / `#F7F3EC` | 14,21 |
| Texto 2 sobre linho / papel / camurça | `#4A3E34` | 7,09 / 8,86 / 6,12 |
| Texto 3 sobre linho / papel / camurça | `#5B4D41` | 5,57 / 6,96 / 4,81 |
| ₿C sobre linho / papel / placa | `#7A510C` | 4,78 / 5,98 / 6,31 |
| ₿C no atalho ativo (tinta de latão) | `#7A510C` / `#E9DBC1` | 5,11 |
| Texto sobre latão (faixa, Raise, Criar) | `#2B211B` / `#C99532` | 5,86 |
| Texto sobre sálvia (Call) | `#10261A` / `#69A87E` | 5,71 |
| Branco sobre brasa (All-in) | `#FFFFFF` / `#BE4220` | 5,26 |
| "Em jogo" sobre linho / papel | `#2B6340` | 4,86 / 6,07 |
| All-in no atalho / "Sair da conta" | `#9E3116` | 5,63 / 6,19 |
| Pote em latão sobre o vidro do feltro | `#D9A441` / `#411B1E` | 6,67 |
| Aposta sobre o feltro | `#F1E8D8` / `#31191A` | 13,45 |
| Fase ("Turn") sobre o feltro | marfim 78% / `#83283A` | 5,14 |
| Anel de foco sobre papel / linho | `#7A510C` | 5,98 / 4,78 (mín. 3) |

Estados desabilitados (40% de opacidade) ficam fora da exigência de contraste, como no escuro.

### Notas para o tema escuro (não alterado aqui)

Ao medir o escuro com a mesma régua apareceram quatro pontos abaixo de AA. Ficam como sugestão
para quem está aplicando o escuro; esta prévia mantém os valores aprovados no `:root`.
- Fase "Turn" no feltro, `rgba(241,232,216,.62)`: **3,81**. Sugestão: `.78` (5,14), o mesmo do claro.
- `--c-texto-3` `#857766`: 4,08 sobre tabaco, 3,59 sobre couro, 2,99 sobre couro-claro.
  Sugestão: `#A08F7B` (5,68 / 4,99 / 4,15) e não usar texto 3 sobre couro-claro.
- Branco sobre brasa `#E0573A` (etiqueta All-in, 11px): **3,75**. Sugestão: texto tabaco sobre
  brasa (4,73) ou brasa `#C9472B` com branco (4,75).

---

## 4. Revisão (Web Interface Guidelines) sobre a prévia clara

- Corrigido na prévia: aspas retas na legenda trocadas por aspas curvas; `color-scheme` e
  `theme-color` agora acompanham o tema; seletor de tema com `aria-pressed`.
- Herdado da prévia escura, para resolver na implementação (não muda o visual):
  `<img>` dos avatares sem `width`/`height`; atalhos de aposta sem estado de hover; a prévia não
  tem skip link nem `aria-live` (o checklist do `DESIGN.md` já prevê os dois no app).

## 5. Como aplicar depois do escuro

1. O escuro entra com os tokens da tabela acima em `:root` (os nomes podem ser outros; o que
   importa é que preenchimento e texto do latão, da sálvia e da brasa sejam tokens separados, e
   que o feltro tenha tokens próprios em vez de reaproveitar `--c-texto`).
2. O claro é um bloco `[data-tema="claro"] { … }` com a coluna "Claro", no mesmo CSS global.
3. A escolha do tema fica em Configurações (Sistema / Claro / Escuro, padrão Sistema via
   `prefers-color-scheme`), gravada em `localStorage`, e o atributo é aplicado no `<html>` antes do
   React montar para não piscar. **Isso é decisão de produto, só com aprovação.**
