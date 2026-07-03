import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  ProcessTurnCommand,
  ProcessTurnUseCase,
} from '../../application/use-cases/process-turn.use-case';
import { MOVE_REPOSITORY, MoveRepository } from '../../application/ports/move-repository.port';
import { TURNS_QUEUE } from './queue.constants';

/**
 * Worker BullMQ. Concurrency 5.
 * lockDuration controla el TTL del lock Redis por job; subirlo evita el error
 * "could not renew lock" al depurar con breakpoints (el event loop se congela y
 * BullMQ no puede renovar el lock antes de que Redis lo expire).
 * En producción el default de 30 s es correcto; para debug sube BULLMQ_LOCK_MS.
 */
@Processor(TURNS_QUEUE, {
  concurrency: 5,
  lockDuration: Number(process.env.BULLMQ_LOCK_MS ?? 30_000),
})
export class TurnProcessor extends WorkerHost {
  private readonly logger = new Logger('TurnProcessor');

  constructor(
    private readonly processTurn: ProcessTurnUseCase,
    // El processor es infraestructura: puede tocar el puerto directamente para
    // el estado terminal FAILED (concierne al ciclo de vida del worker, no al dominio).
    @Inject(MOVE_REPOSITORY) private readonly moves: MoveRepository,
  ) {
    super();
  }

  async process(job: Job<ProcessTurnCommand>): Promise<void> {
    await this.processTurn.execute(job.data);
  }

  /**
   * BullMQ emite 'failed' en CADA intento fallido. Solo cerramos el move a FAILED
   * cuando se agotan los reintentos (attemptsMade >= attempts); mientras haya
   * reintentos pendientes lo dejamos PENDING para que el worker vuelva a intentar.
   * Sin esto, un turno que revienta se queda PENDING para siempre y el polling
   * del cliente nunca ve un estado terminal.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessTurnCommand> | undefined, err: Error): Promise<void> {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;
    this.logger.warn(
      `turn failed match=${job.data.matchId} move=${job.data.clientMoveId} ` +
        `attempt=${job.attemptsMade}/${attempts}${exhausted ? ' (agotado → FAILED)' : ' (reintentará)'}: ${err.message}`,
    );
    if (!exhausted) {
      return;
    }
    // markFailed solo transiciona PENDING → FAILED (no pisa un move ya DONE).
    await this.moves.markFailed(job.data.matchId, job.data.clientMoveId);
  }
}
