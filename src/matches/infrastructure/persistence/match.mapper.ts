import { Match } from '../../domain/match';
import { MatchOrmEntity } from './match.orm-entity';

/** Translates between the domain aggregate and the persistence model. */
export const MatchMapper = {
  toDomain(row: MatchOrmEntity): Match {
    return Match.rehydrate({
      id: row.id,
      status: row.status,
      players: row.players ?? [],
      winnerId: row.winnerId ?? null,
      version: row.version,
      expectedPlayers: row.expectedPlayers,
      pointsToWin: row.pointsToWin,
      roundNumber: row.roundNumber ?? 1,
      choices: row.choices ?? {},
      scores: row.scores ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },

  toOrm(match: Match): MatchOrmEntity {
    const s = match.toSnapshot();
    const row = new MatchOrmEntity();
    row.id = s.id;
    row.status = s.status;
    row.players = s.players;
    row.winnerId = s.winnerId;
    row.version = s.version;
    row.expectedPlayers = s.expectedPlayers;
    row.pointsToWin = s.pointsToWin;
    row.roundNumber = s.roundNumber;
    row.choices = s.choices;
    row.scores = s.scores;
    row.createdAt = s.createdAt;
    row.updatedAt = s.updatedAt;
    return row;
  },
};
