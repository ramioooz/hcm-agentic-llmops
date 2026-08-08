import { Router, type Request, type Response } from 'express';
import type { HttpController } from './http-controller';

export class HealthController implements HttpController {
  public readonly basePath = '/';
  public readonly router = Router();

  public constructor(private readonly checkDatabase: () => Promise<void>) {
    this.router.get('/health', this.health);
    this.router.get('/ready', this.ready);
  }

  public health = (_request: Request, response: Response): void => {
    response.status(200).json({ status: 'ok' });
  };

  public ready = async (_request: Request, response: Response): Promise<void> => {
    try {
      await this.checkDatabase();
      response.status(200).json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  };
}
