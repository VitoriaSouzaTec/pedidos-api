import { Pool } from 'pg';
import { loadConfig } from './config';
import { createApp } from './http/app';
import { PgOrderRepository } from './infra/pg-order-repository';
import { createLogger } from './observability/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const main = (): void => {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }

  const logger = createLogger(config.LOG_LEVEL);
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  pool.on('error', (err) => logger.error({ err }, 'erro inesperado no pool do Postgres'));

  const app = createApp(new PgOrderRepository(pool), { logger });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'pedidos-api ouvindo');
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'encerrando com graceful shutdown');

    const forceExit = setTimeout(() => {
      logger.error('shutdown excedeu o tempo limite, forçando saída');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async (closeError) => {
      try {
        await pool.end();
      } catch (err) {
        logger.error({ err }, 'erro ao fechar o pool do Postgres');
      }
      if (closeError) {
        logger.error({ err: closeError }, 'erro ao fechar o servidor HTTP');
        process.exit(1);
      }
      logger.info('encerrado');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main();
