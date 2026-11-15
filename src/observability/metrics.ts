import type { RequestHandler } from 'express';
import { Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [metricsRegistry],
});

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const routePath = (req.route as { path?: string } | undefined)?.path;
    end({
      method: req.method,
      route: routePath ? `${req.baseUrl}${routePath}` : 'unmatched',
      status: String(res.statusCode),
    });
  });
  next();
};

export const metricsHandler: RequestHandler = async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
};
