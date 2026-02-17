import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentEntity } from './Document';

@Entity('bookmarks')
export class BookmarkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => DocumentEntity, (doc) => doc.bookmarks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  @Column({ type: 'varchar', length: 500 })
  location: string;

  @Column({ type: 'varchar', length: 500 })
  label: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
