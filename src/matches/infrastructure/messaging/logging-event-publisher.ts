import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, EventPublisher } from '../../application/ports/event-publisher.port';

/** `EventPublisher` adapter that only logs events (used in tests and local dev). */
@Injectable()
export class LoggingEventPublisher implements EventPublisher {
  private readonly logger = new Logger('DomainEvent');

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(`${event.name} match=${event.matchId} ${JSON.stringify(event.payload ?? {})}`);
  }
}
