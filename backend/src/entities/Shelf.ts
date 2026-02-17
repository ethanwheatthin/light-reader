import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DocumentEntity } from './Document';

@Entity('shelves')
export class ShelfEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 7 })
  color: string;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;

  @OneToMany(() => DocumentEntity, (doc) => doc.shelf)
  documents: DocumentEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
