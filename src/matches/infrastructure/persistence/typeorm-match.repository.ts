import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../../domain/match';
import { MatchRepository } from '../../application/ports/match-repository.port';
import { OptimisticLockError } from '../../domain/errors';
import { MatchOrmEntity } from './match.orm-entity';
import { MatchMapper } from './match.mapper';

/** TypeORM/Postgres adapter for the `MatchRepository` port. */
@Injectable()
export class TypeormMatchRepository implements MatchRepository {
  constructor(
    @InjectRepository(MatchOrmEntity)
    private readonly repo: Repository<MatchOrmEntity>,
  ) {}

  async save(match: Match): Promise<void> {
    const row = MatchMapper.toOrm(match);

    // version 0 → new match: INSERT with initial version 1.
    if (match.version === 0) {
      row.version = 1;
      await this.repo.insert(row);
      return;
    }

    // Existing match: optimistic CAS on version (no transaction). If another
    // worker wrote in between, `affected === 0` → conflict → the job retries.
    const res = await this.repo
      .createQueryBuilder()
      .update(MatchOrmEntity)
      .set({
        status: row.status,
        players: row.players,
        winnerId: row.winnerId,
        roundNumber: row.roundNumber,
        choices: row.choices,
        scores: row.scores,
        version: match.version + 1,
      })
      .where('id = :id AND version = :expected', { id: row.id, expected: match.version })
      .execute();

    if (res.affected === 0) {
      throw new OptimisticLockError(`match ${match.id}`, match.version);
    }
  }

  async findById(id: string): Promise<Match | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? MatchMapper.toDomain(row) : null;
  }
}
