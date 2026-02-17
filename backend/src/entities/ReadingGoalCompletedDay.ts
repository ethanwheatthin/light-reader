import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ReadingGoalEntity } from './ReadingGoal';

@Entity('reading_goal_completed_days')
@Unique(['readingGoalId', 'completedDate'])
export class ReadingGoalCompletedDayEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'reading_goal_id', type: 'uuid' })
  readingGoalId: string;

  @ManyToOne(() => ReadingGoalEntity, (goal) => goal.completedDays, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reading_goal_id' })
  readingGoal: ReadingGoalEntity;

  @Column({ name: 'completed_date', type: 'date' })
  completedDate: string;
}
