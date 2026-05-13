import { Router, Request, Response } from 'express';
import { PUBLIC_DIR } from '../config';
import { ok } from '../common/response';
import { getPluginManifest, getRuntimeStatus } from './helpers';

export function createPluginRouter(): Router {
  const router = Router();

  router.get('/manifest', (_req: Request, res: Response) => {
    ok(res, getPluginManifest());
  });

  router.get('/health', (_req: Request, res: Response) => {
    ok(res, getRuntimeStatus(PUBLIC_DIR));
  });

  return router;
}
