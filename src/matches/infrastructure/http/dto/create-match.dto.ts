import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateMatchDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    example: 1,
    description: 'Points needed to win (default 1 → "one round decides").',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pointsToWin?: number;
}
