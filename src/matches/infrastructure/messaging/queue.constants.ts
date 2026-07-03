/** Nombre de la cola de procesamiento de turnos. */
export const TURNS_QUEUE = 'turns';

/** Nombre del job dentro de la cola. */
export const TURN_JOB = 'process';

/** Evento que dispara el encolado del turno (comando disfrazado de evento). */
export const MATCH_MOVE_RECEIVED = 'match.move_received';

/**
 * jobId determinista → idempotencia a nivel de cola (BullMQ ignora add con jobId repetido).
 * BullMQ no permite `:` en custom ids; usamos `_` como separador (ambos son UUID fijos).
 */
export function turnJobId(matchId: string, clientMoveId: string): string {
  return `${matchId}_${clientMoveId}`;
}
