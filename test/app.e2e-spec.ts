import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DomainExceptionFilter } from './../src/matches/infrastructure/http/domain-exception.filter';

/**
 * E2E del ciclo de vida de una partida contra Postgres real.
 * Requiere DB (CI levanta un servicio postgres; en local: `docker compose up postgres -d`).
 */
describe('Match Engine (e2e)', () => {
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

  it('GET /health responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('recorre el ciclo CREATED → WAITING_PLAYERS → IN_PROGRESS', async () => {
    const created = await request(app.getHttpServer()).post('/matches').expect(201);
    const id = created.body.id;
    expect(created.body.status).toBe('CREATED');

    const afterP1 = await request(app.getHttpServer())
      .post(`/matches/${id}/join`)
      .send({ playerId: 'player-1' })
      .expect(200);
    expect(afterP1.body.status).toBe('WAITING_PLAYERS');

    const afterP2 = await request(app.getHttpServer())
      .post(`/matches/${id}/join`)
      .send({ playerId: 'player-2' })
      .expect(200);
    expect(afterP2.body.status).toBe('IN_PROGRESS');

    const fetched = await request(app.getHttpServer()).get(`/matches/${id}`).expect(200);
    expect(fetched.body.players).toEqual(['player-1', 'player-2']);
  });

  it('rechaza un tercer jugador con 409', async () => {
    const { body } = await request(app.getHttpServer()).post('/matches').expect(201);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'a' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'b' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'c' })
      .expect(409);
  });

  it('encola una jugada (202 PENDING) solo si la partida está IN_PROGRESS', async () => {
    const { body } = await request(app.getHttpServer()).post('/matches').expect(201);

    // Aún sin jugadores → 409
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/moves`)
      .send({ playerId: 'a', clientMoveId: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e', payload: { round: 1, move: 'ROCK' } })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'a' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/matches/${body.id}/join`)
      .send({ playerId: 'b' })
      .expect(200);

    const move = await request(app.getHttpServer())
      .post(`/matches/${body.id}/moves`)
      .send({ playerId: 'a', clientMoveId: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e', payload: { round: 1, move: 'ROCK' } })
      .expect(202);
    expect(move.body.status).toBe('PENDING');
  });

  it('GET de una partida inexistente devuelve 404', async () => {
    await request(app.getHttpServer())
      .get('/matches/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});
