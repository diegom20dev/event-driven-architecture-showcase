import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { MatchesController } from './infrastructure/http/matches.controller';
import { MatchOrmEntity } from './infrastructure/persistence/match.orm-entity';
import { MoveOrmEntity } from './infrastructure/persistence/move.orm-entity';
import { TypeormMatchRepository } from './infrastructure/persistence/typeorm-match.repository';
import { TypeormMoveRepository } from './infrastructure/persistence/typeorm-move.repository';
import { BullmqEventPublisher } from './infrastructure/messaging/bullmq-event-publisher';
import { MatchEventsHub } from './infrastructure/messaging/match-events.hub';
import { TurnProcessor } from './infrastructure/messaging/turn.processor';
import { TURNS_QUEUE } from './infrastructure/messaging/queue.constants';
import { MATCH_REPOSITORY } from './application/ports/match-repository.port';
import { MOVE_REPOSITORY } from './application/ports/move-repository.port';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';
import { CreateMatchUseCase } from './application/use-cases/create-match.use-case';
import { JoinMatchUseCase } from './application/use-cases/join-match.use-case';
import { GetMatchUseCase } from './application/use-cases/get-match.use-case';
import { SubmitMoveUseCase } from './application/use-cases/submit-move.use-case';
import { ProcessTurnUseCase } from './application/use-cases/process-turn.use-case';
import { GetMoveUseCase } from './application/use-cases/get-move.use-case';

/**
 * Composición del hexágono: aquí (y solo aquí) se atan los puertos a sus
 * adaptadores concretos. Cambiar de Postgres/Redis a otra tecnología se hace
 * sustituyendo el `useClass`, sin tocar dominio ni aplicación.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MatchOrmEntity, MoveOrmEntity]),
    BullModule.registerQueue({ name: TURNS_QUEUE }),
  ],
  controllers: [MatchesController],
  providers: [
    CreateMatchUseCase,
    JoinMatchUseCase,
    GetMatchUseCase,
    SubmitMoveUseCase,
    ProcessTurnUseCase,
    GetMoveUseCase,
    TurnProcessor,
    MatchEventsHub,
    { provide: MATCH_REPOSITORY, useClass: TypeormMatchRepository },
    { provide: MOVE_REPOSITORY, useClass: TypeormMoveRepository },
    // Adaptador BullMQ: publica eventos a la cola 'turns' (reemplaza al LoggingEventPublisher).
    { provide: EVENT_PUBLISHER, useClass: BullmqEventPublisher },
  ],
})
export class MatchesModule {}
