import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Move } from '../../../domain/rps';

/** Rock-Paper-Scissors move payload: round number + throw. */
export class MovePayloadDto {
  @ApiProperty({ minimum: 1, example: 1, description: 'Round this move belongs to.' })
  @IsInt()
  @Min(1)
  round: number;

  @ApiProperty({ enum: Move, example: Move.ROCK, description: 'RPS throw.' })
  @IsEnum(Move)
  move: Move;
}

export class SubmitMoveDto {
  @ApiProperty({ example: 'player-1', description: 'Player submitting the move.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  playerId: string;

  @ApiProperty({
    example: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e',
    description: 'Client-generated UUID. Guarantees idempotency on retries.',
  })
  @IsUUID()
  clientMoveId: string;

  @ApiProperty({ type: MovePayloadDto, description: 'Move payload: round and throw.' })
  @ValidateNested()
  @IsNotEmpty()
  @Type(() => MovePayloadDto)
  payload: MovePayloadDto;
}
