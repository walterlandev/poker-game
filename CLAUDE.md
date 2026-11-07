# Poker Game (₿C Bitchager) — guia pra qualquer sessão nova do Claude Code

Leia isto ANTES de mexer em qualquer coisa. Para situar-se rápido (estado
atual, linha do tempo, pendências) leia `.claude/RESUMO_PROJETO.md` — é curto
e economiza tokens. Só se precisar de mais detalhe,
o relatório completo está em `.claude/RELATORIO_PROJETO.txt` (arquitetura,
como cada parte deveria funcionar, histórico completo do que já foi feito,
e pendências conhecidas). Mantenha os dois arquivos atualizados quando
fizer mudanças relevantes.

## Onde as coisas moram

- **Produção (desde 07/11/2026): https://btcpokerclub.online** — o PRÓPRIO
  backend na Hostinger serve o site e a API no mesmo domínio. Deploy
  automático a cada `git push origin main` (app "btcpokerclub.online" no
  hPanel, pasta raiz `backend`).
- **Frontend**: `frontend/` — React 19 + Vite. Em produção é servido pelo
  backend a partir de `backend/public/site`, que é VERSIONADO no git:
  **antes de qualquer push com mudança de tela, rode
  `cd frontend && npm run build:site`** e commite a pasta, senão vai ao ar
  o site antigo. O endereço do servidor no frontend fica só em
  `frontend/src/services/servidor.js` (em produção usa a própria origem).
- **Backend**: `backend/` — Node/Express/Socket.io na Hostinger. Variáveis
  `SERVER_URL` e `CLIENT_URL` = `https://btcpokerclub.online`.
- **Vercel**: o projeto antigo (`poker-game-tawny-rho.vercel.app`) não é
  mais a produção e aponta para um endereço desativado; não usar.
- **Banco/login**: Firebase (Auth + Firestore), projeto `poker-texas-hold-1ec8d`.
- **Pagamento**: Mercado Pago, credenciais de PRODUÇÃO já configuradas.

## Regras que NÃO PODEM ser esquecidas

