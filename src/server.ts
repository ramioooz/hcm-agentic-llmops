import { composeApplication } from './bootstrap/compose-application';
import { loadEnvironment } from './config/load-environment';

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const runtime = composeApplication(environment);
  await runtime.start();
  process.stdout.write(`API listening on port ${environment.port}\n`);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Received ${signal}; shutting down\n`);
    void runtime.stop().catch(() => {
      process.stderr.write('API failed to shut down cleanly.\n');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void startServer().catch(() => {
  process.stderr.write('API failed to start.\n');
  process.exitCode = 1;
});
