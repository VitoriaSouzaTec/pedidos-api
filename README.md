# pedidos-api

[![CI](https://github.com/VitoriaSouzaTec/pedidos-api/actions/workflows/ci.yml/badge.svg)](https://github.com/VitoriaSouzaTec/pedidos-api/actions/workflows/ci.yml)

API REST de **Pedidos**: cria, consulta, paga e cancela pedidos. Node + TypeScript + Express 5 + Postgres 16.

- **Nível escolhido:**  projeto B. domínio único — **Pedidos**. Um fluxo principal (`POST /orders`), sem decomposição em módulos ou microsserviços.
- **Pattern:** Repository (ver [ADR 0001](docs/adr/0001-decisao.md)).
- **Dinheiro sempre em centavos** (inteiros).

## Pré-requisitos

- Docker e Docker Compose
- Node 22.12+ e npm (para rodar testes e lint fora do Docker)
- k6 (opcional, para o smoke test; também roda via Docker)

## Como subir

```bash
cp .env.example .env && docker compose up --build
```

A API fica em `http://localhost:3000`. O Postgres é criado com `db/init.sql` na primeira subida.

Se a porta 3000 estiver ocupada: `API_PORT=3001 docker compose up --build`.

Para parar: `docker compose down` (adicione `-v` para apagar os dados do banco).

## Como testar

```bash
npm ci && npm test
```

Roda testes unitários (domínio e serviço) e o teste de integração da API (Supertest com repositório em memória, sem banco), com coverage mínimo de 80% em lines, functions, branches e statements.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint:openapi` | Spectral no `docs/openapi.yaml` (falha com warning) |
| `npm run build` | compila para `dist/` |
| `npm run dev` | modo watch com `tsx` (precisa de um Postgres acessível em `DATABASE_URL`) |
| `npm run smoke` | smoke test k6 |

## Fluxo com curl

```bash
# cria (201 + Location)
curl -s -i -X POST localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{"customerId":"cli-1","items":[{"productId":"p1","quantity":2,"unitPriceCents":1500}]}'

ID=<id retornado>

# consulta (200)
curl -s localhost:3000/orders/$ID

# paga (200 → status PAID)
curl -s -X POST localhost:3000/orders/$ID/pay

# tenta cancelar pedido pago (409 INVALID_TRANSITION)
curl -s -X POST localhost:3000/orders/$ID/cancel

# saúde e métricas
curl -s localhost:3000/health
curl -s localhost:3000/metrics
```

Exemplo de pedido:

```json
{
  "id": "b1209b5d-618c-4183-b0e5-01b7510f98ae",
  "customerId": "cli-1",
  "items": [{ "productId": "p1", "quantity": 2, "unitPriceCents": 1500 }],
  "status": "PENDING",
  "totalCents": 3000,
  "createdAt": "2026-11-15T21:24:00.668Z",
  "updatedAt": "2026-11-15T21:24:00.668Z"
}
```

## Endpoints

| Método | Rota | Resposta |
|---|---|---|
| POST | `/orders` | 201 + `Location` / 400 |
| GET | `/orders/:id` | 200 / 404 |
| POST | `/orders/:id/pay` | 200 / 404 / 409 |
| POST | `/orders/:id/cancel` | 200 / 404 / 409 |
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/metrics` | formato Prometheus |

Transições válidas: `PENDING → PAID` e `PENDING → CANCELLED`.

Erros têm o formato `{ "code": "...", "message": "..." }`:

| Código | HTTP |
|---|---|
| `VALIDATION_ERROR`, `INVALID_CUSTOMER`, `EMPTY_ORDER`, `INVALID_QUANTITY`, `INVALID_PRICE` | 400 |
| `ORDER_NOT_FOUND` | 404 |
| `INVALID_TRANSITION` | 409 |
| `INTERNAL_ERROR` | 500 |

Contrato completo: [docs/openapi.yaml](docs/openapi.yaml).

## Smoke test k6

Com a stack no ar:

```bash
k6 run k6/smoke.js
# ou, sem k6 instalado:
docker run --rm -i --network host -v "$PWD/k6:/scripts:ro" grafana/k6 run /scripts/smoke.js
```

`BASE_URL` muda o alvo (padrão `http://localhost:3000`). Resultados e SLO em [docs/desempenho.md](docs/desempenho.md).

## Configuração

Variáveis (ver `.env.example`), validadas com Zod na subida. A API não sobe se forem inválidas:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | porta HTTP |
| `DATABASE_URL` | — | `postgres://usuario:senha@host:5432/banco` |
| `LOG_LEVEL` | `info` | nível do pino |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | — | usados pelo container `db` |

## Estrutura

```
src/
  domain/          entidade Order, DomainError, interface OrderRepository
  application/     OrderService (casos de uso)
  infra/           PgOrderRepository (Postgres) e InMemoryOrderRepository (testes)
  http/            createApp: rotas Express, validação Zod, tradução de erros
  observability/   logger pino e métrica Prometheus
  config.ts        validação do ambiente
  server.ts        Pool do Postgres, listen e graceful shutdown
tests/
  unit/            Order e OrderService
  integration/     API com Supertest
db/init.sql        schema do banco
docs/              ADR, OpenAPI, desempenho, uso de IA
k6/smoke.js        smoke test
.github/workflows/ci.yml
```

## Documentação

- [ADR 0001 — Repository pattern com `pg`](docs/adr/0001-decisao.md)
- [OpenAPI](docs/openapi.yaml)
- [Desempenho e SLO](docs/desempenho.md)
- [Uso de IA](docs/ia.md)
- [Contribuidores](CONTRIBUTORS.md)
