import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Unhandled error', {
    status,
    message,
    stack: err.stack,
  });

  res.status(status).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}
