import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { MatchOrmEntity } from './match.orm-entity';
import { MoveStatus } from '../../application/ports/move-repository.port';

/**
 * Table `moves`: records each move submission and serves as an idempotency log.
 * The UNIQUE(matchId, clientMoveId) constraint is the real safety net against
 * concurrent retries.
 */
@Entity('moves')
@Unique('uq_moves_match_client', ['matchId', 'clientMoveId'])
export class MoveOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'match_id' })
  matchId: string;

  @ManyToOne(() => MatchOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match?: MatchOrmEntity;

  /** Idempotency key provided by the client. */
  @Column({ type: 'uuid', name: 'client_move_id' })
  clientMoveId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  /** Async processing status. */
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: MoveStatus;

  /** Result; null while PENDING. */
  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  /**
   * Optimistic locking token. TypeORM auto-increments it on every UPDATE with
   * entity metadata; the WHERE version=:expected check is done manually by the
   * adapter because the repository uses QueryBuilder.update(), not save().
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
