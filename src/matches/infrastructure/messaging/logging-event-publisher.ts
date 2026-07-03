import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, EventPublisher } from '../../application/ports/event-publisher.port';

/**
 * Implementación de `EventPublisher` para Fase 1: solo registra el evento en log.
 *
 * TODO(Fase 2): sustituir por un adaptador BullMQ (Redis) que publique el evento
 * en la cola para que `turn.processor` lo consuma. El dominio no cambia: solo se
 * cambia el adaptador inyectado en el módulo.
 */
@Injectable()
export class LoggingEventPublisher implements EventPublisher {
  private readonly logger = new Logger('DomainEvent');

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(`${event.name} match=${event.matchId} ${JSON.stringify(event.payload ?? {})}`);
  }
}
