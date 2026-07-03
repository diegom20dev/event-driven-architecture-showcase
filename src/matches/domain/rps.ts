/** Rock-Paper-Scissors move. String enum for readability in jsonb columns and SSE events. */
export enum Move {
  ROCK = 'ROCK',
  PAPER = 'PAPER',
  SCISSORS = 'SCISSORS',
}

/** What each move beats (rock crushes scissors, scissors cuts paper, paper covers rock). */
const BEATS: Record<Move, Move> = {
  [Move.ROCK]: Move.SCISSORS,
  [Move.PAPER]: Move.ROCK,
  [Move.SCISSORS]: Move.PAPER,
};

/** Resolves two moves: 'A' wins when `a` beats `b`, 'B' when `b` wins, 'TIE' on draw. */
export function resolveRps(a: Move, b: Move): 'A' | 'B' | 'TIE' {
  if (a === b) return 'TIE';
  return BEATS[a] === b ? 'A' : 'B';
}

/** Type guard: the domain does not trust the DTO (turns are dequeued by the worker). */
export function isMove(v: unknown): v is Move {
  return typeof v === 'string' && (Object.values(Move) as string[]).includes(v);
}
