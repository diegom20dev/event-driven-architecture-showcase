import { ApiProperty } from '@nestjs/swagger';

/** Respuesta de `GET /matches/:id/moves/:clientMoveId` (polling). */
export class MoveStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  matchId: string;

  @ApiProperty({ format: 'uuid' })
  clientMoveId: string;

  @ApiProperty({ enum: ['PENDING', 'DONE', 'FAILED'], example: 'DONE' })
  status: 'PENDING' | 'DONE' | 'FAILED';

  @ApiProperty({ nullable: true })
  result: Record<string, unknown> | null;
}
