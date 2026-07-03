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

/** Jugada de piedra-papel-tijera: ronda + tirada. */
export class MovePayloadDto {
  @ApiProperty({ minimum: 1, example: 1, description: 'Ronda a la que corresponde la jugada.' })
  @IsInt()
  @Min(1)
  round: number;

  @ApiProperty({ enum: Move, example: Move.ROCK, description: 'Jugada RPS.' })
  @IsEnum(Move)
  move: Move;
}

export class SubmitMoveDto {
  @ApiProperty({ example: 'player-1', description: 'Jugador que envía la jugada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  playerId: string;

  @ApiProperty({
    example: '7f3d2a1c-9b4e-4c2a-8f1d-2b6e9a0c1d3e',
    description: 'UUID generado por el cliente. Garantiza idempotencia ante reintentos.',
  })
  @IsUUID()
  clientMoveId: string;

  @ApiProperty({ type: MovePayloadDto, description: 'Jugada: ronda y carta.' })
  @ValidateNested()
  @IsNotEmpty()
  @Type(() => MovePayloadDto)
  payload: MovePayloadDto;
}
