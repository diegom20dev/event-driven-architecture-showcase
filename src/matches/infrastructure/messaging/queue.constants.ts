/** Name of the turn-processing queue. */
export const TURNS_QUEUE = 'turns';

/** Job name within the queue. */
export const TURN_JOB = 'process';

/** Event that triggers turn enqueuing (a command disguised as an event). */
export const MATCH_MOVE_RECEIVED = 'match.move_received';

/**
 * Deterministic jobId → idempotency at the queue level (BullMQ ignores add calls
 * with a duplicate jobId). BullMQ does not allow `:` in custom IDs; we use `_` as
 * the separator (both values are fixed UUIDs).
 */
export function turnJobId(matchId: string, clientMoveId: string): string {
  return `${matchId}_${clientMoveId}`;
}
