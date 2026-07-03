import { Inject, Injectable } from '@nestjs/common';
import { Match } from '../../domain/match';
import { MatchNotFoundError } from '../../domain/errors';
import { MATCH_REPOSITORY, MatchRepository } from '../ports/match-repository.port';

@Injectable()
export class GetMatchUseCase {
  constructor(@Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository) {}

  async execute(matchId: string): Promise<Match> {
    const match = await this.matches.findById(matchId);
    if (!match) {
      throw new MatchNotFoundError(matchId);
    }
    return match;
  }
}
