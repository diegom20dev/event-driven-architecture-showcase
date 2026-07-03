import { Inject, Injectable } from '@nestjs/common';
import { MatchNotFoundError } from '../../domain/errors';
import { MATCH_REPOSITORY, MatchRepository } from '../ports/match-repository.port';
import { MOVE_REPOSITORY, MoveRepository, MoveStatus } from '../ports/move-repository.port';
import { EVENT_PUBLISHER, EventPublisher } from '../ports/event-publisher.port';

export interface SubmitMoveCommand {
  matchId: string;
  playerId: string;
  clientMoveId: string;
  payload?: Record<string, unknown>;
}

export interface SubmitMoveResult {
  matchId: string;
  clientMoveId: string;
  status: MoveStatus;
  result: Record<string, unknown> | null;
  deduplicated: boolean;
}

@Injectable()
export class SubmitMoveUseCase {
  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(MOVE_REPOSITORY) private readonly moves: MoveRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  /**
   * Productor asíncrono:
   *   1. Fast-path: si el move existe, devuelve su estado/result (PENDING o DONE) sin re-encolar.
   *   2. Nuevo: valida partida (404/409 síncronos), inserta PENDING y publica match.move_received.
   *      El procesamiento real ocurre en el worker (TurnProcessor → ProcessTurnUseCase).
   */
  async execute(cmd: SubmitMoveCommand): Promise<SubmitMoveResult> {
    const existing = await this.moves.findByKey(cmd.matchId, cmd.clientMoveId);
    if (existing) {
      return {
        matchId: cmd.matchId,
        clientMoveId: cmd.clientMoveId,
        status: existing.status,
        result: existing.result,
        deduplicated: true,
      };
    }

    const match = await this.matches.findById(cmd.matchId);
    if (!match) {
      throw new MatchNotFoundError(cmd.matchId);
    }
    match.assertCanSubmitMove();

    const { inserted } = await this.moves.insertPending({
      matchId: cmd.matchId,
      clientMoveId: cmd.clientMoveId,
      payload: cmd.payload ?? {},
    });

    if (inserted) {
      // El adaptador BullMQ enruta este evento a la cola 'turns' (jobId determinista).
      await this.events.publish({
        name: 'match.move_received',
        matchId: cmd.matchId,
        occurredAt: new Date(),
        payload: {
          playerId: cmd.playerId,
          clientMoveId: cmd.clientMoveId,
          payload: cmd.payload ?? {},
        },
      });
    }

    return {
      matchId: cmd.matchId,
      clientMoveId: cmd.clientMoveId,
      status: 'PENDING',
      result: null,
      deduplicated: !inserted,
    };
  }
}
