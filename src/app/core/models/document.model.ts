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

export interface BookMetadata {
  /** Book title (can be edited) */
  title?: string;
  /** Author name(s) */
  author?: string;
  /** Publisher */
  publisher?: string;
  /** Publication year */
  publishYear?: string;
  /** ISBN-10 or ISBN-13 */
  isbn?: string;
  /** Cover image URL */
  coverUrl?: string;
  /** Description/synopsis */
  description?: string;
  /** Number of pages (from metadata) */
  pageCount?: number;
  /** Subject/genres */
  subjects?: string[];
  /** Fetched from Open Library */
  openLibraryKey?: string;
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
  /** Overall reading progress as a percentage (0–100) */
  readingProgressPercent?: number;
  /** Book metadata from Open Library or user edits */
  metadata?: BookMetadata;
  /** ID of the shelf this document belongs to (null = unshelved) */
  shelfId?: string | null;
}

export type ThemeOption = 'light' | 'dark' | 'sepia' | 'high-contrast-light' | 'high-contrast-dark';
export type FlowMode = 'paginated' | 'scrolled';
export type SpreadMode = 'none' | 'auto' | 'always';
export type ZoomLevel = 'fit-width' | 'fit-screen' | '100' | '200' | '300';
export type PageLayout = 'automatic' | 'two-page' | 'one-page';

export interface CustomColorPalette {
  name: string;
  background: string;
  text: string;
  link: string;
}

export const PRESET_COLOR_PALETTES: CustomColorPalette[] = [
  { name: 'Default', background: '#ffffff', text: '#000000', link: '#007bff' },
  { name: 'Night Owl', background: '#011627', text: '#d6deeb', link: '#82aaff' },
  { name: 'Solarized', background: '#fdf6e3', text: '#657b83', link: '#268bd2' },
  { name: 'Nord', background: '#2e3440', text: '#d8dee9', link: '#88c0d0' },
  { name: 'Green Tint', background: '#e8f5e9', text: '#1b5e20', link: '#2e7d32' },
  { name: 'Rose', background: '#fce4ec', text: '#880e4f', link: '#c2185b' },
];

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: ThemeOption;
  flowMode: FlowMode;
  spreadMode: SpreadMode;
  focusMode: boolean;
  followMode: boolean;
  /** Follow mode speed in words per minute (WPM) */
  followModeSpeed: number;
  /** Zoom level for content scaling */
  zoomLevel: ZoomLevel;
  /** Page layout mode */
  pageLayout: PageLayout;
  /** Letter spacing in em units */
  letterSpacing: number;
  /** Word highlighting during reading */
  wordHighlighting: boolean;
  /** Bionic reading mode — bolds the first portion of each word */
  bionicReading: boolean;
  /** Custom color palette (null = use theme default) */
  customColorPalette: CustomColorPalette | null;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: 'Georgia',
  theme: 'light',
  flowMode: 'paginated',
  spreadMode: 'none',
  focusMode: false,
  followMode: false,
  followModeSpeed: 250, // Default 250 WPM (average reading speed)
  zoomLevel: 'fit-screen',
  pageLayout: 'automatic',
  letterSpacing: 0,
  wordHighlighting: false,
  bionicReading: false,
  customColorPalette: null,
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

/** Follow mode constraints */
export const FOLLOW_MODE_SPEED_MIN = 100; // Min 100 WPM
export const FOLLOW_MODE_SPEED_MAX = 600; // Max 600 WPM
export const FOLLOW_MODE_SPEED_STEP = 50; // Adjust by 50 WPM

/** Letter spacing constraints (in em) */
export const LETTER_SPACING_MIN = -0.05;
export const LETTER_SPACING_MAX = 0.3;
export const LETTER_SPACING_STEP = 0.01;
