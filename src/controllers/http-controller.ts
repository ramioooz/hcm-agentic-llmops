import type { Router } from 'express';

export interface HttpController {
  basePath: string;
  router: Router;
}
