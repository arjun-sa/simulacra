import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../types.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  res.status(status).json({ error: message });
}
