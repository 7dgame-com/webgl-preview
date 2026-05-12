import { Router, Request, Response } from 'express';
import manifest from './manifest.json';

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

export function createPluginRouter(): Router {
  const router = Router();

  router.get('/manifest', (_req: Request, res: Response) => {
    ok(res, manifest);
  });

  return router;
}
