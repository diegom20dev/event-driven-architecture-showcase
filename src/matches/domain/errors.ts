import { MatchStatus } from './match-status';

/**
 * Errores de dominio. Son puros (no conocen HTTP).
 * La capa de infraestructura los mapea a códigos HTTP en `DomainExceptionFilter`.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** La partida solicitada no existe. → 404 */
export class MatchNotFoundError extends DomainError {
  constructor(matchId: string) {
    super(`Match ${matchId} not found`);
  }
}

/** Se intentó una transición de estado no permitida por la máquina de estados. → 409 */
export class InvalidTransitionError extends DomainError {
  constructor(from: MatchStatus, to: MatchStatus) {
    super(`Invalid transition: ${from} -> ${to}`);
  }
}

/** Ya hay dos jugadores en la partida. → 409 */
export class MatchFullError extends DomainError {
  constructor(matchId: string) {
    super(`Match ${matchId} already has the maximum number of players`);
  }
}

/** El jugador ya estaba unido a esta partida. → 409 */
export class PlayerAlreadyJoinedError extends DomainError {
  constructor(playerId: string, matchId: string) {
    super(`Player ${playerId} already joined match ${matchId}`);
  }
}

/** Se intentó jugar un turno sobre una partida que no está IN_PROGRESS. → 409 */
export class MoveNotAllowedError extends DomainError {
  constructor(matchId: string, status: MatchStatus) {
    super(`Cannot submit a move to match ${matchId} while it is ${status}`);
  }
}

/** No existe un move con ese (matchId, clientMoveId). → 404 */
export class MoveNotFoundError extends DomainError {
  constructor(matchId: string, clientMoveId: string) {
    super(`Move ${clientMoveId} not found for match ${matchId}`);
  }
}

/** Un jugador que no pertenece a la partida intentó jugar. → 409 */
export class PlayerNotInMatchError extends DomainError {
  constructor(playerId: string, matchId: string) {
    super(`Player ${playerId} is not part of match ${matchId}`);
  }
}

/** Jugada RPS inválida (no es ROCK/PAPER/SCISSORS). → 422 */
export class InvalidMoveError extends DomainError {
  constructor(move: unknown) {
    super(`Invalid move ${String(move)}: must be ROCK, PAPER or SCISSORS`);
  }
}

/** Se jugó una ronda que no es la actual de la partida. → 409 */
export class InvalidRoundError extends DomainError {
  constructor(matchId: string, got: number, current: number) {
    super(`Round ${got} is not the current round (${current}) for match ${matchId}`);
  }
}

/**
 * Conflicto de optimistic lock: otro escritor modificó el recurso entre la lectura
 * y la escritura (la version esperada ya no coincide). → 409
 * `resource` describe qué se intentaba escribir, p.ej. `move c1 of match m1` o `match m1`.
 */
export class OptimisticLockError extends DomainError {
  constructor(resource: string, expectedVersion: number) {
    super(`Optimistic lock conflict on ${resource} (expected version ${expectedVersion})`);
  }
}
