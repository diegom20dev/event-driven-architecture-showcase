import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent, EventPublisher } from '../../application/ports/event-publisher.port';
import { MatchEventsHub } from './match-events.hub';
import { MATCH_MOVE_RECEIVED, TURN_JOB, TURNS_QUEUE, turnJobId } from './queue.constants';

/**
 * Adaptador de `EventPublisher` sobre BullMQ. Enruta por `event.name`:
 *  - match.move_received → encola el job de procesamiento (cola 'turns').
 *  - resto (match.started / move_applied / finished) → bus SSE (MatchEventsHub)
 *    para notificar a los clientes suscritos, y log de observabilidad.
 */
@Injectable()
export class BullmqEventPublisher implements EventPublisher {
  private readonly logger = new Logger('DomainEvent');

  constructor(
    @InjectQueue(TURNS_QUEUE) private readonly turns: Queue,
    private readonly hub: MatchEventsHub,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(`${event.name} match=${event.matchId} ${JSON.stringify(event.payload ?? {})}`);

    if (event.name === MATCH_MOVE_RECEIVED) {
      const payload = event.payload as { clientMoveId: string };
      // matchId vive en el nivel superior del evento: lo inyectamos en el job data
      // para que ProcessTurnCommand quede completo ({ matchId, playerId, clientMoveId, payload }).
      await this.turns.add(
        TURN_JOB,
        { matchId: event.matchId, ...event.payload },
        { jobId: turnJobId(event.matchId, payload.clientMoveId) },
      );
      return;
    }
    // Notificación al cliente vía SSE.
    this.hub.emit(event);
  }
}
