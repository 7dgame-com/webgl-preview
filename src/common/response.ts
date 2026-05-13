import { Response } from 'express';

export type ErrorPayload = {
  code: string;
  message: string;
};

export function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

export function fail(
  res: Response,
  status: number,
  message: string,
  code = 'BAD_REQUEST'
): void {
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
    } satisfies ErrorPayload,
  });
}

