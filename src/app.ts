import express, { type Express } from 'express';

export type AppDependencies = {
  checkDatabase?: () => Promise<void>;
};

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response) => {
    try {
      await dependencies.checkDatabase?.();
      response.status(200).json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });

  return app;
}