1. **Todo `git push origin main` reinicia o backend na Hostinger — mesmo
   quando só `frontend/` mudou — e isso APAGA todo jogo em andamento.**
   Mesas e torneios vivem só em memória (um `Map`), não em banco.
   CONFIRMADO na prática em 24/07/2026: um push só de frontend (fix
   cosmético em `ListaMesas.jsx`) derrubou uma mesa real em andamento —
   a suposição antiga aqui ("mudança só em frontend não reinicia o
   backend") estava ERRADA; a Hostinger parece redeployar o app inteiro
   a cada push na `main`, sem filtrar por path. **Trate TODO push como
   risco de derrubar jogo em andamento — sempre avise o usuário antes,
   sem exceção**, e confira `curl .../health` (uptime) logo depois pra
   confirmar se reiniciou mesmo.

2. **Nunca confie em valores vindos do cliente pra qualquer coisa
   financeira.** Todo cálculo de taxa, valor debitado/creditado, tem que
   ser recalculado no servidor. Já teve um exploit real de "imprimir"
   ₿C por causa disso — não repita.

3. **`<style>` solto dentro de um componente que entra/sai do DOM
   condicionalmente é arriscado.** Foi a mitigação aplicada pra um bug
   intermitente de tela preta (erro do React "insertBefore"). Sempre que
   precisar de uma animação/`@keyframes`, coloque no CSS global de
   `frontend/src/main.jsx`, não numa tag `<style>` dentro do componente.

4. **Depois de qualquer deploy, confirme que o bundle novo está no ar**
   antes de pedir pro usuário testar (`curl` no `index.html`, procurar o
   nome do arquivo `assets/index-XXXX.js` e comparar com o que acabou de
   buildar). Cache de CDN/navegador engana fácil.

5. **Ao mexer no motor do jogo (`game-manager.js`), teste com um script
   Node usando `socket.io-client` direto contra o servidor (local ou
   produção) antes de pedir pro usuário testar manualmente** — muitos
   bugs financeiros/de side-pot só aparecem com múltiplos jogadores e são
   fáceis de simular assim, mais rápido que testar na mão.

6. **Firebase Storage não está habilitado (exige plano pago) — não usar.**
   Upload de foto de perfil vai pro próprio servidor (`backend/public/
   avatares/`, servido como estático em `/avatares`), não pro Storage.

7. **Toda checagem de permissão (admin, senha de mesa privada, PIN) tem
   que ser validada no SERVIDOR.** Já teve dois bugs reais de segurança
   assim: senha de mesa privada nunca era checada, e o cliente podia
   inflar valores numa transferência.

8. **Campos de estado que parecem "não usados" podem ser críticos —
   não remova sem checar quem lê:**
   - `jogador.origemBonus` (game-manager.js): quanto do stack na mesa
     veio de saldo BÔNUS. `creditarSaidaMesa`/`wallet:enviar` usam isso
     pra nunca devolver mais bônus do que entrou — sem ele, bônus vira
     saldo real sacável (exploit real, corrigido em 24/07/2026).
   - `mesa.contribuicoesEncerradas` (game-manager.js): fichas de quem
     SAIU da mesa (não só deu fold) no meio de uma mão com side pot —
     sem isso o dinheiro deles some do cálculo do pote certo.
   - `mesa.turnoExpiraEm` (game-manager.js): prazo absoluto do timer de
     ação, usado pelo frontend (`Temporizador.jsx`) pra contar a partir
     do deadline real do servidor, não de um timestamp local.

9. **Torneio não funciona por "merge de mesas dinâmico"** (apesar do
   que a seção 2.6 do relatório sugere) — cada rodada cria mesas novas
   que jogam até sobrar 1 vencedor cada, resetando stacks. É um formato
   tipo bracket/Sit&Go em série, não um MTT clássico. Ver seção 4 do
   relatório pra detalhes — não é bug, é a arquitetura atual.

## Comandos úteis

```bash
# Rodar backend local
cd backend && node server.js

# Rodar frontend local
cd frontend && npm run dev

# Compilar o site para produção (sempre antes de subir mudança de tela)
cd frontend && npm run build:site   # gera backend/public/site — commitar

# Testes do motor/dinheiro (rodar antes de todo push)
cd backend && npm test

# Ver se o deploy está no ar (uptime baixo = reiniciou; compare o bundle)
curl -s https://btcpokerclub.online/health
curl -s https://btcpokerclub.online/ | grep -o 'assets/index-[^"]*\.js'

# Ver se a conexão do jogo responde
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://btcpokerclub.online/socket.io/?EIO=4&transport=polling"
```

## Antes de reportar algo como "corrigido"

Escreva um script rápido em Node (`socket.io-client` + `firebase-admin`
direto, sem precisar de navegador) que reproduza o bug contra produção,
confirme que reproduz ANTES da correção, e confirme que resolve DEPOIS.
Isso pegou bugs reais nesta sessão (side pot, reconexão, senha de mesa
privada) que só "pareciam" corrigidos de olhar o código.

**Testar o motor localmente sem tocar em dados reais:** o backend cai
sozinho em "modo offline" (sem Firebase) se `firebase-credentials.json`
não existir e as env vars `FIREBASE_CREDENTIALS`/`FIREBASE_CREDENTIALS_BASE64`
não estiverem setadas — nesse modo, `debitarEntradaMesa`/`creditarSaidaMesa`
viram no-ops que sempre "sucedem", então dá pra testar `criar_mesa`,
`entrar_mesa`, `acao` etc. com uids fictícios sem precisar de contas reais
no Firestore. Pra isso: mova `firebase-credentials.json` pra outro nome
temporariamente, rode `PORT=3711 node server.js` local, teste com
`socket.io-client` (já vem instalado em `frontend/node_modules`, rode o
script de dentro de `frontend/` pra resolver o import), e **sempre
restaure o arquivo de credenciais e mate o processo de teste no final** —
foi assim que os bugs de ordem de turno e do loop infinito de check desta
sessão (24/07/2026) foram encontrados e confirmados corrigidos.
