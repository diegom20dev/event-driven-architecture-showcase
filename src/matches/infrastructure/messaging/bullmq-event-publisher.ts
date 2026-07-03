import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent, EventPublisher } from '../../application/ports/event-publisher.port';
import { MatchEventsHub } from './match-events.hub';
import { MATCH_MOVE_RECEIVED, TURN_JOB, TURNS_QUEUE, turnJobId } from './queue.constants';

/**
 * `EventPublisher` adapter over BullMQ. Routes by `event.name`:
 *  - match.move_received → enqueues the processing job (queue 'turns').
 *  - others (match.started / move_applied / finished) → SSE bus (MatchEventsHub)
 *    to notify subscribed clients, plus an observability log.
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
      // matchId lives at the top level of the event: inject it into the job data so that
      // ProcessTurnCommand is complete ({ matchId, playerId, clientMoveId, payload }).
      await this.turns.add(
        TURN_JOB,
        { matchId: event.matchId, ...event.payload },
        { jobId: turnJobId(event.matchId, payload.clientMoveId) },
      );
      return;
    }
    // Notify the client via SSE.
    this.hub.emit(event);
  }
}
