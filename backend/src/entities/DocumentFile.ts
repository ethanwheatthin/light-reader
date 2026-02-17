import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentEntity } from './Document';

@Entity('document_files')
export class DocumentFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid', unique: true })
  documentId: string;

  @OneToOne(() => DocumentEntity, (doc) => doc.file, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  /** File path on disk (used when FILE_STORAGE_STRATEGY=filesystem) */
  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string | null;

  /** Binary file data (used when FILE_STORAGE_STRATEGY=database) */
  @Column({ name: 'file_data', type: 'bytea', nullable: true })
  fileData: Buffer | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
