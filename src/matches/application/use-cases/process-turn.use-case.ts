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
   * Worker consumer for the Rock-Paper-Scissors game. Idempotent at multiple layers:
   *  - move already DONE → no-op;
   *  - `playMove` is idempotent (move already recorded / stale round → accepted:false);
   *  - CAS on `matches.version` and `moves.version`.
   *
   * Turn serialisation: no transaction or pessimistic lock. If two turns for the same
   * match run concurrently, the match `save` does a CAS on `version`; the loser throws
   * OptimisticLockError → the BullMQ job retries on fresh state. In-memory state is
   * discarded on failure, so there is no double-counting.
   */
  async execute(cmd: ProcessTurnCommand): Promise<void> {
    const existing = await this.moves.findByKey(cmd.matchId, cmd.clientMoveId);
    if (existing?.status === 'DONE') {
      return;
    }
    // The HTTP producer already inserted the move as PENDING before enqueuing; if it is
    // missing something is corrupted. Without it there is no `version` for the optimistic lock.
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

    // Only persist the match if the aggregate changed (avoids version bumps on replays).
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

    // Optimistic lock on the move: if another writer changed it, complete() throws and
    // the job retries (on retry it will find the move as DONE).
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

    // `accepted &&`: on a post-FINISHED retry outcome.finished is still true but
    // accepted is false → we must not re-emit the terminal event.
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
