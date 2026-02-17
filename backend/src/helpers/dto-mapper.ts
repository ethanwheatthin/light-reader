import { DocumentEntity } from '../entities/Document';
import { ShelfEntity } from '../entities/Shelf';

/**
 * Converts a DocumentEntity (with relations loaded) to the shape the Angular
 * frontend expects (matching the Document interface in document.model.ts).
 */
export function toDocumentDTO(entity: DocumentEntity): any {
  const sessions = entity.sessions ?? [];
  // Sort by startedAt descending and keep last 30
  const sortedSessions = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 30)
    .map((s) => ({
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      duration: Number(s.duration),
      pagesRead: Number(s.pagesRead),
    }));

  const readingStats = entity.readingStats
    ? {
        totalReadingTime: Number(entity.readingStats.totalReadingTime),
        sessions: sortedSessions,
        firstOpenedAt: entity.readingStats.firstOpenedAt ?? undefined,
      }
    : { totalReadingTime: 0, sessions: [] };

  const readingGoal = entity.readingGoal
    ? {
        dailyMinutes: entity.readingGoal.dailyMinutes,
        completedDays: (entity.readingGoal.completedDays ?? []).map((d: any) => d.completedDate),
        currentStreak: entity.readingGoal.currentStreak,
      }
    : undefined;

  const metadata = entity.metadata
    ? {
        title: entity.metadata.author ? undefined : undefined, // keep existing shape
        author: entity.metadata.author ?? undefined,
        publisher: entity.metadata.publisher ?? undefined,
        publishYear: entity.metadata.publishYear ?? undefined,
        isbn: entity.metadata.isbn ?? undefined,
        coverUrl: entity.metadata.coverUrl ?? undefined,
        description: entity.metadata.description ?? undefined,
        pageCount: entity.metadata.pageCount ?? undefined,
        subjects: (entity.metadata.subjects ?? []).map((s: any) => s.name),
        openLibraryKey: entity.metadata.openLibraryKey ?? undefined,
      }
    : undefined;

  // Clean undefined out of metadata
  if (metadata) {
    Object.keys(metadata).forEach((key) => {
      if ((metadata as any)[key] === undefined) delete (metadata as any)[key];
    });
  }

  const bookmarks = (entity.bookmarks ?? []).map((b) => ({
    id: b.id,
    location: b.location,
    label: b.label,
    createdAt: b.createdAt,
    ...(b.note ? { note: b.note } : {}),
  }));

  return {
    id: entity.id,
    title: entity.title,
    type: entity.type,
    fileSize: Number(entity.fileSize),
    uploadDate: entity.uploadDate,
    lastOpened: entity.lastOpened ?? undefined,
    currentPage: entity.currentPage ?? undefined,
    totalPages: entity.totalPages ?? undefined,
    currentCfi: entity.currentCfi ?? undefined,
    bookmarks,
    readingStats,
    readingGoal,
    readingProgressPercent: entity.readingProgressPercent != null
      ? Number(entity.readingProgressPercent)
      : undefined,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    shelfId: entity.shelfId ?? undefined,
  };
}

/**
 * Converts a ShelfEntity to the shape the Angular frontend expects.
 */
export function toShelfDTO(entity: ShelfEntity): any {
  return {
    id: entity.id,
    name: entity.name,
    color: entity.color,
    createdAt: entity.createdAt.toISOString(),
    documentIds: (entity.documents ?? []).map((d) => d.id),
    order: entity.displayOrder,
  };
}
