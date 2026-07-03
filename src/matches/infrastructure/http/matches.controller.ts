import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Res,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { MatchEventsHub } from '../messaging/match-events.hub';
import { CreateMatchUseCase } from '../../application/use-cases/create-match.use-case';
import { JoinMatchUseCase } from '../../application/use-cases/join-match.use-case';
import { GetMatchUseCase } from '../../application/use-cases/get-match.use-case';
import { SubmitMoveUseCase } from '../../application/use-cases/submit-move.use-case';
import { GetMoveUseCase } from '../../application/use-cases/get-move.use-case';
import { CreateMatchDto } from './dto/create-match.dto';
import { JoinMatchDto } from './dto/join-match.dto';
import { SubmitMoveDto } from './dto/submit-move.dto';
import { MatchResponseDto, SubmitMoveResponseDto } from './dto/match-response.dto';
import { MoveStatusResponseDto } from './dto/move-status-response.dto';

/**
 * HTTP input adapter. Intentionally thin: translates request → use case
 * and domain → DTO. No business logic lives here.
 */
@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(
    private readonly createMatch: CreateMatchUseCase,
    private readonly joinMatch: JoinMatchUseCase,
    private readonly getMatch: GetMatchUseCase,
    private readonly submitMove: SubmitMoveUseCase,
    private readonly getMoveUc: GetMoveUseCase,
    private readonly eventsHub: MatchEventsHub,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a match (initial state: CREATED)' })
  @ApiResponse({ status: 201, type: MatchResponseDto })
  async create(@Body() dto: CreateMatchDto): Promise<MatchResponseDto> {
    const match = await this.createMatch.execute(dto.pointsToWin);
    return MatchResponseDto.fromDomain(match);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a match' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: MatchResponseDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 409, description: 'Roster full / duplicate player / invalid state' })
  async join(@Param('id') id: string, @Body() dto: JoinMatchDto): Promise<MatchResponseDto> {
    const match = await this.joinMatch.execute(id, dto.playerId);
    return MatchResponseDto.fromDomain(match);
  }

  @Post(':id/moves')
  @ApiOperation({
    summary: 'Submit a move (async, idempotent via clientMoveId)',
    description:
      'Enqueues the move and responds 202 PENDING. A retry that was already processed returns 200 DONE. ' +
      'Poll the result with GET /matches/:id/moves/:clientMoveId.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 202, type: SubmitMoveResponseDto, description: 'Enqueued (PENDING)' })
  @ApiResponse({ status: 200, type: SubmitMoveResponseDto, description: 'Already processed (DONE)' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiResponse({ status: 409, description: 'Match is not IN_PROGRESS' })
  async move(
    @Param('id') id: string,
    @Body() dto: SubmitMoveDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SubmitMoveResponseDto> {
    const out = await this.submitMove.execute({
      matchId: id,
      playerId: dto.playerId,
      clientMoveId: dto.clientMoveId,
      payload: { round: dto.payload.round, move: dto.payload.move },
    });
    res.status(out.status === 'DONE' ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return out;
  }

  @Get(':id/moves/:clientMoveId')
  @ApiOperation({ summary: 'Poll the status/result of a move' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'clientMoveId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MoveStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Move not found' })
  async getMove(
    @Param('id') id: string,
    @Param('clientMoveId') clientMoveId: string,
  ): Promise<MoveStatusResponseDto> {
    return this.getMoveUc.execute(id, clientMoveId);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Real-time match event stream (SSE)',
    description:
      'Server-Sent Events: emits match.started, match.move_applied and match.finished ' +
      'for this match. Avoids polling GET /matches/:id.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.eventsHub.stream(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get match state' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: MatchResponseDto })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async findOne(@Param('id') id: string): Promise<MatchResponseDto> {
    const match = await this.getMatch.execute(id);
    return MatchResponseDto.fromDomain(match);
  }
}
