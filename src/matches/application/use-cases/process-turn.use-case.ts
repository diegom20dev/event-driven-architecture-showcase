import { Inject, Injectable } from '@nestjs/common';
import { Move } from '../../domain/rps';
import { MatchNotFoundError, MoveNotFoundError } from '../../domain/errors';
import { MATCH_REPOSITORY, MatchRepository } from '../ports/match-repository.port';
import { MOVE_REPOSITORY, MoveRepository } from '../ports/move-repository.port';
import { EVENT_PUBLISHER, EventPublisher } from '../ports/event-publisher.port';

export interface ProcessTurnCommand {
  matchId: string;
  playerId: string;
  clientMoveId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class ProcessTurnUseCase {
  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(MOVE_REPOSITORY) private readonly moves: MoveRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  /**
   * Consumidor (worker) del juego piedra-papel-tijera. Idempotente por varias capas:
   *  - move ya DONE → no-op;
   *  - `playCard` es idempotente (carta ya registrada / ronda pasada → accepted:false);
   *  - CAS sobre `matches.version` y `moves.version`.
   *
   * Serialización de turnos: NO usa transacción ni lock pesimista. Si dos turnos de
   * la misma partida corren en paralelo, el `save` del match hace CAS sobre `version`;
   * el que pierde lanza OptimisticLockError → el job de BullMQ reintenta sobre estado
   * fresco. El estado en memoria se descarta al fallar, así que no hay doble conteo.
   */
  async execute(cmd: ProcessTurnCommand): Promise<void> {
    const existing = await this.moves.findByKey(cmd.matchId, cmd.clientMoveId);
    if (existing?.status === 'DONE') {
      return;
    }
    // El productor ya insertó el move PENDING antes de encolar; si falta, algo se
    // corrompió. Sin él no hay `version` para el optimistic lock.
    if (!existing) {
      throw new MoveNotFoundError(cmd.matchId, cmd.clientMoveId);
    }

    const match = await this.matches.findById(cmd.matchId);
    if (!match) {
      throw new MatchNotFoundError(cmd.matchId);
    }

    const round = Number(cmd.payload?.round);
    const move = cmd.payload?.move as Move;
    const outcome = match.playMove(cmd.playerId, round, move);

    // Solo persistimos el match si el agregado cambió (evita bumps de version en replays).
    if (outcome.accepted) {
      await this.matches.save(match);
    }

    const result: Record<string, unknown> = {
      roundNumber: outcome.roundNumber,
      accepted: outcome.accepted,
      roundResolved: outcome.roundResolved,
      roundWinnerId: outcome.roundWinnerId,
      scores: match.scores,
      status: match.status,
      winnerId: match.winnerId,
    };

    // Optimistic lock del move: si otro escritor lo cambió, complete() lanza y el
    // job reintenta (y en el reintento verá DONE).
    await this.moves.complete(
      { matchId: cmd.matchId, clientMoveId: cmd.clientMoveId, result },
      existing.version,
    );

    await this.events.publish({
      name: 'match.move_applied',
      matchId: cmd.matchId,
      occurredAt: new Date(),
      payload: {
        playerId: cmd.playerId,
        clientMoveId: cmd.clientMoveId,
        roundNumber: outcome.roundNumber,
        roundResolved: outcome.roundResolved,
      },
    });

    // `accepted &&`: en un reintento post-FINISHED outcome.finished sigue true pero
    // accepted es false → no re-emitimos el evento terminal.
    if (outcome.accepted && outcome.finished) {
      await this.events.publish({
        name: 'match.finished',
        matchId: cmd.matchId,
        occurredAt: new Date(),
        payload: { winnerId: outcome.winnerId, scores: match.scores },
      });
    }
  }
}
