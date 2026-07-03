import { Move, resolveRps, isMove } from './rps';

describe('resolveRps', () => {
  it('rock beats scissors (both orders)', () => {
    expect(resolveRps(Move.ROCK, Move.SCISSORS)).toBe('A');
    expect(resolveRps(Move.SCISSORS, Move.ROCK)).toBe('B');
  });

  it('scissors beats paper', () => {
    expect(resolveRps(Move.SCISSORS, Move.PAPER)).toBe('A');
    expect(resolveRps(Move.PAPER, Move.SCISSORS)).toBe('B');
  });

  it('paper beats rock', () => {
    expect(resolveRps(Move.PAPER, Move.ROCK)).toBe('A');
    expect(resolveRps(Move.ROCK, Move.PAPER)).toBe('B');
  });

  it('same move → tie', () => {
    expect(resolveRps(Move.ROCK, Move.ROCK)).toBe('TIE');
    expect(resolveRps(Move.PAPER, Move.PAPER)).toBe('TIE');
    expect(resolveRps(Move.SCISSORS, Move.SCISSORS)).toBe('TIE');
  });
});

describe('isMove', () => {
  it('accepts all three valid values', () => {
    expect(isMove('ROCK')).toBe(true);
    expect(isMove('PAPER')).toBe(true);
    expect(isMove('SCISSORS')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isMove('LIZARD')).toBe(false);
    expect(isMove('rock')).toBe(false);
    expect(isMove(5)).toBe(false);
    expect(isMove(undefined)).toBe(false);
    expect(isMove(null)).toBe(false);
  });
});
