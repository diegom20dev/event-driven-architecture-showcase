/** Jugada de piedra-papel-tijera. String enum por legibilidad en jsonb/eventos SSE. */
export enum Move {
  ROCK = 'ROCK',
  PAPER = 'PAPER',
  SCISSORS = 'SCISSORS',
}

/** Qué vence cada jugada (rock aplasta scissors, scissors corta paper, paper cubre rock). */
const BEATS: Record<Move, Move> = {
  [Move.ROCK]: Move.SCISSORS,
  [Move.PAPER]: Move.ROCK,
  [Move.SCISSORS]: Move.PAPER,
};

/** Resuelve dos jugadas: 'A' gana `a`, 'B' gana `b`, 'TIE' empate. */
export function resolveRps(a: Move, b: Move): 'A' | 'B' | 'TIE' {
  if (a === b) return 'TIE';
  return BEATS[a] === b ? 'A' : 'B';
}

/** Type guard: el dominio no confía en el DTO (los turnos se desencolan por el worker). */
export function isMove(v: unknown): v is Move {
  return typeof v === 'string' && (Object.values(Move) as string[]).includes(v);
}
