/** Injection token for the event-publishing port. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Domain event: something relevant that happened and that others can observe. */
export interface DomainEvent<T = Record<string, unknown>> {
  /** Stable event name, e.g. `match.started`, `match.move_applied`. */
  name: string;
  matchId: string;
  occurredAt: Date;
  payload?: T;
}

/** Output port for emitting domain events. */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
