# Uso de IA

## Ferramenta

- **Claude Code** (CLI da Anthropic), modelo **Claude Opus 5.5**, usado como agente de código no terminal.
- Usado do início ao fim: geração do código, testes, configuração, documentação e validação (rodar lint, testes, Docker e k6).

## Como foi usado

Escrevi uma especificação completa do projeto e pedi para a IA construir **em etapas**, parando ao fim de cada uma para eu revisar e commitar. A IA **não** rodou `git add`, `git commit` nem `git push`: todos os commits foram feitos por mim.

## Prompts que importaram

### 1. Especificação inicial (prompt principal)

Um documento com a tarefa completa. Resumo do que ele definia:

- **Domínio:** entidade `Order` com `customerId`, itens `{ productId, quantity, unitPriceCents }`, status `PENDING | PAID | CANCELLED`, total calculado em centavos; transições válidas só `PENDING → PAID` e `PENDING → CANCELLED`; códigos de `DomainError` e o mapeamento para HTTP (400/404/409/500).
- **Stack:** Node, TypeScript, Express 5, Postgres 16 com `pg` e SQL puro, Zod, pino, prom-client, Vitest + Supertest, ESLint, Docker Compose, GitHub Actions, k6, Spectral.
- **Arquitetura:** Repository pattern (`OrderRepository` com implementação Postgres e em memória), SRP e DIP, `createApp(repo)` separado do `server.ts`.
- **Entregáveis:** testes com coverage ≥ 80%, CI com gitleaks, log estruturado, 1 métrica e 1 SLO, ADR no formato MADR, OpenAPI validado no Spectral, smoke test k6, README, CONTRIBUTORS.
- **Processo:** 16 commits em Conventional Commits, em português; a IA para a cada etapa e sugere o comando de commit; eu commito.

### 2. Prompts de ajuste durante o desenvolvimento

| Prompt (resumido) | Resultado |
|---|---|
| "não escreva mais comentários" | código a partir da etapa 4 sem comentários |
| "junte as etapas 8, 9 e 10" (e depois 11+12, 13+14, 15+16) | menos commits, cada um com o projeto funcionando |
| "roda o k6 pra mim" / "faz o fluxo completo com curl" | validação real da API rodando no Docker |
| "faz a paginazinha HTML com os botões" | `public/index.html` servida pela própria API |
| "renomeia o ADR" | `docs/adr/0001-decisao.md`, seguindo o modelo de estrutura do curso |
| "agora preciso saber o que cada coisa faz e o que é" | explicação do projeto camada por camada, para estudo |

## Decisões: o que foi meu e o que foi sugerido pela IA

| Decisão | Origem |
|---|---|
| Nível domínio único (Pedidos) e o escopo do domínio | minha (especificação) |
| Repository + `pg` puro em vez de Prisma (ADR 0001) | minha (especificação); a IA redigiu o ADR com os prós e contras |
| Dinheiro em centavos inteiros | minha (especificação) |
| SLO: p95 de `POST /orders` < 300 ms e erro < 1% em 28 dias | minha (especificação) |
| Juntar etapas de commit quando o coverage ficaria abaixo de 80% entre elas | sugerida pela IA, **escolhida por mim** entre 3 opções |
| Código sem comentários | minha |
| Página web para demonstrar o fluxo, numa branch separada | minha |
| Renomear o ADR para seguir o modelo do curso; não incluir C4 (não se aplica ao Projeto B) | minha |
| `engines` Node ≥ 22.12 (o Vitest 5 exige) | sugerida pela IA |
| Id que não é UUID responde 404 em vez de 500 | sugerida pela IA |
| Porta configurável no compose (`API_PORT`), porque a 3000 estava ocupada na minha máquina | sugerida pela IA |
| Threshold do k6 `p(95)<300` (o `p95<300` da especificação é sintaxe inválida no k6) | correção da IA |
| Zod valida só o formato e o domínio valida as regras (para os códigos `INVALID_*` chegarem ao cliente) | sugerida pela IA |

## Como validei

- Rodei e acompanhei: `npm run lint`, `npm run typecheck`, `npm test` (60 testes, 100% de coverage), `npm run lint:openapi`, `npm run build`.
- Subi com `docker compose up --build` e testei o fluxo com `curl` e pela página: criar 201, consultar 200, pagar 200, cancelar pedido pago 409, validações 400, inexistente 404.
- Rodei o smoke k6: p95 de `POST /orders` de 17 ms, 0% de erro.
- Revisei cada etapa antes de commitar e pedi explicação de cada parte do projeto (domínio, service, repositórios, HTTP, observabilidade, Docker, CI) para conseguir explicar e modificar o código.

## Limites e cuidados

- A IA errou ou precisou de correção em alguns pontos: conflito de versão do `@types/node`, sintaxe do threshold do k6, porta ocupada no Docker. Todos foram detectados porque os comandos foram executados de verdade, não só gerados.
- O `PgOrderRepository` não tem teste automatizado; foi validado manualmente via Docker e k6.
