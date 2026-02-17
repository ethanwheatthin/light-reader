import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import {
  DocumentEntity,
  BookMetadataEntity,
  BookmarkEntity,
  ReadingSessionEntity,
  ReadingStatsEntity,
  ReadingGoalEntity,
  ReadingGoalCompletedDayEntity,
  ShelfEntity,
  DocumentFileEntity,
  SubjectEntity,
} from '../entities';
import { toDocumentDTO, toShelfDTO } from '../helpers/dto-mapper';
import logger from '../logger';
import fs from 'fs';
import path from 'path';

const router = Router();
const storagePath = process.env.FILE_STORAGE_PATH || './uploads';
const storageStrategy = process.env.FILE_STORAGE_STRATEGY || 'filesystem';

/** GET /api/export/metadata — export all metadata as JSON */
router.get('/metadata', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = AppDataSource.getRepository(DocumentEntity);
    const docs = await docRepo.find({
      relations: [
        'metadata',
        'metadata.subjects',
        'bookmarks',
        'sessions',
        'readingStats',
        'readingGoal',
        'readingGoal.completedDays',
      ],
    });

    const shelfRepo = AppDataSource.getRepository(ShelfEntity);
    const shelves = await shelfRepo.find({ relations: ['documents'] });

    const payload = {
      exportedAt: new Date().toISOString(),
      metadata: docs.map(toDocumentDTO),
      shelves: shelves.map(toShelfDTO),
    };

    const json = JSON.stringify(payload, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-metadata-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(json);
  } catch (err) {
    next(err);
  }
});

/** POST /api/backup — create full library backup (metadata + files as base64) */
router.post('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = AppDataSource.getRepository(DocumentEntity);
    const docs = await docRepo.find({
      relations: [
        'metadata',
        'metadata.subjects',
        'bookmarks',
        'sessions',
        'readingStats',
        'readingGoal',
        'readingGoal.completedDays',
        'file',
      ],
    });

    const shelfRepo = AppDataSource.getRepository(ShelfEntity);
    const shelves = await shelfRepo.find({ relations: ['documents'] });

    const files: Array<{ id: string; name: string; type: string; data: string }> = [];

    for (const doc of docs) {
      let fileData: Buffer | null = null;

      if (doc.file) {
        if (storageStrategy === 'database' && doc.file.fileData) {
          fileData = doc.file.fileData;
        } else if (doc.file.filePath && fs.existsSync(doc.file.filePath)) {
          fileData = fs.readFileSync(doc.file.filePath);
        }
      }

      if (fileData) {
        const mimeType = doc.file?.mimeType || (doc.type === 'epub' ? 'application/epub+zip' : 'application/pdf');
        const base64 = fileData.toString('base64');
        files.push({
          id: doc.id,
          name: doc.title,
          type: mimeType,
          data: `data:${mimeType};base64,${base64}`,
        });
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      metadata: docs.map(toDocumentDTO),
      files,
      shelves: shelves.map(toShelfDTO),
    };

    const json = JSON.stringify(payload);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(json);
  } catch (err) {
    next(err);
  }
});

