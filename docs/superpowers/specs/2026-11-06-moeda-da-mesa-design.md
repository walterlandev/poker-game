# Moeda da mesa: Real ou Bônus

Data: 06/11/2026 · Aprovado em grilling pelo dono do projeto · Branch base: `integracao-2026-11-06`

## Objetivo

Separar de vez as duas economias do jogo. Quem cria a mesa (ou o torneio) escolhe a moeda,
e tudo o que acontece nela usa só essa moeda: entrada, rebuy, saída e prêmio. Assim o bônus
(que existe para testar a plataforma) nunca vira saldo sacável, nem por mistura de fichas.

## Regras aprovadas

1. **Dois tipos de mesa:** `real` (paga com saldo real, sacável) e `bonus` (paga com saldo bônus).
   A "mesa de treino" (sem cobrança) deixa de existir e é substituída pela mesa de bônus.
2. **Entrada:** a mesa `real` debita **só** `saldo`; a mesa `bonus` debita **só** `saldoBonus`.
   Nunca se misturam. Sem saldo suficiente na moeda da mesa, a entrada é recusada. O rebuy
   segue a mesma regra.
3. **Saída e ganhos:** tudo o que o jogador tiver ao sair volta **na moeda da mesa**: ao sair,
   desconectar, ser removido por inatividade ou vencer por W.O.
4. **Bots:** só em mesa `bonus`, e nunca em torneio. Os bots continuam recomprando fichas do
   nada; numa mesa de bônus, quem ganha deles recebe bônus criado do nada. Isso foi aceito:
   o bônus nunca é sacável nem enviável.
5. **Torneios:** quem cria escolhe `real` ou `bonus`. Buy-in, rebuy e prêmio na mesma moeda,
   inclusive os reembolsos de torneio abandonado. Torneio continua sem bots.
6. **Enviar ₿C (`wallet:enviar`):** só o saldo **real** pode ser enviado. Saldo bônus não sai
   da conta do jogador.
7. **Ranking e estatísticas:** só mesas `real` contam. Mesas `bonus` não gravam ranking nem
   estatística.
8. **Rede de segurança:** o controle de origem do bônus (`jogador.origemBonus`, `pagoBonus`,
   `premioBonus`) continua no código. Numa mesa `real` ele fica em 0 no fluxo normal; se por
   erro aparecer bônus numa mesa real, ele continua impedindo que vire saldo sacável.

## Contrato técnico

### Estado da mesa (`game-manager.js`)

- `mesa.moeda: 'real' | 'bonus'` substitui `mesa.treino`.
- **Quem define é o servidor**, a partir de `config.moeda` validado:
  - `'real'` ou `'bonus'` são aceitos; qualquer outro valor vira `'real'`;
  - `config.moeda === 'real'` com bots maior que 0 → recusa: "Bots só jogam em mesa de bônus.";
  - compatibilidade com cliente antigo: sem `config.moeda` e com bots maior que 0 → `'bonus'`;
  - mesa de torneio herda `torneio.moeda` e nunca tem bots.
- `adicionarBot` só é aceito se `mesa.moeda === 'bonus'` e a mesa não é de torneio.
- `mesa.moeda` vai no estado enviado aos clientes (`estado_mesa`) e em cada item do `GET /mesas`.
  O campo `treino` deixa de ser enviado.

### Dinheiro (`firebase-admin.js`, `servico-mesas.js`)

- `debitarEntradaMesa(uid, valor, moeda)`: debita **só** o campo da moeda (`saldo` ou
  `saldoBonus`), numa transação. Sem saldo suficiente → `{ sucesso: false, erro }` com a
  mensagem da seção "Mensagens".
- `creditarSaidaMesa(uid, fichas, moeda, origemBonus)`: credita **na moeda da mesa**. Na moeda
  `bonus`, tudo vai para `saldoBonus`. Na moeda `real`, vale a regra atual de `origemBonus`
  (rede de segurança).
- Todos os chamadores passam `mesa.moeda`: criar, entrar, rebuy, sair, desconectar, remoção
  por inatividade, rebuy e prêmio de torneio, reembolso de torneio abandonado.
- O código de "treino" (pular débito e crédito) é removido.
- Travas por jogador e estornos já existentes continuam valendo, com o estorno na moeda certa.

### Torneio (`tournament-manager.js`)

- `torneio.moeda: 'real' | 'bonus'`, validado no servidor como na mesa.
- Buy-in, rebuy, prêmio e reembolso na moeda do torneio.

### Carteira (`wallet/wallet-manager.js`)

- `wallet:enviar` debita e credita só `saldo` (real). Se o saldo real for insuficiente,
  recusa com a mensagem da seção "Mensagens", mesmo que haja bônus.

### Ranking

- `salvarResultado` só roda para mesas `real`.

## Mensagens (evento `erro`, campo `mensagem`)

- "Esta mesa é de bônus. Você precisa de ₿C {valor} de bônus para entrar."
- "Esta mesa é de saldo real. Você precisa de ₿C {valor} de saldo real para entrar."
- "Bots só jogam em mesa de bônus."
- "Só o saldo real pode ser enviado. Seu saldo real é ₿C {valor}."

## Interface (agente de design, depois da Carteira)

- `ModalCriarMesa` e criação de torneio: seletor **Real / Bônus**, com Real como padrão. Bots
  só aparecem com Bônus. Mostrar quanto o jogador tem na moeda escolhida.
- `ListaMesas`: etiqueta "Real" ou "Bônus" em cada mesa e filtro por moeda. O botão Entrar
  explica quando falta saldo naquela moeda.
- Dentro da mesa: indicar a moeda no cabeçalho, trocando a indicação "Mesa de treino".
- Carteira, Enviar ₿C: deixar claro que só o saldo real é enviável.
- Ler o campo com segurança (`mesa?.moeda ?? 'real'`).

## Testes (TDD, `backend/test/`)

Cada item tem que falhar antes da mudança e passar depois:

1. Mesa `real`: entrar debita só `saldo`; sem saldo real suficiente (mesmo com bônus) recusa.
2. Mesa `bonus`: entrar debita só `saldoBonus`; sem bônus suficiente (mesmo com real) recusa.
3. Sair, desconectar, ser removido por inatividade ou vencer por W.O.: credita na moeda da mesa.
4. Rebuy cobra na moeda da mesa.
5. `adicionarBot` em mesa `real` é recusado; em mesa `bonus` é aceito; em torneio é recusado.
6. `config.moeda` inválido vira `real`; `real` com bots é recusado; cliente antigo com bots e sem
   moeda vira `bonus`.
7. Torneio `bonus`: buy-in, rebuy, prêmio e reembolso em bônus; torneio `real`, em real.
8. `wallet:enviar` não usa bônus; sem saldo real suficiente recusa.
9. Mesa `bonus` não grava ranking; mesa `real` grava.
10. Fuzz de invariantes: numa mesa `real`, nenhum bônus se cria; numa mesa `bonus`, nenhum saldo
    real se cria.
11. A suíte atual continua verde (hoje: 85/85), adaptando os testes de "treino" para "bônus".

## Fora do escopo

- Persistir mesas em banco (continua só em memória).
- Mudar valores de taxa, limites de saque ou o bônus de boas-vindas.
- Converter bônus em real em qualquer situação.

## Entrega

- Backend: agente da lógica, na branch dele a partir da `integracao-2026-11-06`, com um commit
  por regra e a suíte completa no fim.
- Interface: agente de design, depois da Carteira.
- Junção na integração só depois da minha revisão. O push continua único, com o aviso de que
  todo push reinicia o backend e derruba as mesas em andamento.
