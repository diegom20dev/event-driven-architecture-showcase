import { Inject, Injectable } from '@nestjs/common';
import { MoveNotFoundError } from '../../domain/errors';
import { MOVE_REPOSITORY, MoveRepository, MoveStatus } from '../ports/move-repository.port';

export interface MoveView {
  matchId: string;
  clientMoveId: string;
  status: MoveStatus;
  result: Record<string, unknown> | null;
}

@Injectable()
export class GetMoveUseCase {
  constructor(@Inject(MOVE_REPOSITORY) private readonly moves: MoveRepository) {}

  async execute(matchId: string, clientMoveId: string): Promise<MoveView> {
    const rec = await this.moves.findByKey(matchId, clientMoveId);
    if (!rec) {
      throw new MoveNotFoundError(matchId, clientMoveId);
    }
    return { matchId, clientMoveId, status: rec.status, result: rec.result };
  }
}
