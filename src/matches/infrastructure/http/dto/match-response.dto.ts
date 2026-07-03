import { ApiProperty } from '@nestjs/swagger';
import { Match } from '../../../domain/match';
import { MatchStatus } from '../../../domain/match-status';

/** Representación HTTP de una partida (vista pública del agregado). */
export class MatchResponseDto {
  @ApiProperty({ format: 'uuid', example: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e' })
  id: string;

  @ApiProperty({ enum: MatchStatus, example: MatchStatus.WAITING_PLAYERS })
  status: MatchStatus;

  @ApiProperty({ type: [String], example: ['player-1'] })
  players: string[];

  @ApiProperty({ nullable: true, example: null })
  winnerId: string | null;

  @ApiProperty({ example: 0 })
  version: number;

  @ApiProperty({ example: 2, description: 'Cupo de jugadores que dispara el arranque.' })
  expectedPlayers: number;

  @ApiProperty({ example: 3, description: 'Puntos para ganar.' })
  pointsToWin: number;

  @ApiProperty({ example: 1, description: 'Ronda actual.' })
  roundNumber: number;

  @ApiProperty({ example: { 'player-1': 2, 'player-2': 1 }, description: 'Puntaje por jugador.' })
  scores: Record<string, number>;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromDomain(match: Match): MatchResponseDto {
    const s = match.toSnapshot();
    const dto = new MatchResponseDto();
    dto.id = s.id;
    dto.status = s.status;
    dto.players = s.players;
    dto.winnerId = s.winnerId;
    dto.version = s.version;
    dto.expectedPlayers = s.expectedPlayers;
    dto.pointsToWin = s.pointsToWin;
    dto.roundNumber = s.roundNumber;
    dto.scores = s.scores;
    dto.createdAt = s.createdAt;
    dto.updatedAt = s.updatedAt;
    return dto;
  }
}

/** Respuesta de `POST /matches/:id/moves` (async: 202 PENDING). */
export class SubmitMoveResponseDto {
  @ApiProperty({ format: 'uuid' })
  matchId: string;

  @ApiProperty({ format: 'uuid' })
  clientMoveId: string;

  @ApiProperty({ enum: ['PENDING', 'DONE', 'FAILED'], example: 'PENDING' })
  status: 'PENDING' | 'DONE' | 'FAILED';

  @ApiProperty({ nullable: true, description: 'null mientras PENDING', example: null })
  result: Record<string, unknown> | null;

  @ApiProperty({ example: false, description: 'true si fue un reintento idempotente' })
  deduplicated: boolean;
}
