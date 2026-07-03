/** Injection token for the move persistence port. */
export const MOVE_REPOSITORY = Symbol('MOVE_REPOSITORY');

export type MoveStatus = 'PENDING' | 'DONE' | 'FAILED';

export interface MoveRecord {
  status: MoveStatus;
  result: Record<string, unknown> | null;
  /** Optimistic lock token; passed back to `complete` as the expected version. */
  version: number;
}

/**
 * Persistence port for moves. Idempotency by (matchId, clientMoveId)
 * is enforced by the adapter; domain/application have no knowledge of TypeORM.
 */
export interface MoveRepository {
  /** Returns the move (status + result), or null if it does not exist. */
  findByKey(matchId: string, clientMoveId: string): Promise<MoveRecord | null>;

  /**
   * Inserts the move in PENDING state (result=null) idempotently.
   * inserted=false if (matchId, clientMoveId) already existed (prevents double-enqueue).
   */
  insertPending(input: {
    matchId: string;
    clientMoveId: string;
    payload: Record<string, unknown>;
  }): Promise<{ inserted: boolean }>;

  /**
   * Marks the move as DONE with its result (called by the worker). Optimistic lock:
   * only applies if the version in the DB is still `expectedVersion`; if another
   * writer changed it, throws `OptimisticLockError`.
   */
  complete(
    input: {
      matchId: string;
      clientMoveId: string;
      result: Record<string, unknown>;
    },
    expectedVersion: number,
  ): Promise<void>;

  /** Marks the move as FAILED (worker exhausted retries). */
  markFailed(matchId: string, clientMoveId: string): Promise<void>;
}
