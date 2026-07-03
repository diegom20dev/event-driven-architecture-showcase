import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MatchStatus } from '../../domain/match-status';
import { Move } from '../../domain/rps';

/**
 * Persistence model (table `matches`). Infrastructure detail:
 * the domain (`Match`) has no knowledge of it; `MatchMapper` translates between the two.
 */
@Entity('matches')
export class MatchOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MatchStatus })
  status: MatchStatus;

  /** List of playerIds (max 2 for RPS). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  players: string[];

  // playerId is a free-form string (not a UUID), so winner_id is varchar like the rest of the player IDs.
  @Column({ type: 'varchar', length: 64, name: 'winner_id', nullable: true })
  winnerId: string | null;

  /**
   * Aggregate version for optimistic locking. Verified with a manual CAS in
   * `TypeormMatchRepository.save` (UPDATE ... WHERE version = :expected).
   */
  @Column({ type: 'int', default: 0 })
  version: number;

  /** Roster size that triggers match start (IN_PROGRESS). */
  @Column({ type: 'int', name: 'expected_players', default: 2 })
  expectedPlayers: number;

  /** Points needed to win. */
  @Column({ type: 'int', name: 'points_to_win', default: 3 })
  pointsToWin: number;

  /** Current round (starting from 1). */
  @Column({ type: 'int', name: 'round_number', default: 1 })
  roundNumber: number;

  /** RPS moves for the current round, keyed by player (jsonb). Cleared on resolution. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  choices: Record<string, Move>;

  /** Accumulated score per player. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  scores: Record<string, number>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
