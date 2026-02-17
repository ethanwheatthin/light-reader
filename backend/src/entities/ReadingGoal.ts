import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { DocumentEntity } from './Document';
import { ReadingGoalCompletedDayEntity } from './ReadingGoalCompletedDay';

@Entity('reading_goals')
export class ReadingGoalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid', unique: true })
  documentId: string;

  @OneToOne(() => DocumentEntity, (doc) => doc.readingGoal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentEntity;

  @Column({ name: 'daily_minutes', type: 'int' })
  dailyMinutes: number;

  @Column({ name: 'current_streak', type: 'int', default: 0 })
  currentStreak: number;

  @OneToMany(() => ReadingGoalCompletedDayEntity, (day) => day.readingGoal, {
    cascade: true,
    eager: true,
  })
  completedDays: ReadingGoalCompletedDayEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