/** POST /api/restore — restore library from backup */
router.post('/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    if (!payload || !payload.metadata) {
      return res.status(400).json({ error: { message: 'Invalid backup payload' } });
    }

    const { metadata = [], files = [], shelves = [] } = payload;

    // First create shelves
    const shelfRepo = AppDataSource.getRepository(ShelfEntity);
    for (const s of shelves) {
      const existing = await shelfRepo.findOne({ where: { id: s.id } });
      if (!existing) {
        const shelf = shelfRepo.create({
          id: s.id,
          name: s.name,
          color: s.color,
          displayOrder: s.order ?? 0,
        });
        await shelfRepo.save(shelf);
      }
    }

    // Create documents
    const docRepo = AppDataSource.getRepository(DocumentEntity);
    const statsRepo = AppDataSource.getRepository(ReadingStatsEntity);
    const bookmarkRepo = AppDataSource.getRepository(BookmarkEntity);
    const sessionRepo = AppDataSource.getRepository(ReadingSessionEntity);
    const goalRepo = AppDataSource.getRepository(ReadingGoalEntity);
    const dayRepo = AppDataSource.getRepository(ReadingGoalCompletedDayEntity);
    const metaRepo = AppDataSource.getRepository(BookMetadataEntity);
    const fileRepo = AppDataSource.getRepository(DocumentFileEntity);
    const subjectRepo = AppDataSource.getRepository(SubjectEntity);

    for (const docData of metadata) {
      const existing = await docRepo.findOne({ where: { id: docData.id } });
      if (existing) continue; // Skip if already exists

      const doc = docRepo.create({
        id: docData.id,
        title: docData.title,
        type: docData.type,
        fileSize: docData.fileSize,
        uploadDate: docData.uploadDate,
        lastOpened: docData.lastOpened || null,
        currentPage: docData.currentPage ?? null,
        totalPages: docData.totalPages ?? null,
        currentCfi: docData.currentCfi || null,
        readingProgressPercent: docData.readingProgressPercent ?? null,
        shelfId: docData.shelfId || null,
      });
      await docRepo.save(doc);

      // Reading stats
      const rs = docData.readingStats;
      if (rs) {
        const stats = statsRepo.create({
          documentId: docData.id,
          totalReadingTime: rs.totalReadingTime || 0,
          firstOpenedAt: rs.firstOpenedAt || null,
        });
        await statsRepo.save(stats);

        // Sessions
        if (rs.sessions && Array.isArray(rs.sessions)) {
          for (const sess of rs.sessions) {
            const session = sessionRepo.create({
              documentId: docData.id,
              startedAt: sess.startedAt,
              endedAt: sess.endedAt,
              duration: sess.duration,
              pagesRead: sess.pagesRead,
            });
            await sessionRepo.save(session);
          }
        }
      }

      // Bookmarks
      if (docData.bookmarks && Array.isArray(docData.bookmarks)) {
        for (const bm of docData.bookmarks) {
          const bookmark = bookmarkRepo.create({
            id: bm.id,
            documentId: docData.id,
            location: bm.location,
            label: bm.label,
            note: bm.note || null,
          });
          await bookmarkRepo.save(bookmark);
        }
      }

      // Reading goal
      if (docData.readingGoal) {
        const goal = goalRepo.create({
          documentId: docData.id,
          dailyMinutes: docData.readingGoal.dailyMinutes,
          currentStreak: docData.readingGoal.currentStreak || 0,
        });
        const savedGoal = await goalRepo.save(goal);

        if (docData.readingGoal.completedDays && Array.isArray(docData.readingGoal.completedDays)) {
          for (const dateStr of docData.readingGoal.completedDays) {
            const day = dayRepo.create({
              readingGoalId: savedGoal.id,
              completedDate: dateStr,
            });
            await dayRepo.save(day);
          }
        }
      }

      // Book metadata
      if (docData.metadata) {
        const metaEntity = metaRepo.create({
          documentId: docData.id,
          author: docData.metadata.author || null,
          publisher: docData.metadata.publisher || null,
          publishYear: docData.metadata.publishYear || null,
          isbn: docData.metadata.isbn || null,
          coverUrl: docData.metadata.coverUrl || null,
          description: docData.metadata.description || null,
          pageCount: docData.metadata.pageCount ?? null,
          openLibraryKey: docData.metadata.openLibraryKey || null,
        });

        // Handle subjects
        if (docData.metadata.subjects && Array.isArray(docData.metadata.subjects)) {
          const subjectEntities: SubjectEntity[] = [];
          for (const name of docData.metadata.subjects) {
            let subject = await subjectRepo.findOne({ where: { name } });
            if (!subject) {
              subject = subjectRepo.create({ name });
              subject = await subjectRepo.save(subject);
            }
            subjectEntities.push(subject);
          }
          metaEntity.subjects = subjectEntities;
        }

        await metaRepo.save(metaEntity);
      }

      // File data
      const fileEntry = files.find((f: any) => f.id === docData.id);
      if (fileEntry) {
        // Decode base64 data URL
        const parts = fileEntry.data.split(',');
        const base64 = parts[1] || parts[0];
        const buffer = Buffer.from(base64, 'base64');
        const mimeType = fileEntry.type || (docData.type === 'epub' ? 'application/epub+zip' : 'application/pdf');

        if (storageStrategy === 'database') {
          const fe = fileRepo.create({
            documentId: docData.id,
            fileData: buffer,
            mimeType,
          });
          await fileRepo.save(fe);
        } else {
          const filename = `${Date.now()}-${docData.id}.${docData.type}`;
          const filePath = path.join(storagePath, filename);
          fs.writeFileSync(filePath, buffer);
          const fe = fileRepo.create({
            documentId: docData.id,
            filePath,
            mimeType,
          });
          await fileRepo.save(fe);
        }
      }
    }

    res.json({ message: 'Library restored successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
