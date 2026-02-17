import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppDataSource } from '../data-source';
import {
  DocumentEntity,
  BookMetadataEntity,
  BookmarkEntity,
  ReadingSessionEntity,
  ReadingStatsEntity,
  ReadingGoalEntity,
  ReadingGoalCompletedDayEntity,
  DocumentFileEntity,
  SubjectEntity,
} from '../entities';
import { toDocumentDTO } from '../helpers/dto-mapper';
import logger from '../logger';

const router = Router();

// ----- File upload config (multer) -----
const storagePath = process.env.FILE_STORAGE_PATH || './uploads';
const storageStrategy = process.env.FILE_STORAGE_STRATEGY || 'filesystem';

// Ensure uploads directory exists
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storagePath),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.epub' || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .epub and .pdf files are allowed'));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// Helper: get document repo with full relations
function getDocRepo() {
  return AppDataSource.getRepository(DocumentEntity);
}

async function loadFullDocument(id: string): Promise<DocumentEntity | null> {
  return getDocRepo().findOne({
    where: { id },
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
}

// ===== DOCUMENT CRUD =====

/** GET /api/documents — list all documents */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await getDocRepo().find({
      relations: [
        'metadata',
        'metadata.subjects',
        'bookmarks',
        'sessions',
        'readingStats',
        'readingGoal',
        'readingGoal.completedDays',
      ],
      order: { uploadDate: 'DESC' },
    });
    res.json(docs.map(toDocumentDTO));
  } catch (err) {
    next(err);
  }
});

/** GET /api/documents/:id — get single document */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await loadFullDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
    res.json(toDocumentDTO(doc));
  } catch (err) {
    next(err);
  }
});

/** POST /api/documents — upload new document */
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file provided' } });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const type: 'epub' | 'pdf' = ext === '.epub' ? 'epub' : 'pdf';
    const title = req.body.title || file.originalname.replace(/\.(epub|pdf)$/i, '');

    // Create document entity
    const docRepo = getDocRepo();
    const doc = docRepo.create({
      title,
      type,
      fileSize: file.size,
      totalPages: req.body.totalPages ? parseInt(req.body.totalPages, 10) : null,
    });
    const savedDoc = await docRepo.save(doc);

    // Create reading stats
    const statsRepo = AppDataSource.getRepository(ReadingStatsEntity);
    const stats = statsRepo.create({ documentId: savedDoc.id });
    await statsRepo.save(stats);

    // Create document file record
    const fileRepo = AppDataSource.getRepository(DocumentFileEntity);
    const mimeType = type === 'epub' ? 'application/epub+zip' : 'application/pdf';

    if (storageStrategy === 'database') {
      const fileData = fs.readFileSync(file.path);
      const fileEntity = fileRepo.create({
        documentId: savedDoc.id,
        fileData,
        mimeType,
      });
      await fileRepo.save(fileEntity);
      // Remove temp file
      fs.unlinkSync(file.path);
    } else {
      const fileEntity = fileRepo.create({
        documentId: savedDoc.id,
        filePath: file.path,
        mimeType,
      });
      await fileRepo.save(fileEntity);
    }

    // Reload with relations
    const fullDoc = await loadFullDocument(savedDoc.id);
    res.status(201).json(toDocumentDTO(fullDoc!));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/documents/:id — update document metadata */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = getDocRepo();
    const doc = await loadFullDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const { title, lastOpened, currentPage, totalPages, currentCfi, readingProgressPercent, shelfId, metadata } = req.body;

    // Update top-level fields
    if (title !== undefined) doc.title = title;
    if (lastOpened !== undefined) doc.lastOpened = lastOpened;
    if (currentPage !== undefined) doc.currentPage = currentPage;
    if (totalPages !== undefined) doc.totalPages = totalPages;
    if (currentCfi !== undefined) doc.currentCfi = currentCfi;
    if (readingProgressPercent !== undefined) doc.readingProgressPercent = readingProgressPercent;
    if (shelfId !== undefined) doc.shelfId = shelfId;

    await docRepo.save(doc);

    // Update book metadata if provided
    if (metadata) {
      const metaRepo = AppDataSource.getRepository(BookMetadataEntity);
      let metaEntity = doc.metadata;
      if (!metaEntity) {
        metaEntity = metaRepo.create({ documentId: doc.id });
      }
      if (metadata.author !== undefined) metaEntity.author = metadata.author;
      if (metadata.publisher !== undefined) metaEntity.publisher = metadata.publisher;
      if (metadata.publishYear !== undefined) metaEntity.publishYear = metadata.publishYear;
      if (metadata.isbn !== undefined) metaEntity.isbn = metadata.isbn;
      if (metadata.coverUrl !== undefined) metaEntity.coverUrl = metadata.coverUrl;
      if (metadata.description !== undefined) metaEntity.description = metadata.description;
      if (metadata.pageCount !== undefined) metaEntity.pageCount = metadata.pageCount;
      if (metadata.openLibraryKey !== undefined) metaEntity.openLibraryKey = metadata.openLibraryKey;

      // Handle subjects
      if (metadata.subjects && Array.isArray(metadata.subjects)) {
        const subjectRepo = AppDataSource.getRepository(SubjectEntity);
        const subjectEntities: SubjectEntity[] = [];
        for (const name of metadata.subjects) {
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

    const fullDoc = await loadFullDocument(doc.id);
    res.json(toDocumentDTO(fullDoc!));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/documents/:id — delete document */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({
      where: { id: req.params.id },
      relations: ['file'],
    });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    // Delete file from disk if filesystem strategy
    if (doc.file?.filePath && fs.existsSync(doc.file.filePath)) {
      fs.unlinkSync(doc.file.filePath);
    }

    await docRepo.remove(doc);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** GET /api/documents/:id/file — download/stream document file */
router.get('/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileRepo = AppDataSource.getRepository(DocumentFileEntity);
    const fileEntity = await fileRepo.findOne({
      where: { documentId: req.params.id },
    });
    if (!fileEntity) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({ where: { id: req.params.id } });
    const filename = doc ? `${doc.title}.${doc.type}` : 'document';

    res.setHeader('Content-Type', fileEntity.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

    if (storageStrategy === 'database' && fileEntity.fileData) {
      res.send(fileEntity.fileData);
    } else if (fileEntity.filePath && fs.existsSync(fileEntity.filePath)) {
      const stream = fs.createReadStream(fileEntity.filePath);
      stream.pipe(res);
    } else {
      return res.status(404).json({ error: { message: 'File data not found on disk' } });
    }
  } catch (err) {
    next(err);
  }
});

// Alias for /file (Angular service uses /content)
router.get('/:id/content', async (req: Request, res: Response, next: NextFunction) => {
  // Redirect internally by rewriting the params and calling the same logic
  req.params.id = req.params.id;
  req.url = `/${req.params.id}/file`;
  // Use Express layer stack
  (router as any).handle(req, res, next);
});

// ===== READING PROGRESS =====

/** PUT /api/documents/:id/progress — update reading progress */
router.put('/:id/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const { page, cfi, progressPercent } = req.body;
    if (page !== undefined) doc.currentPage = page;
    if (cfi !== undefined) doc.currentCfi = cfi;
    if (progressPercent !== undefined) doc.readingProgressPercent = progressPercent;
    doc.lastOpened = new Date();

    await docRepo.save(doc);

    const fullDoc = await loadFullDocument(doc.id);
    res.json(toDocumentDTO(fullDoc!));
  } catch (err) {
    next(err);
  }
});

