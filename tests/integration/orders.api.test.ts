import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { OrderRepository } from '../../src/domain/order-repository';
import { createApp } from '../../src/http/app';
import { InMemoryOrderRepository } from '../../src/infra/in-memory-order-repository';
import { createLogger } from '../../src/observability/logger';

const validBody = {
  customerId: 'cli-1',
  items: [{ productId: 'p1', quantity: 2, unitPriceCents: 1500 }],
};

const missingId = '00000000-0000-4000-8000-000000000000';

const buildApp = () => createApp(new InMemoryOrderRepository(), { httpLogs: false });

describe('API de pedidos', () => {
  it('fluxo completo: POST 201 → GET 200 → pay 200 → cancel 409', async () => {
    const app = buildApp();

    const created = await request(app).post('/orders').send(validBody).expect(201);
    expect(created.body).toMatchObject({
      customerId: 'cli-1',
      status: 'PENDING',
      totalCents: 3000,
      items: validBody.items,
    });
    expect(created.headers.location).toBe(`/orders/${created.body.id}`);

    const fetched = await request(app).get(created.headers.location).expect(200);
    expect(fetched.body.id).toBe(created.body.id);
    expect(fetched.body.status).toBe('PENDING');

    const paid = await request(app).post(`/orders/${created.body.id}/pay`).expect(200);
    expect(paid.body.status).toBe('PAID');

    const cancel = await request(app).post(`/orders/${created.body.id}/cancel`).expect(409);
    expect(cancel.body.code).toBe('INVALID_TRANSITION');
  });

  it('cancela pedido PENDING', async () => {
    const app = buildApp();
    const created = await request(app).post('/orders').send(validBody).expect(201);
    const cancelled = await request(app).post(`/orders/${created.body.id}/cancel`).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('400 VALIDATION_ERROR para corpo fora do schema', async () => {
    const res = await request(buildApp())
      .post('/orders')
      .send({ customerId: 123, items: 'x' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('400 VALIDATION_ERROR para JSON malformado', async () => {
    const res = await request(buildApp())
      .post('/orders')
      .set('content-type', 'application/json')
      .send('{"customerId":')
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    [{ ...validBody, customerId: ' ' }, 'INVALID_CUSTOMER'],
    [{ ...validBody, items: [] }, 'EMPTY_ORDER'],
    [{ ...validBody, items: [{ productId: 'p1', quantity: 0, unitPriceCents: 1 }] }, 'INVALID_QUANTITY'],
    [{ ...validBody, items: [{ productId: 'p1', quantity: 1, unitPriceCents: -1 }] }, 'INVALID_PRICE'],
  ])('400 com código de domínio %#', async (body, code) => {
    const res = await request(buildApp()).post('/orders').send(body).expect(400);
    expect(res.body.code).toBe(code);
  });

  it.each([
    ['get', `/orders/${missingId}`],
    ['post', `/orders/${missingId}/pay`],
    ['post', `/orders/${missingId}/cancel`],
    ['get', '/orders/nao-e-uuid'],
  ] as const)('404 ORDER_NOT_FOUND em %s %s', async (method, path) => {
    const res = await request(buildApp())[method](path).expect(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('404 NOT_FOUND para rota inexistente', async () => {
    const res = await request(buildApp()).get('/nao-existe').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('500 INTERNAL_ERROR quando o repositório falha', async () => {
    const failing: OrderRepository = {
      save: async () => {
        throw new Error('banco fora do ar');
      },
      findById: async () => null,
    };
    const res = await request(createApp(failing, { httpLogs: false }))
      .post('/orders')
      .send(validBody)
      .expect(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'erro interno do servidor' });
  });

  it('GET /health', async () => {
    const res = await request(buildApp()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /metrics expõe o histograma de latência no formato Prometheus', async () => {
    const app = buildApp();
    await request(app).post('/orders').send(validBody).expect(201);
    await request(app).get('/nao-existe').expect(404);

    const res = await request(app).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE http_request_duration_seconds histogram');
    expect(res.text).toMatch(
      /http_request_duration_seconds_bucket\{le="0.01",method="POST",route="\/orders",status="201"\}/,
    );
    expect(res.text).toContain('route="unmatched"');
  });

  it('com logs HTTP habilitados, propaga ou gera x-request-id', async () => {
    const app = createApp(new InMemoryOrderRepository(), { logger: createLogger('silent') });

    const generated = await request(app).get('/health').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const propagated = await request(app).get('/health').set('x-request-id', 'abc-123').expect(200);
    expect(propagated.headers['x-request-id']).toBe('abc-123');

    await request(app).get(`/orders/${missingId}`).expect(404);
  });

  it('com logs HTTP habilitados, registra erro 500', async () => {
    const failing: OrderRepository = {
      save: async () => {
        throw 'falha sem Error';
      },
      findById: async () => null,
    };
    const app = createApp(failing, { logger: createLogger('silent') });
    await request(app).post('/orders').send(validBody).expect(500);
  });
});
