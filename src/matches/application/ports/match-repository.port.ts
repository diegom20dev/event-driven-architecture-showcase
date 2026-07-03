import { Match } from '../../domain/match';

/** Injection token for the port (the implementation lives in infrastructure). */
export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

/**
 * Persistence port for the `Match` aggregate.
 * Domain/application layers depend on this interface, never on TypeORM.
 */
export interface MatchRepository {
  save(match: Match): Promise<void>;
  findById(id: string): Promise<Match | null>;
}
