import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { DocumentEntity } from './entities/Document';
import { BookMetadataEntity } from './entities/BookMetadata';
import { SubjectEntity } from './entities/Subject';
import { BookmarkEntity } from './entities/Bookmark';
import { ReadingSessionEntity } from './entities/ReadingSession';
import { ReadingStatsEntity } from './entities/ReadingStats';
import { ReadingGoalEntity } from './entities/ReadingGoal';
import { ReadingGoalCompletedDayEntity } from './entities/ReadingGoalCompletedDay';
import { ShelfEntity } from './entities/Shelf';
import { DocumentFileEntity } from './entities/DocumentFile';
import { InitialSchema1700000000000 } from '../migrations/1700000000000-InitialSchema';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'libreader',
  password: process.env.POSTGRES_PASSWORD || 'libreader_pass',
  database: process.env.POSTGRES_DB || 'libreader',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    DocumentEntity,
    BookMetadataEntity,
    SubjectEntity,
    BookmarkEntity,
    ReadingSessionEntity,
    ReadingStatsEntity,
    ReadingGoalEntity,
    ReadingGoalCompletedDayEntity,
    ShelfEntity,
    DocumentFileEntity,
  ],
  migrations: [InitialSchema1700000000000],
  subscribers: [],
});
