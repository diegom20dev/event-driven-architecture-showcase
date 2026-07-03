import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class JoinMatchDto {
  @ApiProperty({ example: 'player-1', description: 'Identificador del jugador que se une' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  playerId: string;
}