// ===== BOOKMARKS =====

/** POST /api/documents/:id/bookmarks — add bookmark */
router.post('/:id/bookmarks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const bookmarkRepo = AppDataSource.getRepository(BookmarkEntity);
    const bookmark = bookmarkRepo.create({
      documentId: doc.id,
      location: req.body.location,
      label: req.body.label,
      note: req.body.note || null,
    });
    const saved = await bookmarkRepo.save(bookmark);

    res.status(201).json({
      id: saved.id,
      location: saved.location,
      label: saved.label,
      createdAt: saved.createdAt,
      ...(saved.note ? { note: saved.note } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/documents/:id/bookmarks/:bookmarkId — update bookmark note */
router.put('/:id/bookmarks/:bookmarkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookmarkRepo = AppDataSource.getRepository(BookmarkEntity);
    const bookmark = await bookmarkRepo.findOne({
      where: { id: req.params.bookmarkId, documentId: req.params.id },
    });
    if (!bookmark) return res.status(404).json({ error: { message: 'Bookmark not found' } });

    if (req.body.note !== undefined) bookmark.note = req.body.note;
    if (req.body.label !== undefined) bookmark.label = req.body.label;
    if (req.body.location !== undefined) bookmark.location = req.body.location;

    await bookmarkRepo.save(bookmark);
    res.json({
      id: bookmark.id,
      location: bookmark.location,
      label: bookmark.label,
      createdAt: bookmark.createdAt,
      ...(bookmark.note ? { note: bookmark.note } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/documents/:id/bookmarks/:bookmarkId — remove bookmark */
router.delete('/:id/bookmarks/:bookmarkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookmarkRepo = AppDataSource.getRepository(BookmarkEntity);
    const bookmark = await bookmarkRepo.findOne({
      where: { id: req.params.bookmarkId, documentId: req.params.id },
    });
    if (!bookmark) return res.status(404).json({ error: { message: 'Bookmark not found' } });

    await bookmarkRepo.remove(bookmark);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ===== READING SESSIONS =====

/** POST /api/documents/:id/sessions — record a reading session */
router.post('/:id/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id;
    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({ where: { id: docId } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const sessionRepo = AppDataSource.getRepository(ReadingSessionEntity);
    const session = sessionRepo.create({
      documentId: docId,
      startedAt: req.body.startedAt,
      endedAt: req.body.endedAt,
      duration: req.body.duration,
      pagesRead: req.body.pagesRead,
    });
    const saved = await sessionRepo.save(session);

    // Update reading stats
    const statsRepo = AppDataSource.getRepository(ReadingStatsEntity);
    let stats = await statsRepo.findOne({ where: { documentId: docId } });
    if (!stats) {
      stats = statsRepo.create({
        documentId: docId,
        totalReadingTime: req.body.duration,
        firstOpenedAt: req.body.startedAt,
      });
    } else {
      stats.totalReadingTime = Number(stats.totalReadingTime) + Number(req.body.duration);
      if (!stats.firstOpenedAt) {
        stats.firstOpenedAt = req.body.startedAt;
      }
    }
    await statsRepo.save(stats);

    res.status(201).json({
      startedAt: saved.startedAt,
      endedAt: saved.endedAt,
      duration: saved.duration,
      pagesRead: saved.pagesRead,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/documents/:id/stats — get reading statistics */
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id;
    const statsRepo = AppDataSource.getRepository(ReadingStatsEntity);
    const stats = await statsRepo.findOne({ where: { documentId: docId } });

    const sessionRepo = AppDataSource.getRepository(ReadingSessionEntity);
    const sessions = await sessionRepo.find({
      where: { documentId: docId },
      order: { startedAt: 'DESC' },
      take: 30,
    });

    res.json({
      totalReadingTime: stats ? Number(stats.totalReadingTime) : 0,
      sessions: sessions.map((s) => ({
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        duration: s.duration,
        pagesRead: s.pagesRead,
      })),
      firstOpenedAt: stats?.firstOpenedAt ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

// ===== READING GOALS =====

/** PUT /api/documents/:id/goals — set reading goal */
router.put('/:id/goals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id;
    const docRepo = getDocRepo();
    const doc = await docRepo.findOne({ where: { id: docId } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const goalRepo = AppDataSource.getRepository(ReadingGoalEntity);
    let goal = await goalRepo.findOne({
      where: { documentId: docId },
      relations: ['completedDays'],
    });

    if (!goal) {
      goal = goalRepo.create({
        documentId: docId,
        dailyMinutes: req.body.dailyMinutes,
        currentStreak: req.body.currentStreak || 0,
      });
    } else {
      goal.dailyMinutes = req.body.dailyMinutes;
      if (req.body.currentStreak !== undefined) goal.currentStreak = req.body.currentStreak;
    }

    const saved = await goalRepo.save(goal);

    // Sync completed days
    if (req.body.completedDays && Array.isArray(req.body.completedDays)) {
      const dayRepo = AppDataSource.getRepository(ReadingGoalCompletedDayEntity);
      // Remove existing
      await dayRepo.delete({ readingGoalId: saved.id });
      // Add new
      for (const dateStr of req.body.completedDays) {
        const day = dayRepo.create({
          readingGoalId: saved.id,
          completedDate: dateStr,
        });
        await dayRepo.save(day);
      }
    }

    // Reload
    const reloaded = await goalRepo.findOne({
      where: { id: saved.id },
      relations: ['completedDays'],
    });

    res.json({
      dailyMinutes: reloaded!.dailyMinutes,
      completedDays: (reloaded!.completedDays ?? []).map((d) => d.completedDate),
      currentStreak: reloaded!.currentStreak,
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/documents/:id/goals/streak — update reading streak */
router.put('/:id/goals/streak', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docId = req.params.id;
    const goalRepo = AppDataSource.getRepository(ReadingGoalEntity);
    const goal = await goalRepo.findOne({
      where: { documentId: docId },
      relations: ['completedDays'],
    });
    if (!goal) return res.status(404).json({ error: { message: 'Reading goal not found' } });

    const today = new Date().toISOString().slice(0, 10);
    const existingDates = (goal.completedDays ?? []).map((d) => d.completedDate);
    if (existingDates.includes(today)) {
      // Already tracked today
      return res.json({
        dailyMinutes: goal.dailyMinutes,
        completedDays: existingDates,
        currentStreak: goal.currentStreak,
      });
    }

    // Add today
    const dayRepo = AppDataSource.getRepository(ReadingGoalCompletedDayEntity);
    const day = dayRepo.create({ readingGoalId: goal.id, completedDate: today });
    await dayRepo.save(day);

    // Check streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const hadYesterday = existingDates.includes(yesterday);
    goal.currentStreak = hadYesterday ? goal.currentStreak + 1 : 1;
    await goalRepo.save(goal);

    // Reload
    const reloaded = await goalRepo.findOne({
      where: { id: goal.id },
      relations: ['completedDays'],
    });

    res.json({
      dailyMinutes: reloaded!.dailyMinutes,
      completedDays: (reloaded!.completedDays ?? []).map((d) => d.completedDate),
      currentStreak: reloaded!.currentStreak,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
