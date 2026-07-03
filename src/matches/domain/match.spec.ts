import { Match } from './match';
import { MatchStatus } from './match-status';
import { Move } from './rps';
import {
  InvalidMoveError,
  InvalidRoundError,
  InvalidTransitionError,
  MatchFullError,
  MoveNotAllowedError,
  PlayerAlreadyJoinedError,
  PlayerNotInMatchError,
} from './errors';

/** Partida IN_PROGRESS con 2 jugadores unidos (p1, p2). */
const inProgress = (pointsToWin = 1) => {
  const m = Match.create('m1', 2, pointsToWin);
  m.join('p1');
  m.join('p2');
  return m;
};

describe('Match (máquina de estados)', () => {
  it('nace en CREATED sin jugadores', () => {
    const match = Match.create('m1');
    expect(match.status).toBe(MatchStatus.CREATED);
    expect(match.players).toHaveLength(0);
    expect(match.roundNumber).toBe(1);
  });

  describe('create', () => {
    it('rechaza un cupo distinto de 2', () => {
      expect(() => Match.create('m1', 3)).toThrow(RangeError);
      expect(() => Match.create('m1', 1)).toThrow(RangeError);
    });

    it('rechaza pointsToWin < 1', () => {
      expect(() => Match.create('m1', 2, 0)).toThrow(RangeError);
    });
  });

  describe('join', () => {
    it('el primer jugador mueve CREATED → WAITING_PLAYERS', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(match.status).toBe(MatchStatus.WAITING_PLAYERS);
      expect(match.players).toEqual(['p1']);
    });

    it('al completar el cupo (2) la partida arranca (IN_PROGRESS)', () => {
      const match = Match.create('m1');
      match.join('p1');
      match.join('p2');
      expect(match.status).toBe(MatchStatus.IN_PROGRESS);
    });

    it('rechaza un tercer jugador (cupo lleno)', () => {
      const match = inProgress();
      expect(() => match.join('p3')).toThrow(MatchFullError);
    });

    it('rechaza al mismo jugador dos veces', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(() => match.join('p1')).toThrow(PlayerAlreadyJoinedError);
    });

    it('no se puede unir a una partida terminal', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(() => match.join('p1')).toThrow(InvalidTransitionError);
    });
  });

  describe('cancel', () => {
    it('cancela desde CREATED', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(match.status).toBe(MatchStatus.CANCELLED);
    });

    it('cancela desde IN_PROGRESS', () => {
      const match = inProgress();
      match.cancel();
      expect(match.status).toBe(MatchStatus.CANCELLED);
    });

    it('no se puede cancelar dos veces (CANCELLED es terminal)', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(() => match.cancel()).toThrow(InvalidTransitionError);
    });
  });

  describe('assertCanSubmitMove', () => {
    it('permite jugar cuando la partida está IN_PROGRESS', () => {
      const match = inProgress();
      expect(() => match.assertCanSubmitMove()).not.toThrow();
    });

    it('rechaza jugar si la partida aún espera jugadores', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(() => match.assertCanSubmitMove()).toThrow(MoveNotAllowedError);
    });
  });

  describe('playMove (piedra-papel-tijera)', () => {
    it('rechaza a un jugador que no pertenece a la partida', () => {
      const match = inProgress();
      expect(() => match.playMove('intruso', 1, Move.ROCK)).toThrow(PlayerNotInMatchError);
    });

    it('rechaza una jugada inválida', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', 1, 'LIZARD' as Move)).toThrow(InvalidMoveError);
    });

    it('rechaza una ronda futura', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', 2, Move.ROCK)).toThrow(InvalidRoundError);
    });

    it('registra una jugada sin resolver mientras falte el otro jugador', () => {
      const match = inProgress(3);
      const r = match.playMove('p1', 1, Move.ROCK);
      expect(r).toMatchObject({ accepted: true, roundResolved: false, roundNumber: 1 });
      expect(match.roundNumber).toBe(1);
    });

    it('es idempotente: repetir la jugada del mismo jugador no cuenta doble', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      const again = match.playMove('p1', 1, Move.PAPER); // ignorada
      expect(again.accepted).toBe(false);
      const r = match.playMove('p2', 1, Move.SCISSORS); // resuelve con el ROCK original de p1
      expect(r.roundResolved).toBe(true);
      expect(r.roundWinnerId).toBe('p1'); // rock vence scissors
    });

    it('resuelve la ronda: la jugada ganadora suma un punto', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      const r = match.playMove('p2', 1, Move.SCISSORS);
      expect(r).toMatchObject({ roundResolved: true, roundWinnerId: 'p1', finished: false });
      expect(match.scores).toEqual({ p1: 1 });
      expect(match.roundNumber).toBe(2);
    });

    it('empate (misma jugada) → ronda sin punto, pero avanza', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.PAPER);
      const r = match.playMove('p2', 1, Move.PAPER);
      expect(r).toMatchObject({ roundResolved: true, roundWinnerId: null });
      expect(match.scores).toEqual({});
      expect(match.roundNumber).toBe(2);
    });

    it('con pointsToWin=1 una ronda no empatada termina la partida', () => {
      const match = inProgress(1);
      match.playMove('p1', 1, Move.PAPER);
      const r = match.playMove('p2', 1, Move.ROCK); // paper vence rock
      expect(r).toMatchObject({ finished: true, winnerId: 'p1' });
      expect(match.status).toBe(MatchStatus.FINISHED);
      expect(match.winnerId).toBe('p1');
    });

    it('una jugada de ronda pasada es idempotente (accepted:false)', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      match.playMove('p2', 1, Move.SCISSORS); // ronda 1 resuelta, ahora ronda 2
      const stale = match.playMove('p1', 1, Move.PAPER);
      expect(stale.accepted).toBe(false);
      expect(match.roundNumber).toBe(2);
    });

    it('sobre una partida FINISHED es idempotente (no lanza, accepted:false)', () => {
      const match = inProgress(1);
      match.playMove('p1', 1, Move.PAPER);
      match.playMove('p2', 1, Move.ROCK); // FINISHED, ganó p1
      const retry = match.playMove('p1', 1, Move.PAPER);
      expect(retry).toMatchObject({ accepted: false, finished: true, winnerId: 'p1' });
      expect(match.status).toBe(MatchStatus.FINISHED);
    });

    it('rechaza un roundNumber no entero (defensa ante jobs no validados por el DTO)', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', NaN, Move.ROCK)).toThrow(InvalidRoundError);
    });
  });

  describe('snapshot', () => {
    it('serializa y reconstruye sin perder estado de juego', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);

      const restored = Match.rehydrate(match.toSnapshot());

      expect(restored.toSnapshot()).toEqual(match.toSnapshot());
    });
  });
});
