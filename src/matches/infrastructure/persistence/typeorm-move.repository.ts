import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MoveRecord, MoveRepository } from '../../application/ports/move-repository.port';
import { OptimisticLockError } from '../../domain/errors';
import { MoveOrmEntity } from './move.orm-entity';

/** Adaptador TypeORM/Postgres del puerto `MoveRepository`. */
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
        // TypeORM NO autosetea @VersionColumn en INSERT vía QueryBuilder (solo en save()),
        // y la columna es NOT NULL: hay que sembrar la versión inicial explícitamente.
        version: 1,
      })
      .orIgnore() // INSERT ... ON CONFLICT DO NOTHING
      .returning('id')
      .execute();
    // `raw` son las filas realmente devueltas por RETURNING: vacío ⇒ hubo conflicto
    // (no insertó). `identifiers` no es fiable con .orIgnore() (puede traer [{}]).
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
    // CAS optimista: TypeORM añade `version = version + 1` automáticamente al ser un
    // UpdateQueryBuilder con metadata; nosotros ponemos el `WHERE version = :expected`
    // y detectamos el conflicto por affected === 0 (rowCount en Postgres).
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
    // Guard `status: 'PENDING'`: si el move ya llegó a DONE (p.ej. un reintento
    // tardío tras un complete concurrente), no lo revertimos a FAILED.
    await this.dataSource
      .getRepository(MoveOrmEntity)
      .update({ matchId, clientMoveId, status: 'PENDING' }, { status: 'FAILED' });
  }
}
