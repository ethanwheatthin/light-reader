export interface Bookmark {
  id: string;
  /** For EPUB: CFI string; for PDF: page number */
  location: string;
  /** Human-readable label (page number, chapter title, etc.) */
  label: string;
  createdAt: Date;
  /** Optional user-provided note */
  note?: string;
}

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
  parent?: string;
}

export interface ReadingSession {
  startedAt: Date;
  endedAt: Date;
  /** Duration in milliseconds */
  duration: number;
  pagesRead: number;
}

export interface ReadingStats {
  /** Total reading time in milliseconds */
  totalReadingTime: number;
  /** Reading sessions history (last 30 kept) */
  sessions: ReadingSession[];
  /** Date of the first reading session */
  firstOpenedAt?: Date;
}

export interface ReadingGoal {
  /** Daily reading goal in minutes */
  dailyMinutes: number;
  /** ISO date strings of days the goal was met */
  completedDays: string[];
  /** Current streak length */
  currentStreak: number;
}

export interface Document {
  id: string;
  title: string;
  type: 'epub' | 'pdf';
  fileSize: number;
  uploadDate: Date;
  lastOpened?: Date;
  currentPage?: number;
  totalPages?: number;
  /** EPUB-specific: CFI of last reading position */
  currentCfi?: string;
  bookmarks: Bookmark[];
  readingStats: ReadingStats;
  readingGoal?: ReadingGoal;
}

export type ThemeOption = 'light' | 'dark' | 'sepia';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: ThemeOption;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: 'Georgia',
  theme: 'light',
};

/** Control constraints */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_STEP = 1;

export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_STEP = 0.1;

/** Available font families for reader */
export const READER_FONTS = [
  'Palatino',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Verdana',
  'Literata',
  'Bookerly',
  'Arial',
  'Cambria',
];
