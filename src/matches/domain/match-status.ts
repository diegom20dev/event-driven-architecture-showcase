/**
 * Match states and the valid transitions between them.
 *
 * The state machine lives in the domain. Neither the controller nor the repository
 * decides transitions — only the domain does.
 */
export enum MatchStatus {
  CREATED = 'CREATED',
  WAITING_PLAYERS = 'WAITING_PLAYERS',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
}

/**
 * Allowed transition graph.
 *
 *   CREATED ──► WAITING_PLAYERS ──► IN_PROGRESS ──► FINISHED
 *      └───────────────┴──────── cancel ──────┴──► CANCELLED
 *
 * FINISHED and CANCELLED are terminal (no outgoing transitions).
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
