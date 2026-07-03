import { SubmitMoveUseCase } from './submit-move.use-case';
import { Match } from '../../domain/match';
import { MatchNotFoundError, MoveNotAllowedError } from '../../domain/errors';
import { MatchRepository } from '../ports/match-repository.port';
import { MoveRecord, MoveRepository } from '../ports/move-repository.port';
import { DomainEvent, EventPublisher } from '../ports/event-publisher.port';

class FakeMatchRepository implements MatchRepository {
  constructor(private match: Match | null) {}
  async save(): Promise<void> {}
  async findById(): Promise<Match | null> {
    return this.match;
  }
}

class FakeMoveRepository implements MoveRepository {
  private store = new Map<string, MoveRecord>();
  private key(m: string, c: string) {
    return `${m}:${c}`;
  }
  seed(matchId: string, clientMoveId: string, rec: MoveRecord) {
    this.store.set(this.key(matchId, clientMoveId), rec);
  }
  async findByKey(matchId: string, clientMoveId: string) {
    return this.store.get(this.key(matchId, clientMoveId)) ?? null;
  }
  async insertPending(i: {
    matchId: string;
    clientMoveId: string;
    payload: Record<string, unknown>;
  }) {
    const k = this.key(i.matchId, i.clientMoveId);
    if (this.store.has(k)) return { inserted: false };
    this.store.set(k, { status: 'PENDING', result: null, version: 0 });
    return { inserted: true };
  }
  async complete() {}
  async markFailed() {}
}

class FakeEventPublisher implements EventPublisher {
  events: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}

const inProgressMatch = () => {
  const m = Match.create('m1');
  m.join('p1');
  m.join('p2');
  return m;
};

describe('SubmitMoveUseCase (productor async)', () => {
  const cmd = {
    matchId: 'm1',
    playerId: 'p1',
    clientMoveId: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e',
    payload: { action: 'attack' },
  };

  it('jugada nueva: encola (publica match.move_received), responde PENDING', async () => {
    const moves = new FakeMoveRepository();
    const events = new FakeEventPublisher();
    const uc = new SubmitMoveUseCase(new FakeMatchRepository(inProgressMatch()), moves, events);

    const res = await uc.execute(cmd);

    expect(res.status).toBe('PENDING');
    expect(res.deduplicated).toBe(false);
    expect(res.result).toBeNull();
    expect(events.events).toHaveLength(1);
    expect(events.events[0].name).toBe('match.move_received');
  });

  it('reintento PENDING: deduplicated=true, sin re-encolar', async () => {
    const moves = new FakeMoveRepository();
    moves.seed(cmd.matchId, cmd.clientMoveId, { status: 'PENDING', result: null, version: 0 });
    const events = new FakeEventPublisher();
    const uc = new SubmitMoveUseCase(new FakeMatchRepository(null), moves, events);

    const res = await uc.execute(cmd);

    expect(res.status).toBe('PENDING');
    expect(res.deduplicated).toBe(true);
    expect(events.events).toHaveLength(0);
  });

  it('reintento DONE: devuelve el result guardado y deduplicated=true', async () => {
    const moves = new FakeMoveRepository();
    moves.seed(cmd.matchId, cmd.clientMoveId, {
      status: 'DONE',
      result: { echo: { action: 'attack' } },
      version: 1,
    });
    const events = new FakeEventPublisher();
    const uc = new SubmitMoveUseCase(new FakeMatchRepository(null), moves, events);

    const res = await uc.execute(cmd);

    expect(res.status).toBe('DONE');
    expect(res.deduplicated).toBe(true);
    expect((res.result as any).echo).toEqual({ action: 'attack' });
  });

  it('lanza MatchNotFoundError si es nueva y la partida no existe', async () => {
    const uc = new SubmitMoveUseCase(
      new FakeMatchRepository(null),
      new FakeMoveRepository(),
      new FakeEventPublisher(),
    );
    await expect(uc.execute(cmd)).rejects.toBeInstanceOf(MatchNotFoundError);
  });

  it('lanza MoveNotAllowedError si la partida no está IN_PROGRESS', async () => {
    const uc = new SubmitMoveUseCase(
      new FakeMatchRepository(Match.create('m1')),
      new FakeMoveRepository(),
      new FakeEventPublisher(),
    );
    await expect(uc.execute(cmd)).rejects.toBeInstanceOf(MoveNotAllowedError);
  });
});
