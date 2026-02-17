import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { DocumentEntity } from './Document';
import { SubjectEntity } from './Subject';

@Entity('book_metadata')
export class BookMetadataEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @OneToOne(() => DocumentEntity, (doc) => doc.metadata, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  @Column({ type: 'varchar', length: 500, nullable: true })
  author: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  publisher: string | null;

  @Column({ name: 'publish_year', type: 'varchar', length: 10, nullable: true })
  publishYear: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  isbn: string | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'page_count', type: 'int', nullable: true })
  pageCount: number | null;

  @Column({ name: 'open_library_key', type: 'varchar', length: 100, nullable: true })
  openLibraryKey: string | null;

  @ManyToMany(() => SubjectEntity, (subject) => subject.bookMetadata, {
    cascade: true,
    eager: true,
  })
  @JoinTable({
    name: 'book_subjects',
    joinColumn: { name: 'book_metadata_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'subject_id', referencedColumnName: 'id' },
  })
  subjects: SubjectEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
