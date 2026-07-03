import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { MatchStatus } from '../../domain/match-status';
import { Move } from '../../domain/rps';

/**
 * Modelo de persistencia (tabla `matches`). Es un detalle de infraestructura:
 * el dominio (`Match`) no lo conoce; el `MatchMapper` traduce entre ambos.
 */
@Entity('matches')
export class MatchOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MatchStatus })
  status: MatchStatus;

  /** Lista de playerIds (máx. 2 en Fase 1). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  players: string[];

  // playerId es un string libre (no uuid), así que winner_id es varchar como el resto de ids de jugador.
  @Column({ type: 'varchar', length: 64, name: 'winner_id', nullable: true })
  winnerId: string | null;

  /**
   * Versión del agregado para optimistic lock. Se verifica con CAS manual en
   * `TypeormMatchRepository.save` (UPDATE ... WHERE version = :expected).
   */
  @Column({ type: 'int', default: 0 })
  version: number;

  /** Cupo que dispara el arranque de la partida (IN_PROGRESS). */
  @Column({ type: 'int', name: 'expected_players', default: 2 })
  expectedPlayers: number;

  /** Puntos necesarios para ganar. */
  @Column({ type: 'int', name: 'points_to_win', default: 3 })
  pointsToWin: number;

  /** Ronda actual (desde 1). */
  @Column({ type: 'int', name: 'round_number', default: 1 })
  roundNumber: number;

  /** Jugadas RPS de la ronda actual, por jugador (jsonb). Se limpia al resolver. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  choices: Record<string, Move>;

  /** Puntaje acumulado por jugador. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  scores: Record<string, number>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
