import express, { type Express } from 'express';
import type { HttpController } from './controllers/http-controller';
import { handleHttpError } from './middleware/http-error.middleware';

export function createApp(controllers: HttpController[]): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  for (const controller of controllers) {
    app.use(controller.basePath, controller.router);
  }

  app.use(handleHttpError);

  return app;
}
