import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type Request } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { z, ZodError } from 'zod';
import { OrderService } from '../application/order-service';
import { DomainError, type DomainErrorCode } from '../domain/errors';
import type { OrderRepository } from '../domain/order-repository';
import { createLogger } from '../observability/logger';
import { metricsHandler, metricsMiddleware } from '../observability/metrics';

export interface AppOptions {
  httpLogs?: boolean;
  logger?: Logger;
}

const createOrderSchema = z.object({
  customerId: z.string(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number(),
      unitPriceCents: z.number(),
    }),
  ),
});

const idSchema = z.uuid();

const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  INVALID_CUSTOMER: 400,
  EMPTY_ORDER: 400,
  INVALID_QUANTITY: 400,
  INVALID_PRICE: 400,
  ORDER_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
};

const parseId = (req: Request<{ id: string }>): string => {
  const result = idSchema.safeParse(req.params.id);
  if (!result.success) {
    throw new DomainError('ORDER_NOT_FOUND');
  }
  return result.data;
};

const isJsonSyntaxError = (error: unknown): boolean =>
  error instanceof SyntaxError && (error as { type?: string }).type === 'entity.parse.failed';

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DomainError) {
    res.status(DOMAIN_STATUS[error.code]).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'requisição inválida',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }
  if (isJsonSyntaxError(error)) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'JSON malformado' });
    return;
  }
  res.err = error instanceof Error ? error : new Error(String(error));
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'erro interno do servidor' });
};

export const createApp = (repository: OrderRepository, options: AppOptions = {}): Express => {
  const { httpLogs = true, logger = createLogger() } = options;
  const service = new OrderService(repository);
  const app = express();

  app.disable('x-powered-by');
  app.use(metricsMiddleware);
  if (httpLogs) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req, res) => {
          const id = req.headers['x-request-id'] ?? randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }
  app.use(express.json({ limit: '100kb' }));

  app.get('/metrics', metricsHandler);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/orders', async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    const order = await service.createOrder(input);
    res.status(201).location(`/orders/${order.id}`).json(order);
  });

  app.get('/orders/:id', async (req, res) => {
    res.json(await service.getOrder(parseId(req)));
  });

  app.post('/orders/:id/pay', async (req, res) => {
    res.json(await service.payOrder(parseId(req)));
  });

  app.post('/orders/:id/cancel', async (req, res) => {
    res.json(await service.cancelOrder(parseId(req)));
  });

  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'rota não encontrada' });
  });

  app.use(errorHandler);

  return app;
};
