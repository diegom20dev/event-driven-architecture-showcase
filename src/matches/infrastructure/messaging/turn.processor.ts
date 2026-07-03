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
 * BullMQ worker. Concurrency 5.
 * lockDuration controls the Redis lock TTL per job; increasing it prevents the
 * "could not renew lock" error when debugging with breakpoints (the event loop
 * freezes and BullMQ cannot renew the lock before Redis expires it).
 * The default of 30 s is correct for production; set BULLMQ_LOCK_MS to override when debugging.
 */
@Processor(TURNS_QUEUE, {
  concurrency: 5,
  lockDuration: Number(process.env.BULLMQ_LOCK_MS ?? 30_000),
})
export class TurnProcessor extends WorkerHost {
  private readonly logger = new Logger('TurnProcessor');

  constructor(
    private readonly processTurn: ProcessTurnUseCase,
    // The processor is infrastructure and may touch the port directly for the FAILED
    // terminal state (this concerns the worker lifecycle, not the domain).
    @Inject(MOVE_REPOSITORY) private readonly moves: MoveRepository,
  ) {
    super();
  }

  async process(job: Job<ProcessTurnCommand>): Promise<void> {
    await this.processTurn.execute(job.data);
  }

  /**
   * BullMQ emits 'failed' on EVERY failed attempt. We only close the move as FAILED
   * when retries are exhausted (attemptsMade >= attempts); while retries remain we
   * leave it PENDING so the worker can try again.
   * Without this, a crashing turn stays PENDING forever and the client polling never
   * sees a terminal state.
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
        `attempt=${job.attemptsMade}/${attempts}${exhausted ? ' (exhausted → FAILED)' : ' (will retry)'}: ${err.message}`,
    );
    if (!exhausted) {
      return;
    }
    // markFailed only transitions PENDING → FAILED (does not overwrite a DONE move).
    await this.moves.markFailed(job.data.matchId, job.data.clientMoveId);
  }
}
