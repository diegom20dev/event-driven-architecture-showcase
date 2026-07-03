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
 * Tabla `moves`: registra cada jugada y sirve de control de idempotencia.
 * El UNIQUE(matchId, clientMoveId) es la red de seguridad real ante reintentos
 * concurrentes (ver docs/plans/2026-06-29-moves-idempotency-design.md).
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

  /** idempotencyKey provista por el cliente. */
  @Column({ type: 'uuid', name: 'client_move_id' })
  clientMoveId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  /** Estado del procesamiento asíncrono. */
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: MoveStatus;

  /** Resultado; null mientras está PENDING. */
  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  /**
   * Token de optimistic locking. TypeORM lo autoincrementa en cada UPDATE con
   * metadata de entidad; la verificación (WHERE version=:expected) la hace el
   * adaptador manualmente porque el repo usa QueryBuilder.update(), no save().
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
