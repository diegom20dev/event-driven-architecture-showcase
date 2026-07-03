import { Match } from '../../domain/match';

/** Token de inyección para el puerto (la implementación vive en infrastructure). */
export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

/**
 * Puerto de persistencia del agregado `Match`.
 * El dominio/aplicación dependen de esta interfaz, nunca de TypeORM.
 */
export interface MatchRepository {
  save(match: Match): Promise<void>;
  findById(id: string): Promise<Match | null>;
}
