import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Match } from '../../domain/match';
import { MATCH_REPOSITORY, MatchRepository } from '../ports/match-repository.port';

@Injectable()
export class CreateMatchUseCase {
  constructor(@Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository) {}

  async execute(pointsToWin?: number): Promise<Match> {
    // RPS: cupo fijo de 2 jugadores.
    const match = Match.create(randomUUID(), 2, pointsToWin);
    await this.matches.save(match);
    return match;
  }
}
