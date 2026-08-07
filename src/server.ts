import { createApp } from './app';
import { loadEnvironment } from './config/load-environment';
import { createDatabaseClient } from './infrastructure/database/prisma';

const environment = loadEnvironment();
const database = createDatabaseClient();
const app = createApp({
  checkDatabase: async () => {
    await database.$queryRaw`SELECT 1`;
  },
});

const server = app.listen(environment.port, () => {
  process.stdout.write(`API listening on port ${environment.port}\n`);
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Received ${signal}; shutting down\n`);
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
