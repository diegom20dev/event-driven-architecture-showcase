/** Token de inyección para el puerto de publicación de eventos. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Evento de dominio: algo relevante que ocurrió y que otros pueden observar. */
export interface DomainEvent<T = Record<string, unknown>> {
  /** Nombre estable del evento, p.ej. `match.started`, `match.move_applied`. */
  name: string;
  matchId: string;
  occurredAt: Date;
  payload?: T;
}

/**
 * Puerto de salida para emitir eventos de dominio.
 *
 * Fase 1: una implementación que solo registra en log.
 * TODO(Fase 2): adaptador BullMQ/Redis (y el puerto permite cambiar a SQS sin
 * tocar el dominio).
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
