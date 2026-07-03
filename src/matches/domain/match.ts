import { canTransition, isTerminal, MatchStatus } from './match-status';
import { Move, isMove, resolveRps } from './rps';
import {
  InvalidMoveError,
  InvalidRoundError,
  InvalidTransitionError,
  MatchFullError,
  MoveNotAllowedError,
  PlayerAlreadyJoinedError,
  PlayerNotInMatchError,
} from './errors';

/** Rock-Paper-Scissors requires exactly 2 players. */
export const MAX_PLAYERS = 2;

/** Flat snapshot for persistence/serialisation. The domain has no knowledge of TypeORM. */
export interface MatchSnapshot {
  id: string;
  status: MatchStatus;
  players: string[];
  winnerId: string | null;
  version: number;
  expectedPlayers: number;
  pointsToWin: number;
  roundNumber: number;
  /** Moves for the CURRENT round, keyed by player. Cleared when the round resolves. */
  choices: Record<string, Move>;
  scores: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of applying a move (used to build the move `result` record). */
export interface PlayMoveResult {
  /** false if this was a replay or a stale-round submission (idempotent, not double-counted). */
  accepted: boolean;
  roundNumber: number;
  roundResolved: boolean;
  roundWinnerId: string | null;
  finished: boolean;
  winnerId: string | null;
}

/**
 * Root aggregate `Match`. Encapsulates the state machine and domain invariants.
 *
 * All mutations go through a business method (`join`, `cancel`, `playMove`) that validates
 * the transition before changing state. State is never mutated from outside.
 */
export class Match {
  private constructor(
    public readonly id: string,
    private _status: MatchStatus,
    private readonly _players: string[],
    private _winnerId: string | null,
    private _version: number,
    private readonly _expectedPlayers: number,
    private readonly _pointsToWin: number,
    private _roundNumber: number,
    private _choices: Record<string, Move>,
    private _scores: Record<string, number>,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  // ── Factories ────────────────────────────────────────────────────────────

  /**
   * Creates a new match in CREATED state. RPS requires exactly 2 players;
   * `pointsToWin` is the score target (default 1 → "one round decides").
   */
  static create(
    id: string,
    expectedPlayers = 2,
    pointsToWin = 1,
    now: Date = new Date(),
  ): Match {
    if (expectedPlayers !== 2) {
      throw new RangeError('RPS requires exactly 2 players');
    }
    if (!Number.isInteger(pointsToWin) || pointsToWin < 1) {
      throw new RangeError('pointsToWin must be a positive integer');
    }
    return new Match(id, MatchStatus.CREATED, [], null, 0, expectedPlayers, pointsToWin, 1, {}, {}, now, now);
  }

  /** Rebuilds an aggregate from a snapshot (used by the repository). */
  static rehydrate(s: MatchSnapshot): Match {
    return new Match(
      s.id,
      s.status,
      [...s.players],
      s.winnerId,
      s.version,
      s.expectedPlayers,
      s.pointsToWin,
      s.roundNumber,
      { ...s.choices },
      { ...s.scores },
      s.createdAt,
      s.updatedAt,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  get status(): MatchStatus {
    return this._status;
  }

  get players(): readonly string[] {
    return [...this._players];
  }

  get winnerId(): string | null {
    return this._winnerId;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get expectedPlayers(): number {
    return this._expectedPlayers;
  }

  get pointsToWin(): number {
    return this._pointsToWin;
  }

  get roundNumber(): number {
    return this._roundNumber;
  }

  get scores(): Readonly<Record<string, number>> {
    return { ...this._scores };
  }

  toSnapshot(): MatchSnapshot {
    return {
      id: this.id,
      status: this._status,
      players: [...this._players],
      winnerId: this._winnerId,
      version: this._version,
      expectedPlayers: this._expectedPlayers,
      pointsToWin: this._pointsToWin,
      roundNumber: this._roundNumber,
      choices: { ...this._choices },
      scores: { ...this._scores },
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  // ── Business commands ────────────────────────────────────────────────────

  /**
   * Adds a player to the match. The first player moves CREATED → WAITING_PLAYERS;
   * filling the roster (`expectedPlayers`) starts the match → IN_PROGRESS.
   */
  join(playerId: string, now: Date = new Date()): void {
    if (isTerminal(this._status)) {
      throw new InvalidTransitionError(this._status, MatchStatus.WAITING_PLAYERS);
    }
    if (this._players.includes(playerId)) {
      throw new PlayerAlreadyJoinedError(playerId, this.id);
    }
    if (this._players.length >= this._expectedPlayers) {
      throw new MatchFullError(this.id);
    }

    this._players.push(playerId);

    if (this._players.length === this._expectedPlayers) {
      this.transitionTo(MatchStatus.IN_PROGRESS);
    } else if (this._status === MatchStatus.CREATED) {
      this.transitionTo(MatchStatus.WAITING_PLAYERS);
    }

    this.touch(now);
  }

  /** Aborts the match from any non-terminal state. */
  cancel(now: Date = new Date()): void {
    this.transitionTo(MatchStatus.CANCELLED);
    this.touch(now);
  }

  /**
   * Validates the synchronous precondition for a turn (match must be IN_PROGRESS).
   * Called by the HTTP producer before enqueuing; the actual move application is `playMove`.
   */
  assertCanSubmitMove(): void {
    if (this._status !== MatchStatus.IN_PROGRESS) {
      throw new MoveNotAllowedError(this.id, this._status);
    }
  }

  /**
   * Applies a player's RPS move to the current round.
   *
   * Idempotent: submitting the same move by the same player, or a move for a past round,
   * does not double-count (returns `accepted:false`). When both players have played, resolves
   * the round using RPS rules (tie → no point), advances the round, and transitions
   * IN_PROGRESS → FINISHED (setting `winnerId`) if someone reaches `pointsToWin`.
   */
  playMove(playerId: string, roundNumber: number, move: Move, now: Date = new Date()): PlayMoveResult {
    if (!this._players.includes(playerId)) {
      throw new PlayerNotInMatchError(playerId, this.id);
    }
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      throw new InvalidRoundError(this.id, roundNumber, this._roundNumber);
    }

    // Idempotency on retry (crash between save-match and complete-move, or duplicate delivery):
    // if the match is already FINISHED or the round is already closed, this is a no-op —
    // the move will still be completed. Must come BEFORE assertCanSubmitMove to avoid
    // throwing on a FINISHED match.
    if (this._status === MatchStatus.FINISHED || roundNumber < this._roundNumber) {
      return this.unchangedResult(roundNumber);
    }

    this.assertCanSubmitMove();
    if (!isMove(move)) {
      throw new InvalidMoveError(move);
    }
    if (roundNumber > this._roundNumber) {
      throw new InvalidRoundError(this.id, roundNumber, this._roundNumber);
    }

    // Move already recorded for this round → idempotent (no double-count).
    if (this._choices[playerId] !== undefined) {
      return this.unchangedResult(roundNumber);
    }

    this._choices[playerId] = move;
    this.touch(now);

    if (Object.keys(this._choices).length < this._expectedPlayers) {
      return {
        accepted: true,
        roundNumber,
        roundResolved: false,
        roundWinnerId: null,
        finished: false,
        winnerId: this._winnerId,
      };
    }

    return this.resolveRound(roundNumber, now);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private resolveRound(roundNumber: number, now: Date): PlayMoveResult {
    // RPS has exactly 2 players, so choices always has exactly two entries.
    const [[pA, mA], [pB, mB]] = Object.entries(this._choices);
    const outcome = resolveRps(mA, mB);
    const roundWinnerId = outcome === 'TIE' ? null : outcome === 'A' ? pA : pB;

    if (roundWinnerId) {
      this._scores[roundWinnerId] = (this._scores[roundWinnerId] ?? 0) + 1;
    }
    this._choices = {};
    this._roundNumber += 1;

    let finished = false;
    if (roundWinnerId && (this._scores[roundWinnerId] ?? 0) >= this._pointsToWin) {
      this.transitionTo(MatchStatus.FINISHED);
      this._winnerId = roundWinnerId;
      finished = true;
    }
    this.touch(now);

    return {
      accepted: true,
      roundNumber,
      roundResolved: true,
      roundWinnerId,
      finished,
      winnerId: this._winnerId,
    };
  }

  private unchangedResult(roundNumber: number): PlayMoveResult {
    return {
      accepted: false,
      roundNumber,
      roundResolved: false,
      roundWinnerId: null,
      finished: this._status === MatchStatus.FINISHED,
      winnerId: this._winnerId,
    };
  }

  private transitionTo(next: MatchStatus): void {
    if (!canTransition(this._status, next)) {
      throw new InvalidTransitionError(this._status, next);
    }
    this._status = next;
  }

  private touch(now: Date): void {
    this._updatedAt = now;
  }
}
