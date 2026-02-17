import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentEntity } from './Document';

@Entity('reading_stats')
export class ReadingStatsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid', unique: true })
  documentId: string;

  @OneToOne(() => DocumentEntity, (doc) => doc.readingStats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  @Column({ name: 'total_reading_time', type: 'bigint', default: 0 })
  totalReadingTime: number;

  @Column({ name: 'first_opened_at', type: 'timestamptz', nullable: true })
  firstOpenedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
