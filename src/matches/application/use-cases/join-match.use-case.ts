import { Inject, Injectable } from '@nestjs/common';
import { Match } from '../../domain/match';
import { MatchStatus } from '../../domain/match-status';
import { MatchNotFoundError } from '../../domain/errors';
import { MATCH_REPOSITORY, MatchRepository } from '../ports/match-repository.port';
import { EVENT_PUBLISHER, EventPublisher } from '../ports/event-publisher.port';

@Injectable()
export class JoinMatchUseCase {
  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute(matchId: string, playerId: string): Promise<Match> {
    const match = await this.matches.findById(matchId);
    if (!match) {
      throw new MatchNotFoundError(matchId);
    }

    match.join(playerId);
    await this.matches.save(match);

    // Al completarse el cupo la partida arranca: solo emitimos el inicio.
    if (match.status === MatchStatus.IN_PROGRESS) {
      await this.events.publish({
        name: 'match.started',
        matchId: match.id,
        occurredAt: new Date(),
        payload: { players: match.players },
      });
    }

    return match;
  }
}
