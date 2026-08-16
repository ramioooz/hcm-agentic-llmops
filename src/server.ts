import { composeApplication } from './bootstrap/compose-application';
import { loadEnvironment } from './config/load-environment';
import { formatStartupError } from './helpers/startup-error.helpers';

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

void startServer().catch((error: unknown) => {
  const diagnostic = formatStartupError(error, {
    includeStack: process.env.NODE_ENV !== 'production',
  });
  process.stderr.write(`${diagnostic}\n`);
  process.exitCode = 1;
});
