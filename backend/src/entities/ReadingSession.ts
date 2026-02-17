import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentEntity } from './Document';

@Entity('reading_sessions')
export class ReadingSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => DocumentEntity, (doc) => doc.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz' })
  endedAt: Date;

  @Column({ type: 'int' })
  duration: number;

  @Column({ name: 'pages_read', type: 'int' })
  pagesRead: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
