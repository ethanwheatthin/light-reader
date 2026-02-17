import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ShelfEntity } from './Shelf';
import { BookMetadataEntity } from './BookMetadata';
import { BookmarkEntity } from './Bookmark';
import { ReadingSessionEntity } from './ReadingSession';
import { ReadingStatsEntity } from './ReadingStats';
import { ReadingGoalEntity } from './ReadingGoal';
import { DocumentFileEntity } from './DocumentFile';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 10 })
  type: 'epub' | 'pdf';

  @Column({ type: 'bigint', name: 'file_size' })
  fileSize: number;

  @CreateDateColumn({ name: 'upload_date', type: 'timestamptz' })
  uploadDate: Date;

  @Column({ name: 'last_opened', type: 'timestamptz', nullable: true })
  lastOpened: Date | null;

  @Column({ name: 'current_page', type: 'int', nullable: true })
  currentPage: number | null;

  @Column({ name: 'total_pages', type: 'int', nullable: true })
  totalPages: number | null;

  @Column({ name: 'current_cfi', type: 'text', nullable: true })
  currentCfi: string | null;

  @Column({
    name: 'reading_progress_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  readingProgressPercent: number | null;

  @Column({ name: 'shelf_id', type: 'uuid', nullable: true })
  shelfId: string | null;

  @ManyToOne(() => ShelfEntity, (shelf) => shelf.documents, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'shelf_id' })
  shelf: ShelfEntity;

  @OneToOne(() => BookMetadataEntity, (meta) => meta.document, {
    cascade: true,
    eager: true,
  })
  metadata: BookMetadataEntity;

  @OneToMany(() => BookmarkEntity, (bookmark) => bookmark.document, {
    cascade: true,
    eager: true,
  })
  bookmarks: BookmarkEntity[];

  @OneToMany(() => ReadingSessionEntity, (session) => session.document, {
    cascade: true,
  })
  sessions: ReadingSessionEntity[];

  @OneToOne(() => ReadingStatsEntity, (stats) => stats.document, {
    cascade: true,
    eager: true,
  })
  readingStats: ReadingStatsEntity;

  @OneToOne(() => ReadingGoalEntity, (goal) => goal.document, {
    cascade: true,
    eager: true,
  })
  readingGoal: ReadingGoalEntity;

  @OneToOne(() => DocumentFileEntity, (file) => file.document, {
    cascade: true,
  })
  file: DocumentFileEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
