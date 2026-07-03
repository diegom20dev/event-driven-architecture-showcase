import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { DomainEvent } from '../../application/ports/event-publisher.port';

/**
 * In-process event bus for match SSE streaming. The worker and HTTP server run in the
 * same process, so a single Subject is enough for events published by the worker
 * (match.move_applied / match.finished) and by HTTP (match.started) to reach
 * subscribed clients.
 *
 * NOTE (multi-instance): if the worker and API are ever deployed as separate processes
 * this Subject will NOT cross process boundaries → replace with Redis pub/sub
 * (worker events would not reach the HTTP instance holding the SSE connection).
 */
@Injectable()
export class MatchEventsHub {
  private readonly events$ = new Subject<DomainEvent>();

  /** Publishes an event onto the bus (called by the EventPublisher adapter). */
  emit(event: DomainEvent): void {
    this.events$.next(event);
  }

  /** SSE stream of events for a specific match. */
  stream(matchId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((e) => e.matchId === matchId),
      map((e) => ({
        type: e.name,
        data: { matchId: e.matchId, occurredAt: e.occurredAt, ...e.payload },
      })),
    );
  }
}
