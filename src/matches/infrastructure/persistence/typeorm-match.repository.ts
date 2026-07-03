import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../../domain/match';
import { MatchRepository } from '../../application/ports/match-repository.port';
import { OptimisticLockError } from '../../domain/errors';
import { MatchOrmEntity } from './match.orm-entity';
import { MatchMapper } from './match.mapper';

/** Adaptador TypeORM/Postgres del puerto `MatchRepository`. */
@Injectable()
export class TypeormMatchRepository implements MatchRepository {
  constructor(
    @InjectRepository(MatchOrmEntity)
    private readonly repo: Repository<MatchOrmEntity>,
  ) {}

  async save(match: Match): Promise<void> {
    const row = MatchMapper.toOrm(match);

    // version 0 ⇒ partida nueva: INSERT con version inicial 1.
    if (match.version === 0) {
      row.version = 1;
      await this.repo.insert(row);
      return;
    }

    // Partida existente: CAS optimista por version (sin transacción). Si otro
    // worker escribió entremedio, `affected === 0` → conflicto → el job reintenta.
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
