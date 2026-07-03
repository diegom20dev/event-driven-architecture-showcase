import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DomainExceptionFilter } from './../src/matches/infrastructure/http/domain-exception.filter';

describe('Moves async + idempotency (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const startMatch = async () => {
    const { body } = await request(app.getHttpServer()).post('/matches').expect(201);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'a' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'b' })
      .expect(200);
    return body.id as string;
  };

  const pollDone = async (id: string, clientMoveId: string, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      const res = await request(app.getHttpServer())
        .get(`/matches/${id}/moves/${clientMoveId}`)
        .expect(200);
      if (res.body.status === 'DONE') return res.body;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('move no llegó a DONE');
  };

  it('POST encola (202 PENDING) y el worker lo deja en DONE', async () => {
    const id = await startMatch();
    const move = {
      playerId: 'a',
      clientMoveId: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e',
      payload: { round: 1, move: 'ROCK' },
    };

    const accepted = await request(app.getHttpServer())
      .post(`/matches/${id}/moves`)
      .send(move)
      .expect(202);
    expect(accepted.body.status).toBe('PENDING');
    expect(accepted.body.deduplicated).toBe(false);

    const done = await pollDone(id, move.clientMoveId);
    expect(done.result.accepted).toBe(true);
  });

  it('reintento concurrente: una sola inserción nueva, ambos 202', async () => {
    const id = await startMatch();
    const move = {
      playerId: 'a',
      clientMoveId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      payload: { round: 1, move: 'SCISSORS' },
    };

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/matches/${id}/moves`).send(move),
      request(app.getHttpServer()).post(`/matches/${id}/moves`).send(move),
    ]);

    expect([r1.status, r2.status]).toEqual([202, 202]);
    const dedup = [r1.body.deduplicated, r2.body.deduplicated].sort();
    expect(dedup).toEqual([false, true]);

    await pollDone(id, move.clientMoveId);
  });
});
