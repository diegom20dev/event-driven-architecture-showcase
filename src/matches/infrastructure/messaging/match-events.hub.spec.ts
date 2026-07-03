import { MatchEventsHub } from './match-events.hub';
import { DomainEvent } from '../../application/ports/event-publisher.port';

const ev = (name: string, matchId: string, payload?: Record<string, unknown>): DomainEvent => ({
  name,
  matchId,
  occurredAt: new Date('2026-07-02T00:00:00.000Z'),
  payload,
});

describe('MatchEventsHub', () => {
  it('stream filtra por matchId y mapea a MessageEvent (type + data)', () => {
    const hub = new MatchEventsHub();
    const received: any[] = [];
    const sub = hub.stream('m1').subscribe((e) => received.push(e));

    hub.emit(ev('match.move_applied', 'm1', { roundResolved: true }));
    hub.emit(ev('match.finished', 'otra', { winnerId: 'x' })); // otra partida → ignorada
    hub.emit(ev('match.finished', 'm1', { winnerId: 'p2' }));

    sub.unsubscribe();

    expect(received.map((e) => e.type)).toEqual(['match.move_applied', 'match.finished']);
    expect(received[0].data).toMatchObject({ matchId: 'm1', roundResolved: true });
    expect(received[1].data).toMatchObject({ matchId: 'm1', winnerId: 'p2' });
  });

  it('no entrega eventos emitidos antes de suscribirse (hot stream)', () => {
    const hub = new MatchEventsHub();
    hub.emit(ev('match.started', 'm1'));
    const received: any[] = [];
    const sub = hub.stream('m1').subscribe((e) => received.push(e));
    sub.unsubscribe();
    expect(received).toHaveLength(0);
  });
});
