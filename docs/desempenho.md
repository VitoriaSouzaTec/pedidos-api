# Desempenho e SLO

## SLO

| Item | Valor |
|---|---|
| Endpoint | `POST /orders` (endpoint principal) |
| Latência | **p95 < 300 ms** |
| Taxa de erro | **< 1%** (respostas 5xx sobre o total) |
| Janela | **28 dias** |

Orçamento de erro: 1% das requisições de `POST /orders` em 28 dias podem falhar ou passar de 300 ms no p95 sem violar o SLO.

## Métrica

A API expõe em `GET /metrics` (formato Prometheus) o histograma:

```
http_request_duration_seconds{method, route, status}
buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2 (segundos)
```

O label `route` usa o padrão da rota do Express (`/orders`, `/orders/:id`, `/orders/:id/pay`…), não a URL com o id, para manter a cardinalidade baixa. Requisições sem rota correspondente ficam com `route="unmatched"`.

### PromQL

p95 de `POST /orders`:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route="/orders",method="POST"}[5m])) by (le))
```

Taxa de erro de `POST /orders`:

```promql
sum(rate(http_request_duration_seconds_count{route="/orders",method="POST",status=~"5.."}[5m]))
/
sum(rate(http_request_duration_seconds_count{route="/orders",method="POST"}[5m]))
```

Para a janela de 28 dias do SLO, troque `[5m]` por `[28d]` (ou use recording rules).

## Como rodar o smoke k6

Com a stack no ar (`cp .env.example .env && docker compose up --build -d`):

```bash
k6 run k6/smoke.js
```

Sem k6 instalado, usando a imagem oficial:

```bash
docker run --rm -i --network host -v "$PWD/k6:/scripts:ro" grafana/k6 run /scripts/smoke.js
```

Para outra URL: `BASE_URL=http://localhost:3001 k6 run k6/smoke.js` (no Docker, `-e BASE_URL=...`).

O script roda **2 VUs por 30 s**, executando criar → consultar → pagar com `check`s de status, e falha se:

- `http_req_failed` ≥ 1%;
- p95 de `POST /orders` ≥ 300 ms.

## Resultado medido

Execução em 2026-11-15, k6 v2.4.0 (imagem `grafana/k6`), API e Postgres 16 em `docker compose` na máquina local (Linux), 2 VUs, 30 s.

| Métrica | `POST /orders` | Todas as requisições |
|---|---|---|
| **p95** | **17,07 ms** | 16,43 ms |
| p99 | 28,93 ms | 19,82 ms |
| Mediana | 15,10 ms | 4,18 ms |
| Máximo | 29,26 ms | 29,26 ms |
| req/s | — | 5,87 req/s (180 requisições) |
| Taxa de erro | — | 0,00% (0 de 180) |
| Checks | — | 100% (420 de 420) |

Thresholds: ✓ `p(95)<300` em `POST /orders` (17,07 ms) · ✓ `rate<0.01` em `http_req_failed` (0,00%).

O p95 medido fica bem abaixo da meta de 300 ms. A carga é de smoke (valida que funciona e dá uma linha de base), não um teste de capacidade.

> Observação: o spec original pedia o threshold `p95<300`, mas o k6 só aceita a sintaxe `p(95)<300`.

## O que faria diferente

- **Teste de carga de verdade:** além do smoke, um cenário `ramping-arrival-rate` para achar o ponto de saturação (req/s em que o p95 passa de 300 ms) e dimensionar o pool do Postgres.
- **Medir em ambiente parecido com produção:** a medição local não tem latência de rede entre API e banco.
- **Prometheus + Grafana no compose:** com alertas de burn rate do orçamento de erro (ex.: janelas 1h/5m e 6h/30m), em vez de só consultar `/metrics`.
- **Teste de integração do `PgOrderRepository` com Testcontainers:** hoje ele é validado só pelo compose e pelo k6.
- **Migrations versionadas** (ex.: `node-pg-migrate`) no lugar do `init.sql`, que só roda na criação do volume.
- **Idempotência no `POST /orders`** com header `Idempotency-Key`, para retries do cliente não criarem pedidos duplicados.
- **Separar métrica de erro** num contador próprio (`http_requests_total`) e expor métricas padrão do processo Node.
