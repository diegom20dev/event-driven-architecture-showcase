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

/** IN_PROGRESS match with 2 players joined (p1, p2). */
const inProgress = (pointsToWin = 1) => {
  const m = Match.create('m1', 2, pointsToWin);
  m.join('p1');
  m.join('p2');
  return m;
};

describe('Match (state machine)', () => {
  it('starts in CREATED with no players', () => {
    const match = Match.create('m1');
    expect(match.status).toBe(MatchStatus.CREATED);
    expect(match.players).toHaveLength(0);
    expect(match.roundNumber).toBe(1);
  });

  describe('create', () => {
    it('rejects a player count other than 2', () => {
      expect(() => Match.create('m1', 3)).toThrow(RangeError);
      expect(() => Match.create('m1', 1)).toThrow(RangeError);
    });

    it('rejects pointsToWin < 1', () => {
      expect(() => Match.create('m1', 2, 0)).toThrow(RangeError);
    });
  });

  describe('join', () => {
    it('first player moves CREATED → WAITING_PLAYERS', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(match.status).toBe(MatchStatus.WAITING_PLAYERS);
      expect(match.players).toEqual(['p1']);
    });

    it('filling the roster (2) starts the match (IN_PROGRESS)', () => {
      const match = Match.create('m1');
      match.join('p1');
      match.join('p2');
      expect(match.status).toBe(MatchStatus.IN_PROGRESS);
    });

    it('rejects a third player (roster full)', () => {
      const match = inProgress();
      expect(() => match.join('p3')).toThrow(MatchFullError);
    });

    it('rejects the same player joining twice', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(() => match.join('p1')).toThrow(PlayerAlreadyJoinedError);
    });

    it('cannot join a terminal match', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(() => match.join('p1')).toThrow(InvalidTransitionError);
    });
  });

  describe('cancel', () => {
    it('cancels from CREATED', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(match.status).toBe(MatchStatus.CANCELLED);
    });

    it('cancels from IN_PROGRESS', () => {
      const match = inProgress();
      match.cancel();
      expect(match.status).toBe(MatchStatus.CANCELLED);
    });

    it('cannot cancel twice (CANCELLED is terminal)', () => {
      const match = Match.create('m1');
      match.cancel();
      expect(() => match.cancel()).toThrow(InvalidTransitionError);
    });
  });

  describe('assertCanSubmitMove', () => {
    it('allows a move when the match is IN_PROGRESS', () => {
      const match = inProgress();
      expect(() => match.assertCanSubmitMove()).not.toThrow();
    });

    it('rejects a move when the match is still waiting for players', () => {
      const match = Match.create('m1');
      match.join('p1');
      expect(() => match.assertCanSubmitMove()).toThrow(MoveNotAllowedError);
    });
  });

  describe('playMove (rock-paper-scissors)', () => {
    it('rejects a player not in the match', () => {
      const match = inProgress();
      expect(() => match.playMove('outsider', 1, Move.ROCK)).toThrow(PlayerNotInMatchError);
    });

    it('rejects an invalid move value', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', 1, 'LIZARD' as Move)).toThrow(InvalidMoveError);
    });

    it('rejects a future round', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', 2, Move.ROCK)).toThrow(InvalidRoundError);
    });

    it('records a move without resolving while waiting for the other player', () => {
      const match = inProgress(3);
      const r = match.playMove('p1', 1, Move.ROCK);
      expect(r).toMatchObject({ accepted: true, roundResolved: false, roundNumber: 1 });
      expect(match.roundNumber).toBe(1);
    });

    it('is idempotent: repeating the same player move does not double-count', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      const again = match.playMove('p1', 1, Move.PAPER); // ignored
      expect(again.accepted).toBe(false);
      const r = match.playMove('p2', 1, Move.SCISSORS); // resolves with p1's original ROCK
      expect(r.roundResolved).toBe(true);
      expect(r.roundWinnerId).toBe('p1'); // rock beats scissors
    });

    it('resolves the round: winning move earns a point', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      const r = match.playMove('p2', 1, Move.SCISSORS);
      expect(r).toMatchObject({ roundResolved: true, roundWinnerId: 'p1', finished: false });
      expect(match.scores).toEqual({ p1: 1 });
      expect(match.roundNumber).toBe(2);
    });

    it('tie (same move) → round scores no point but advances', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.PAPER);
      const r = match.playMove('p2', 1, Move.PAPER);
      expect(r).toMatchObject({ roundResolved: true, roundWinnerId: null });
      expect(match.scores).toEqual({});
      expect(match.roundNumber).toBe(2);
    });

    it('with pointsToWin=1 a non-tied round ends the match', () => {
      const match = inProgress(1);
      match.playMove('p1', 1, Move.PAPER);
      const r = match.playMove('p2', 1, Move.ROCK); // paper beats rock
      expect(r).toMatchObject({ finished: true, winnerId: 'p1' });
      expect(match.status).toBe(MatchStatus.FINISHED);
      expect(match.winnerId).toBe('p1');
    });

    it('a stale-round move is idempotent (accepted:false)', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);
      match.playMove('p2', 1, Move.SCISSORS); // round 1 resolved, now round 2
      const stale = match.playMove('p1', 1, Move.PAPER);
      expect(stale.accepted).toBe(false);
      expect(match.roundNumber).toBe(2);
    });

    it('on a FINISHED match is idempotent (does not throw, accepted:false)', () => {
      const match = inProgress(1);
      match.playMove('p1', 1, Move.PAPER);
      match.playMove('p2', 1, Move.ROCK); // FINISHED, p1 won
      const retry = match.playMove('p1', 1, Move.PAPER);
      expect(retry).toMatchObject({ accepted: false, finished: true, winnerId: 'p1' });
      expect(match.status).toBe(MatchStatus.FINISHED);
    });

    it('rejects a non-integer roundNumber (guard against unvalidated job payloads)', () => {
      const match = inProgress();
      expect(() => match.playMove('p1', NaN, Move.ROCK)).toThrow(InvalidRoundError);
    });
  });

  describe('snapshot', () => {
    it('serialises and rehydrates without losing game state', () => {
      const match = inProgress(3);
      match.playMove('p1', 1, Move.ROCK);

      const restored = Match.rehydrate(match.toSnapshot());

      expect(restored.toSnapshot()).toEqual(match.toSnapshot());
    });
  });
});
