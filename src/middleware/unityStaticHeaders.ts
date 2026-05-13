import { NextFunction, Request, Response } from 'express';

export function unityGzipHeaders(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.endsWith('.gz')) {
    next();
    return;
  }

  res.setHeader('Content-Encoding', 'gzip');
  if (req.path.endsWith('.wasm.gz')) {
    res.setHeader('Content-Type', 'application/wasm');
  } else if (req.path.endsWith('.js.gz')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.path.endsWith('.data.gz')) {
    res.setHeader('Content-Type', 'application/octet-stream');
  }
  next();
}

export function setUnityStaticHeaders(res: Response): void {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

