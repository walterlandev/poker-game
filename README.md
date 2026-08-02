# 🃏 Poker Game — ₿C Bitchager

Texas Hold'em online multiplayer em tempo real, com uma moeda interna (**₿C — Bitchager**) que pode ser comprada com dinheiro real via PIX e sacada de volta, carteira com extrato auditável, torneios e painel administrativo completo.

> [poker-game-tawny-rho.vercel.app](https://poker-game-tawny-rho.vercel.app)

---

## ✨ Funcionalidades

### Mesa e motor de jogo
- Texas Hold'em completo: pré-flop, flop, turn, river, com rotação de dealer e regras padrão de heads-up.
- Fold / Check / Call / Raise / All-in, com validação de quais ações são possíveis em cada momento.
- **Side pots** corretos quando há all-in com stacks diferentes entre os jogadores.
- Recompra (rebuy) na mesa quando o jogador zera as fichas, sem ser removido à força.
- Timeout de ação (45s jogador humano / 10s bot) com remoção automática após faltas seguidas.
- Bots com IA baseada na força da mão e agressividade própria, com rebuy automático.

### Carteira (₿C)
- Saldo **real** (sacável) e saldo **bônus** (só jogável), com PIN de segurança obrigatório.
- Depósito via **PIX** (Mercado Pago) com confirmação automática por webhook.
- Saque via PIX com taxa e limite diário, sujeito à confirmação manual do administrador.
- Envio de ₿C entre jogadores, com taxa sempre recalculada no servidor.
- Extrato completo com filtro por tipo e período.
- **Ledger interno tipo blockchain** (blocos encadeados, prova de trabalho e hash) para auditoria de todas as movimentações de saldo.

### Torneios
- Buy-in fixo, fichas iniciais fixas e múltiplas mesas em paralelo.
- Prêmio total creditado automaticamente ao campeão.
- Convite direto por link.

### Lobby, loja e ranking
- Abas de Carteira, Mesas, Torneio, Ranking, Loja e Admin.
- Lista de mesas em tempo real (criação, início de jogo, mesa cheia ou encerrada).
- Loja de temas de baralho, visíveis para os demais jogadores na mesa.
- Ranking dos melhores jogadores por pontuação.

### Painel administrativo
- Visível apenas para usuários com `isAdmin` (validado sempre no servidor).
- Gestão de usuários, aprovação de depósitos e saques pendentes com conferência de chave PIX.

### Perfil
- Avatares padrão ou upload de foto própria, visível aos demais jogadores na mesa.
- Dados de nome, telefone e e-mail editáveis.

---

## 🛠️ Stack tecnológica

**Frontend** (`frontend/`)
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Firebase](https://firebase.google.com/) (Auth + Firestore, client SDK)
- [Socket.IO Client](https://socket.io/) — comunicação em tempo real com o backend
- Deploy contínuo na [Vercel](https://vercel.com/)

**Backend** (`backend/`)
- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) + [Socket.IO](https://socket.io/)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) — Auth e Firestore
- [bcrypt](https://www.npmjs.com/package/bcrypt) — hash do PIN de segurança
- Integração com a API do [Mercado Pago](https://www.mercadopago.com.br/developers) (PIX)
- Deploy contínuo na Hostinger

> Todo estado de jogo (mesas e torneios em andamento) vive em memória no processo do backend — não é persistido em banco de dados.

---

## 📁 Estrutura do projeto

```
poker-game/
├── backend/
│   ├── server.js              # Servidor Express + Socket.io
│   ├── game-manager.js        # Orquestração de mesas em andamento
│   ├── tournament-manager.js  # Orquestração de torneios
│   ├── core/                  # Motor de poker (baralho, regras, bots)
│   ├── wallet/                # Carteira, transações, blockchain interna, Mercado Pago
│   └── firebase-admin.js      # Inicialização do Firebase Admin SDK
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Auth/          # Login, cadastro, criação de PIN
│       │   ├── Lobby/         # Mesas, ranking, loja, configurações
│       │   ├── Game/          # Mesa, cartas, temporizador, ações
│       │   ├── Wallet/        # Depósito, saque, envio, extrato
│       │   ├── Campeonato/    # Torneios
│       │   └── Admin/         # Painel administrativo
│       ├── components/        # Componentes de UI reutilizáveis
│       ├── core/               # Lógica compartilhada do lado do cliente
│       └── services/           # Clientes de API/Socket.io
├── firebase.json / firestore.rules / .firebaserc
└── vercel.json
```

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Um projeto no [Firebase](https://console.firebase.google.com/) com Auth e Firestore habilitados
- Credenciais de uma aplicação do [Mercado Pago](https://www.mercadopago.com.br/developers) (opcional, apenas para testar depósito/saque)

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 🔐 Variáveis de ambiente

**Backend** (`backend/.env`)

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor Express/Socket.io |
| `CLIENT_URL` | Origem permitida no CORS (URL do frontend) |
| `FIREBASE_CREDENTIALS` ou `FIREBASE_CREDENTIALS_BASE64` | Credenciais da conta de serviço do Firebase Admin |
| `MP_ACCESS_TOKEN` | Access token da API do Mercado Pago |
| `MP_WEBHOOK_SECRET` | Segredo para validar o webhook de pagamento |

> Sem `FIREBASE_CREDENTIALS`, o backend sobe em modo offline (sem persistência real), útil só para testes locais do motor de jogo.

**Frontend** (`frontend/.env`)

| Variável | Descrição |
|---|---|
| `VITE_FIREBASE_API_KEY` | Chave da Web API do projeto Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domínio de autenticação do Firebase |
| `VITE_FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket do Firebase |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID do Firebase Cloud Messaging |
| `VITE_FIREBASE_APP_ID` | ID do app Firebase |
| `VITE_SERVER_URL` | URL do backend (Socket.io + REST) |

---

## ☁️ Deploy

- **Frontend:** deploy automático na Vercel a cada `git push` na branch `main`.
- **Backend:** deploy automático na Hostinger a cada `git push` na branch `main`.

## 📄 Licença

Projeto pessoal — todos os direitos reservados.
