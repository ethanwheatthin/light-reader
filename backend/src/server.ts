import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { AppDataSource } from './data-source';
import logger from './logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import documentsRouter from './routes/documents';
import shelvesRouter from './routes/shelves';
import backupRouter from './routes/backup';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3030', 10);
async function bootstrap() {
  // Initialize TypeORM connection
  try {
    await AppDataSource.initialize();
    logger.info('Database connection established');

    // Run migrations
    await AppDataSource.runMigrations();
    logger.info('Database migrations executed');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    process.exit(1);
  }

  const app = express();

  // Global middleware
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));
  app.use(express.json({ limit: '500mb' })); // Large limit for backup payloads
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/documents', documentsRouter);
  app.use('/api/shelves', shelvesRouter);
  app.use('/api/export', backupRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/restore', backupRouter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap();
