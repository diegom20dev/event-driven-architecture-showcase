import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { DomainEvent } from '../../application/ports/event-publisher.port';

/**
 * Bus in-process de eventos de partida para el streaming SSE. El worker y el HTTP
 * corren en el mismo proceso, así que un Subject basta para que las notificaciones
 * publicadas por el worker (match.move_applied / match.finished) y por el HTTP
 * (match.started) lleguen a los clientes suscritos.
 *
 * NOTA (multi-instancia): si algún día worker y API se despliegan como procesos
 * separados, este Subject NO cruza procesos → habría que reemplazarlo por Redis
 * pub/sub (el evento del worker no llegaría a la instancia HTTP que tiene el SSE).
 */
@Injectable()
export class MatchEventsHub {
  private readonly events$ = new Subject<DomainEvent>();

  /** Publica un evento en el bus (lo llama el EventPublisher). */
  emit(event: DomainEvent): void {
    this.events$.next(event);
  }

  /** Stream SSE de los eventos de una partida concreta. */
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
