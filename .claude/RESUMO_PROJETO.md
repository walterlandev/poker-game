# Poker Game (₿C Bitchager) — resumo do projeto

Resumo curto para começar uma sessão sem ler tudo. Detalhe completo (regras de
cada tela, histórico item a item): `.claude/RELATORIO_PROJETO.txt`. Regras de
trabalho: `CLAUDE.md`. Notas e diário também no Obsidian:
`wasobsidia/Projetos/Poker Game/`.

Atualizado em: 05/11/2026 (último commit no código: 04/08/2026, `17aca68`).

## O que é

Texas Hold'em online multiplayer em tempo real com moeda interna ₿C, comprada
via PIX (Mercado Pago, produção) e sacada por PIX com confirmação manual do
admin. Inclui mesas comuns com bots, torneios, carteira (saldo real + bônus),
ledger tipo blockchain, loja de temas de baralho, perfil com foto e painel admin.

## Onde mora cada coisa

| Parte | Tecnologia | Onde |
|---|---|---|
| Frontend | React 19 + Vite 8 (rolldown) | `frontend/`, Vercel: https://poker-game-tawny-rho.vercel.app |
| Backend | Node + Express + Socket.io | `backend/`, Hostinger: https://brown-wolverine-631802.hostingersite.com |
| Login/banco | Firebase Auth + Firestore | projeto `poker-texas-hold-1ec8d` |
| Pagamento | Mercado Pago (produção) | webhook exige `MP_WEBHOOK_SECRET` |
| Repositório | GitHub `walterlandev/poker-game` | push na `main` = deploy nos dois lados |

Arquivos-chave do backend: `server.js` (sockets, rotas, autenticação por
idToken), `game-manager.js` (motor do poker), `tournament-manager.js`,
`firebase-admin.js` (débito/crédito de saldo), `admin.js`, `wallet/`, `core/`
(blockchain interna).

## Regras que já custaram caro

1. Todo push na `main` reinicia o backend e apaga mesas/torneios em andamento
   (estado só em memória). Avisar o usuário antes de qualquer push.
2. Nada financeiro vem do cliente: taxa, buy-in, blind, valor de envio são
   validados e recalculados no servidor.
3. Permissões (admin, senha de mesa, PIN, identidade) só valem se checadas no
   servidor. O `autenticar` usa o uid do idToken verificado, nunca o enviado.
4. Nada de `<style>` dentro de componente; animações vão no CSS global de
   `frontend/src/main.jsx` (mitigação da tela preta "insertBefore").
5. Campos que parecem sobrando e não são: `jogador.origemBonus`,
   `mesa.contribuicoesEncerradas`, `mesa.turnoExpiraEm`.
6. `backend/node_modules/` é versionado no git (a Hostinger não roda
   `npm install`): mudança de dependência só chega a produção se o
   `node_modules` for commitado junto.
7. Testar o motor com script `socket.io-client` contra backend local em modo
   offline (sem `firebase-credentials.json`) antes de pedir teste manual.

## Linha do tempo

- **10–12/04/2026 — primeira versão.** Estrutura, deploy Vercel, CORS, tela do
  jogo, ranking no Firestore, perfil e avatares, temporizador e faltas, carteira
  com PIN e Mercado Pago, tema Royal e loja, temas de carta, força da mão
  (Monte Carlo), configurações. Backend ainda no Railway.
- **23/07/2026 — retomada e estabilização.** Migração Railway → Hostinger,
  `.env` tirado do repositório público, sem top-level await (Hostinger carrega
  via `require()`), ping do Socket.io menor, Mercado Pago de produção. Motor,
  carteira e torneio corrigidos; blockchain interna ligada e persistida; painel
  admin criado; convite por link para mesa; rebuy; reconexão sem "fantasma";
  senha de mesa privada checada no servidor; lobby em tempo real.
- **24/07/2026 — auditoria geral.** Exploits fechados: buy-in negativo,
  smallBlind negativo, bônus virando saldo sacável, taxa de depósito vinda do
  cliente, webhook sem assinatura, crédito duplicado de depósito, spoofing de
  identidade no `autenticar`. Torneio: W.O. encerrava a rodada, saída creditava
  fichas como saldo real, rebuy após o fim. Motor: ordem de turno ao sair,
  loop infinito de check, rodízio do dealer, side pot de quem sai, rebuy de bot
  atrasado. Frontend: `<style>` soltos removidos, timer pelo prazo do servidor,
  vazamento de listener, mesas em andamento visíveis no lobby, avatar enviado
  para o próprio servidor.
- **02–04/08/2026 — manutenção.** README profissional; `npm audit fix` nos dois
  lados; 8 moderadas restantes (uuid) resolvidas com `overrides` sem rebaixar
  o `firebase-admin`. Produção conferida depois do push.
- **05/11/2026 — ambiente local.** Faltava o binário nativo do rolldown para
  Windows no `frontend/node_modules`; instalado com
  `npm install --no-save @rolldown/binding-win32-x64-msvc@1.2.2`.
  Notas do projeto criadas no Obsidian e este resumo.

## Pendências abertas

- **Resolvido em 06/11/2026 (01:08 UTC):** as regras do Firestore deixavam o
  usuário escrever o próprio `jogadores/{uid}` inteiro (saldo, admin, PIN) e
  o próprio ranking. As novas regras (`firestore.rules`) já estão publicadas:
  o cliente só cria perfil zerado e só edita nome/avatar/telefone/email.
  Teste contra produção: 21/21. Publicar regras não reinicia o backend
  (Admin SDK `releaseFirestoreRulesetFromSource` ou console do Firebase).
- `Login.jsx` corrigido localmente (perfil nasce com saldo 0, como no
  Cadastro), **ainda não enviado**: até o próximo push, um jogador novo que
  entrar com Google pela tela de Login, sem passar pelo Cadastro, recebe erro
  ao criar o perfil.

- **Alto:** mesas e torneios só em memória (todo deploy derruba jogos). Correção
  real exige persistir estado (Firestore/Redis) e reestruturar `game-manager.js`.
- **Foto de perfil some no deploy (provável):** o arquivo-marcador
  `/avatares/ncnoBxfwKMRhWaA1OujSb3Y9HsD2.png` respondeu 404 em 05/11/2026,
  depois dos pushes de 04/08. Indica que `backend/public/avatares/` é apagada a
  cada deploy. Precisa de storage externo (Cloudinary, S3 ou Firebase Storage pago).
- **Corrida no cadastro:** `CriarPin.jsx` depende de socket que só conecta no fim
  do wizard; a etapa "Criar PIN" pode travar em "Salvando..." e, ao recarregar,
  o jogador entra sem PIN. Reproduzível localmente.
- **Ranking mostra "₿C undefined"** (provável nome de campo divergente).
- **All-in repetido / timer preso** relatado em produção; investigação
  interrompida. Próximo passo: testar "entrar numa mesa já em andamento" pelo lobby.
- **Tela preta "insertBefore":** mitigada, causa raiz não confirmada.
- Saque é manual (sem API de PIX para chave qualquer).
- Código morto: `wallet.js` (ECDSA) e partes de `transactions.js`; remover só
  com ok do usuário.
- Torneio funciona como bracket (Sit & Go em série), não MTT com merge de mesas.
- Ideias não construídas: mesa em layout vertical no celular; botão de
  atualizar manual no lobby.

## Rodar local

```bash
cd backend && node server.js        # porta 3001 (com Firebase real se houver credenciais)
cd frontend && npm run dev          # porta 5173; .env.local aponta para localhost:3001
```

Com `firebase-credentials.json` presente, o backend local mexe no Firestore de
produção (saldos reais).
