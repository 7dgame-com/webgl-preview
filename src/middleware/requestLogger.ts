import { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  console.info(`request method=${req.method} path=${req.path}`);
  next();
}

