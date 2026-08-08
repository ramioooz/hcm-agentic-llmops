import type { Router } from 'express';

export type HttpController = {
  basePath: string;
  router: Router;
};
