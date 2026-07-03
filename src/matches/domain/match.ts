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

/** Piedra-papel-tijera es de exactamente 2 jugadores. */
export const MAX_PLAYERS = 2;

/** Snapshot plano para persistencia/serialización. El dominio no conoce TypeORM. */
export interface MatchSnapshot {
  id: string;
  status: MatchStatus;
  players: string[];
  winnerId: string | null;
  version: number;
  expectedPlayers: number;
  pointsToWin: number;
  roundNumber: number;
  /** Jugadas de la ronda ACTUAL, por jugador. Se limpia al resolver la ronda. */
  choices: Record<string, Move>;
  scores: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

/** Resultado de aplicar una jugada (para construir el `result` del move). */
export interface PlayMoveResult {
  /** false si fue un replay/ronda pasada (idempotente, no cuenta doble). */
  accepted: boolean;
  roundNumber: number;
  roundResolved: boolean;
  roundWinnerId: string | null;
  finished: boolean;
  winnerId: string | null;
}

/**
 * Agregado raíz `Match`. Encapsula la máquina de estados y las invariantes del dominio.
 *
 * Toda mutación pasa por un método de negocio (`join`, `cancel`, `submitMove`) que valida
 * la transición antes de cambiar el estado. El estado nunca se muta desde fuera.
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

  // ── Fábricas ──────────────────────────────────────────────────────────────

  /**
   * Crea una partida nueva en estado CREATED. RPS es de exactamente 2 jugadores;
   * `pointsToWin` es la meta de puntos (default 1 → "una mano decide").
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

  /** Reconstruye un agregado desde un snapshot (lo usa el repositorio). */
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

  // ── Lectura ───────────────────────────────────────────────────────────────

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

  // ── Comandos de negocio ─────────────────────────────────────────────────────

  /**
   * Une un jugador. El primer jugador mueve CREATED → WAITING_PLAYERS;
   * al completarse el cupo (`expectedPlayers`) la partida arranca → IN_PROGRESS.
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

  /** Aborta la partida desde cualquier estado no terminal. */
  cancel(now: Date = new Date()): void {
    this.transitionTo(MatchStatus.CANCELLED);
    this.touch(now);
  }

  /**
   * Valida la precondición síncrona de un turno (partida IN_PROGRESS). La usa el
   * productor HTTP antes de encolar; la aplicación real de la jugada es `playMove`.
   */
  assertCanSubmitMove(): void {
    if (this._status !== MatchStatus.IN_PROGRESS) {
      throw new MoveNotAllowedError(this.id, this._status);
    }
  }

  /**
   * Aplica la jugada RPS de un jugador a la ronda actual.
   *
   * Idempotente: registrar la misma jugada del mismo jugador, o una jugada de una
   * ronda ya pasada, no cuenta doble (devuelve `accepted:false`). Cuando ambos
   * jugadores han jugado, resuelve la ronda con las reglas de piedra-papel-tijera
   * (empate → ronda sin punto), avanza la ronda y, si alguien llega a `pointsToWin`,
   * transiciona IN_PROGRESS → FINISHED fijando `winnerId`.
   */
  playMove(playerId: string, roundNumber: number, move: Move, now: Date = new Date()): PlayMoveResult {
    if (!this._players.includes(playerId)) {
      throw new PlayerNotInMatchError(playerId, this.id);
    }
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      throw new InvalidRoundError(this.id, roundNumber, this._roundNumber);
    }

    // Idempotencia ante reintento (crash entre save-match y complete-move, o entrega
    // duplicada): si el juego ya terminó o la ronda ya se cerró, es no-op — el move se
    // completará igual. Va ANTES de assertCanSubmitMove para no fallar sobre un FINISHED.
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

    // Jugada ya registrada este round → idempotente (no cuenta doble).
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

  // ── Interno ─────────────────────────────────────────────────────────────────

  private resolveRound(roundNumber: number, now: Date): PlayMoveResult {
    // RPS es de 2 jugadores: hay exactamente dos entradas en choices.
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
