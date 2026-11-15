import pino, { type Logger } from 'pino';

export const createLogger = (level: string = 'info'): Logger =>
  pino({
    level,
    base: { service: 'pedidos-api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  });
