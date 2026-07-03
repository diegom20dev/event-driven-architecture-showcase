import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateMatchDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    example: 1,
    description: 'Puntos necesarios para ganar (default 1 → "una mano decide").',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pointsToWin?: number;
}
