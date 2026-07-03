/**
 * Estados de una partida y las transiciones válidas entre ellos.
 *
 * Regla de oro (ver README): la máquina de estados vive en el dominio.
 * Ni el controller ni el repositorio deciden transiciones; solo el dominio.
 */
export enum MatchStatus {
  CREATED = 'CREATED',
  WAITING_PLAYERS = 'WAITING_PLAYERS',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

/**
 * Grafo de transiciones permitidas.
 *
 *   CREATED ──► WAITING_PLAYERS ──► IN_PROGRESS ──► FINISHED
 *      └───────────────┴──────── cancel ──────┴──► CANCELLED
 *
 * FINISHED y CANCELLED son terminales (sin salidas).
 */
export const MATCH_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  [MatchStatus.CREATED]: [MatchStatus.WAITING_PLAYERS, MatchStatus.CANCELLED],
  [MatchStatus.WAITING_PLAYERS]: [MatchStatus.IN_PROGRESS, MatchStatus.CANCELLED],
  [MatchStatus.IN_PROGRESS]: [MatchStatus.FINISHED, MatchStatus.CANCELLED],
  [MatchStatus.FINISHED]: [],
  [MatchStatus.CANCELLED]: [],
};

export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return MATCH_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: MatchStatus): boolean {
  return MATCH_TRANSITIONS[status].length === 0;
}
