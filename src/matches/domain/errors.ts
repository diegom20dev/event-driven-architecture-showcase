import { MatchStatus } from './match-status';

/**
 * Domain errors. Pure classes (no HTTP knowledge).
 * The infrastructure layer maps them to HTTP status codes in `DomainExceptionFilter`.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested match does not exist. → 404 */
export class MatchNotFoundError extends DomainError {
  constructor(matchId: string) {
    super(`Match ${matchId} not found`);
  }
}

/** A state transition that the state machine does not allow was attempted. → 409 */
export class InvalidTransitionError extends DomainError {
  constructor(from: MatchStatus, to: MatchStatus) {
    super(`Invalid transition: ${from} -> ${to}`);
  }
}

/** The match already has the maximum number of players. → 409 */
export class MatchFullError extends DomainError {
  constructor(matchId: string) {
    super(`Match ${matchId} already has the maximum number of players`);
  }
}

/** The player has already joined this match. → 409 */
export class PlayerAlreadyJoinedError extends DomainError {
  constructor(playerId: string, matchId: string) {
    super(`Player ${playerId} already joined match ${matchId}`);
  }
}

/** A move was submitted to a match that is not IN_PROGRESS. → 409 */
export class MoveNotAllowedError extends DomainError {
  constructor(matchId: string, status: MatchStatus) {
    super(`Cannot submit a move to match ${matchId} while it is ${status}`);
  }
}

/** No move with that (matchId, clientMoveId) exists. → 404 */
export class MoveNotFoundError extends DomainError {
  constructor(matchId: string, clientMoveId: string) {
    super(`Move ${clientMoveId} not found for match ${matchId}`);
  }
}

/** A player who is not part of the match attempted to play. → 409 */
export class PlayerNotInMatchError extends DomainError {
  constructor(playerId: string, matchId: string) {
    super(`Player ${playerId} is not part of match ${matchId}`);
  }
}

/** Invalid RPS move (not ROCK/PAPER/SCISSORS). → 422 */
export class InvalidMoveError extends DomainError {
  constructor(move: unknown) {
    super(`Invalid move ${String(move)}: must be ROCK, PAPER or SCISSORS`);
  }
}

/** A round number other than the current round was submitted. → 409 */
export class InvalidRoundError extends DomainError {
  constructor(matchId: string, got: number, current: number) {
    super(`Round ${got} is not the current round (${current}) for match ${matchId}`);
  }
}

/**
 * Optimistic lock conflict: another writer modified the resource between the read
 * and the write (the expected version no longer matches). → 409
 * `resource` describes what was being written, e.g. `move c1 of match m1` or `match m1`.
 */
export class OptimisticLockError extends DomainError {
  constructor(resource: string, expectedVersion: number) {
    super(`Optimistic lock conflict on ${resource} (expected version ${expectedVersion})`);
  }
}
