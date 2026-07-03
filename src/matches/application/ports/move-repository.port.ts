/** Token de inyección para el puerto de persistencia de jugadas. */
export const MOVE_REPOSITORY = Symbol('MOVE_REPOSITORY');

export type MoveStatus = 'PENDING' | 'DONE' | 'FAILED';

export interface MoveRecord {
  status: MoveStatus;
  result: Record<string, unknown> | null;
  /** Token de optimistic lock; se pasa de vuelta a `complete` como versión esperada. */
  version: number;
}

/**
 * Puerto de persistencia de jugadas. La idempotencia por (matchId, clientMoveId)
 * vive en el adaptador; el dominio/aplicación no conocen TypeORM.
 */
export interface MoveRepository {
  /** Devuelve el move (estado + result), o null si no existe. */
  findByKey(matchId: string, clientMoveId: string): Promise<MoveRecord | null>;

  /**
   * Inserta el move en estado PENDING (result=null) de forma idempotente.
   * inserted=false si (matchId, clientMoveId) ya existía (evita doble-encolado).
   */
  insertPending(input: {
    matchId: string;
    clientMoveId: string;
    payload: Record<string, unknown>;
  }): Promise<{ inserted: boolean }>;

  /**
   * Marca el move como DONE con su result (lo llama el worker). Optimistic lock:
   * solo aplica si la version en DB sigue siendo `expectedVersion`; si otro
   * escritor la cambió, lanza `OptimisticLockError`.
   */
  complete(
    input: {
      matchId: string;
      clientMoveId: string;
      result: Record<string, unknown>;
    },
    expectedVersion: number,
  ): Promise<void>;

  /** Marca el move como FAILED (worker agotó reintentos). */
  markFailed(matchId: string, clientMoveId: string): Promise<void>;
}
