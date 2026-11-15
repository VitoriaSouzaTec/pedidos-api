---
status: aceito
date: 2026-11-15
decision-makers: Vitória
---

# ADR 0001 — Persistência de pedidos com Repository pattern e `pg` puro

## Contexto e problema

A `pedidos-api` é um serviço de domínio único (Pedidos), com um fluxo principal:
criar → consultar → pagar/cancelar. As regras de negócio (validação dos itens,
total em centavos, transições de status) precisam ser testáveis rapidamente e sem
banco, e a persistência precisa ser em Postgres 16.

Como organizar o acesso ao banco para manter o domínio isolado da infraestrutura,
com o mínimo de complexidade para um único agregado?

## Fatores de decisão

- Testar regras e a API HTTP sem subir Postgres (testes rápidos, CI simples).
- Respeitar SRP e DIP: domínio e casos de uso não conhecem SQL nem driver.
- Poucas dependências e pouca "mágica" para um único agregado (`Order`).
- SQL explícito e revisável (`ON CONFLICT`, `JSONB`, `CHECK`).
- Facilidade de explicar e manter.

## Opções consideradas

1. **Repository + driver `pg` com SQL puro**
2. **ORM Prisma**
3. **Acesso direto ao banco no controller** (queries dentro das rotas Express)

## Decisão

Opção escolhida: **Repository + `pg` com SQL puro**.

O domínio define a interface `OrderRepository { save(order); findById(id) }`.
Há duas implementações:

- `PgOrderRepository` (produção): SQL puro com `pg`; `save` é um upsert
  `INSERT ... ON CONFLICT (id) DO UPDATE` que atualiza `status` e `updated_at`.
- `InMemoryOrderRepository` (testes): `Map` em memória que guarda cópias.

`OrderService` e `createApp(repo)` recebem o repositório por injeção, então os
testes unitários e de integração (Supertest) rodam sem banco.

É a opção que atende a todos os fatores de decisão com o menor custo: uma interface
de dois métodos, uma implementação Postgres de ~60 linhas e nenhuma geração de código.

## Consequências

### Positivas

- Domínio e aplicação independentes da infraestrutura (DIP); trocar o banco
  significa escrever outra implementação da interface.
- Testes rápidos e determinísticos com o repositório em memória; coverage de
  100% no domínio, serviço e HTTP sem Postgres.
- SQL visível e sob controle: upsert, `JSONB` para itens, `CHECK` de status e
  de total, índice em `customer_id`.
- Poucas dependências de runtime (só `pg`), imagem Docker menor.

### Negativas

- Mapeamento linha ↔ entidade é manual (`snake_case` → `camelCase`,
  `BIGINT` → `number`).
- Sem migrations automáticas: o schema vem de `db/init.sql`, que só roda quando o
  volume do Postgres é criado. Mudanças de schema precisarão de uma ferramenta de
  migração no futuro.
- `PgOrderRepository` não é coberto pelos testes automatizados (excluído do
  coverage); é validado pelo `docker compose` + smoke k6. Um teste com
  Testcontainers resolveria.
- O repositório em memória pode divergir do comportamento real do Postgres
  (ex.: tipos, concorrência).

## Prós e contras das opções

### Repository + `pg` com SQL puro

- Bom: isolamento do domínio, testes sem banco, SQL explícito, poucas dependências.
- Ruim: mapeamento manual, sem migrations.

### ORM Prisma (alternativa descartada)

- Bom: tipos gerados a partir do schema, migrations prontas, menos SQL manual.
- Ruim: etapa de geração de código (`prisma generate`) no build e no CI, engine
  extra na imagem Docker, abstração maior do que o necessário para um único
  agregado; `JSONB` e upsert com regras específicas ficam menos diretos. Sem um
  repositório por cima, o domínio passaria a depender do client do Prisma; com um
  repositório por cima, o Prisma vira custo sem benefício proporcional.

### Acesso direto ao banco no controller

- Bom: o mais simples de escrever no início.
- Ruim: mistura HTTP, regra de negócio e SQL (viola SRP); impossível testar a API
  sem banco; regras de transição espalhadas pelas rotas.

## Mais informações

- Código: `src/domain/order-repository.ts`, `src/infra/pg-order-repository.ts`,
  `src/infra/in-memory-order-repository.ts`.
- Schema: `db/init.sql`.
- Reavaliar se surgirem novos agregados, consultas complexas ou necessidade de
  migrations versionadas.
