import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
} from 'typeorm';
import { BookMetadataEntity } from './BookMetadata';

@Entity('subjects')
export class SubjectEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200, unique: true })
  name: string;

  @ManyToMany(() => BookMetadataEntity, (meta) => meta.subjects)
  bookMetadata: BookMetadataEntity[];
}
