import { Job } from 'bullmq';
import { TurnProcessor } from './turn.processor';
import { ProcessTurnCommand, ProcessTurnUseCase } from '../../application/use-cases/process-turn.use-case';
import { MoveRepository } from '../../application/ports/move-repository.port';

class FakeMoveRepository implements MoveRepository {
  failed: Array<{ matchId: string; clientMoveId: string }> = [];
  async findByKey() {
    return null;
  }
  async insertPending() {
    return { inserted: true };
  }
  async complete() {}
  async markFailed(matchId: string, clientMoveId: string) {
    this.failed.push({ matchId, clientMoveId });
  }
}

// ProcessTurnUseCase no participa en la ruta 'failed'; un doble mínimo basta.
const noopProcessTurn = { execute: async () => {} } as unknown as ProcessTurnUseCase;

const jobWith = (attemptsMade: number, attempts: number): Job<ProcessTurnCommand> =>
  ({
    data: { matchId: 'm1', playerId: 'p1', clientMoveId: 'c1', payload: {} },
    attemptsMade,
    opts: { attempts },
  }) as unknown as Job<ProcessTurnCommand>;

describe('TurnProcessor.onFailed', () => {
  it('NO marca FAILED mientras queden reintentos', async () => {
    const moves = new FakeMoveRepository();
    const processor = new TurnProcessor(noopProcessTurn, moves);

    await processor.onFailed(jobWith(1, 3), new Error('boom'));

    expect(moves.failed).toHaveLength(0);
  });

  it('marca FAILED cuando se agotan los reintentos', async () => {
    const moves = new FakeMoveRepository();
    const processor = new TurnProcessor(noopProcessTurn, moves);

    await processor.onFailed(jobWith(3, 3), new Error('boom'));

    expect(moves.failed).toEqual([{ matchId: 'm1', clientMoveId: 'c1' }]);
  });

  it('es defensivo si el job es undefined', async () => {
    const moves = new FakeMoveRepository();
    const processor = new TurnProcessor(noopProcessTurn, moves);

    await processor.onFailed(undefined, new Error('boom'));

    expect(moves.failed).toHaveLength(0);
  });
});
