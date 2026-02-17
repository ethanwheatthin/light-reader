import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    contentLength: req.headers['content-length'],
  });
  next();
}
