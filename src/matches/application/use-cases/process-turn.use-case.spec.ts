import { ProcessTurnUseCase, ProcessTurnCommand } from './process-turn.use-case';
import { Match } from '../../domain/match';
import { Move } from '../../domain/rps';
import { MatchNotFoundError, MoveNotFoundError, OptimisticLockError } from '../../domain/errors';
import { MatchRepository } from '../ports/match-repository.port';
import { MoveRecord, MoveRepository } from '../ports/move-repository.port';
import { DomainEvent, EventPublisher } from '../ports/event-publisher.port';

class FakeMatchRepository implements MatchRepository {
  constructor(public match: Match | null) {}
  async save(): Promise<void> {}
  async findById(): Promise<Match | null> {
    return this.match;
  }
}

class FakeMoveRepository implements MoveRepository {
  private store = new Map<string, MoveRecord>();
  completed: Record<string, Record<string, unknown>> = {};

  seed(clientMoveId: string, rec: MoveRecord = { status: 'PENDING', result: null, version: 1 }) {
    this.store.set(clientMoveId, rec);
  }
  async findByKey(_matchId: string, clientMoveId: string) {
    return this.store.get(clientMoveId) ?? null;
  }
  async insertPending() {
    return { inserted: true };
  }
  async complete(
    i: { matchId: string; clientMoveId: string; result: Record<string, unknown> },
    expectedVersion: number,
  ) {
    const rec = this.store.get(i.clientMoveId);
    if (!rec || rec.version !== expectedVersion) {
      throw new OptimisticLockError(`move ${i.clientMoveId}`, expectedVersion);
    }
    this.completed[i.clientMoveId] = i.result;
    this.store.set(i.clientMoveId, { status: 'DONE', result: i.result, version: expectedVersion + 1 });
  }
  async markFailed() {}
}

class FakeEventPublisher implements EventPublisher {
  events: DomainEvent[] = [];
  async publish(e: DomainEvent) {
    this.events.push(e);
  }
  names() {
    return this.events.map((e) => e.name);
  }
}

const inProgress = (pointsToWin = 3) => {
  const m = Match.create('m1', 2, pointsToWin);
  m.join('p1');
  m.join('p2');
  return m;
};

const cmd = (playerId: string, clientMoveId: string, round: number, move: Move): ProcessTurnCommand => ({
  matchId: 'm1',
  playerId,
  clientMoveId,
  payload: { round, move },
});

describe('ProcessTurnUseCase (piedra-papel-tijera)', () => {
  it('registra la jugada sin resolver la ronda y publica match.move_applied', async () => {
    const match = inProgress(3);
    const moves = new FakeMoveRepository();
    moves.seed('c1');
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(match), moves, events);

    await uc.execute(cmd('p1', 'c1', 1, Move.ROCK));

    expect(moves.completed['c1']).toMatchObject({ roundResolved: false, roundNumber: 1 });
    expect(events.names()).toEqual(['match.move_applied']);
    expect(match.roundNumber).toBe(1);
  });

  it('la última jugada resuelve la ronda y, al ganar, publica match.finished', async () => {
    const match = inProgress(1); // primero a 1 punto
    const moves = new FakeMoveRepository();
    moves.seed('c1');
    moves.seed('c2');
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(match), moves, events);

    await uc.execute(cmd('p1', 'c1', 1, Move.ROCK));
    await uc.execute(cmd('p2', 'c2', 1, Move.SCISSORS)); // rock vence scissors

    expect(match.status).toBe('FINISHED');
    expect(match.winnerId).toBe('p1');
    expect(moves.completed['c2']).toMatchObject({ roundResolved: true, roundWinnerId: 'p1', winnerId: 'p1' });
    expect(events.names()).toContain('match.finished');
  });

  it('es idempotente: si el move ya está DONE no reprocesa ni reemite', async () => {
    const match = inProgress(3);
    const moves = new FakeMoveRepository();
    moves.seed('c1', { status: 'DONE', result: {}, version: 2 });
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(match), moves, events);

    await uc.execute(cmd('p1', 'c1', 1, Move.ROCK));

    expect(moves.completed['c1']).toBeUndefined();
    expect(events.events).toHaveLength(0);
  });

  it('propaga OptimisticLockError si el save del match detecta conflicto', async () => {
    const match = inProgress(3);
    const repo = new FakeMatchRepository(match);
    repo.save = async () => {
      throw new OptimisticLockError('match m1', match.version);
    };
    const moves = new FakeMoveRepository();
    moves.seed('c1');
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(repo, moves, events);

    await expect(uc.execute(cmd('p1', 'c1', 1, Move.ROCK))).rejects.toBeInstanceOf(OptimisticLockError);
    expect(events.events).toHaveLength(0);
    expect(moves.completed['c1']).toBeUndefined();
  });

  it('lanza MoveNotFoundError si el move PENDING no existe', async () => {
    const match = inProgress(3);
    const moves = new FakeMoveRepository(); // sin seed
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(match), moves, events);

    await expect(uc.execute(cmd('p1', 'c1', 1, Move.ROCK))).rejects.toBeInstanceOf(MoveNotFoundError);
  });

  it('retry tras FINISHED: completa el move (no falla) y NO re-emite match.finished', async () => {
    // Simula que el juego ya terminó pero el move que lo cerró quedó PENDING (crash
    // entre save-match y complete-move). El reintento no debe lanzar ni duplicar finished.
    const match = inProgress(1);
    match.playMove('p1', 1, Move.ROCK);
    match.playMove('p2', 1, Move.SCISSORS); // FINISHED, ganó p1
    const moves = new FakeMoveRepository();
    moves.seed('c2'); // el move de p2 (que cerró) sigue PENDING
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(match), moves, events);

    await uc.execute(cmd('p2', 'c2', 1, Move.SCISSORS));

    expect(moves.completed['c2']).toBeDefined(); // el move llega a DONE
    expect(events.names()).toEqual(['match.move_applied']); // sin match.finished
  });

  it('lanza MatchNotFoundError si la partida no existe', async () => {
    const moves = new FakeMoveRepository();
    moves.seed('c1');
    const events = new FakeEventPublisher();
    const uc = new ProcessTurnUseCase(new FakeMatchRepository(null), moves, events);

    await expect(uc.execute(cmd('p1', 'c1', 1, Move.ROCK))).rejects.toBeInstanceOf(MatchNotFoundError);
  });
});
