import type { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - start);
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
}
