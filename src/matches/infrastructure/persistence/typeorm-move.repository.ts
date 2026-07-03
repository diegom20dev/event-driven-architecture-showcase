import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MoveRecord, MoveRepository } from '../../application/ports/move-repository.port';
import { OptimisticLockError } from '../../domain/errors';
import { MoveOrmEntity } from './move.orm-entity';

/** TypeORM/Postgres adapter for the `MoveRepository` port. */
@Injectable()
export class TypeormMoveRepository implements MoveRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByKey(matchId: string, clientMoveId: string): Promise<MoveRecord | null> {
    const row = await this.dataSource
      .getRepository(MoveOrmEntity)
      .findOne({ where: { matchId, clientMoveId } });
    return row ? { status: row.status, result: row.result, version: row.version } : null;
  }

  async insertPending(input: {
    matchId: string;
    clientMoveId: string;
    payload: Record<string, unknown>;
  }): Promise<{ inserted: boolean }> {
    const res = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(MoveOrmEntity)
      .values({
        matchId: input.matchId,
        clientMoveId: input.clientMoveId,
        payload: input.payload,
        status: 'PENDING',
        result: null,
        // TypeORM does NOT auto-set @VersionColumn on INSERT via QueryBuilder (only on save()),
        // and the column is NOT NULL: we must seed the initial version explicitly.
        version: 1,
      })
      .orIgnore() // INSERT ... ON CONFLICT DO NOTHING
      .returning('id')
      .execute();
    // `raw` contains the rows actually returned by RETURNING: empty → conflict (no insert).
    // `identifiers` is unreliable with .orIgnore() (may return [{}]).
    return { inserted: Array.isArray(res.raw) && res.raw.length > 0 };
  }

  async complete(
    input: {
      matchId: string;
      clientMoveId: string;
      result: Record<string, unknown>;
    },
    expectedVersion: number,
  ): Promise<void> {
    // Optimistic CAS: TypeORM automatically adds `version = version + 1` for
    // UpdateQueryBuilder with entity metadata; we add `WHERE version = :expected`
    // and detect conflicts via affected === 0 (rowCount in Postgres).
    const res = await this.dataSource
      .createQueryBuilder()
      .update(MoveOrmEntity)
      .set({ status: 'DONE', result: input.result })
      .where(
        'match_id = :matchId AND client_move_id = :clientMoveId AND version = :expectedVersion',
        {
          matchId: input.matchId,
          clientMoveId: input.clientMoveId,
          expectedVersion,
        },
      )
      .execute();

    if (res.affected === 0) {
      throw new OptimisticLockError(
        `move ${input.clientMoveId} of match ${input.matchId}`,
        expectedVersion,
      );
    }
  }

  async markFailed(matchId: string, clientMoveId: string): Promise<void> {
    // Guard `status: 'PENDING'`: if the move already reached DONE (e.g. a late retry
    // after a concurrent complete), do not revert it to FAILED.
    await this.dataSource
      .getRepository(MoveOrmEntity)
      .update({ matchId, clientMoveId, status: 'PENDING' }, { status: 'FAILED' });
  }
}
