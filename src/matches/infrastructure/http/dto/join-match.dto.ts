import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class JoinMatchDto {
  @ApiProperty({ example: 'player-1', description: 'ID of the player joining the match.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  playerId: string;
}
