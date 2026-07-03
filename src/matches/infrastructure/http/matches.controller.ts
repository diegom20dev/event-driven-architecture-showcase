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
 * Adaptador HTTP de entrada. Es delgado por diseño: traduce request → caso de uso
 * y dominio → DTO. Ninguna regla de negocio vive aquí.
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
  @ApiOperation({ summary: 'Crear una partida (estado inicial CREATED)' })
  @ApiResponse({ status: 201, type: MatchResponseDto })
  async create(@Body() dto: CreateMatchDto): Promise<MatchResponseDto> {
    const match = await this.createMatch.execute(dto.pointsToWin);
    return MatchResponseDto.fromDomain(match);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unirse a una partida' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: MatchResponseDto })
  @ApiResponse({ status: 404, description: 'La partida no existe' })
  @ApiResponse({ status: 409, description: 'Cupo lleno / jugador repetido / estado inválido' })
  async join(@Param('id') id: string, @Body() dto: JoinMatchDto): Promise<MatchResponseDto> {
    const match = await this.joinMatch.execute(id, dto.playerId);
    return MatchResponseDto.fromDomain(match);
  }

  @Post(':id/moves')
  @ApiOperation({
    summary: 'Enviar una jugada (asíncrona, idempotente vía clientMoveId)',
    description:
      'Encola la jugada y responde 202 PENDING. Un reintento ya procesado devuelve 200 DONE. Consulta el resultado con GET /matches/:id/moves/:clientMoveId.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 202, type: SubmitMoveResponseDto, description: 'Encolada (PENDING)' })
  @ApiResponse({ status: 200, type: SubmitMoveResponseDto, description: 'Ya procesada (DONE)' })
  @ApiResponse({ status: 404, description: 'La partida no existe' })
  @ApiResponse({ status: 409, description: 'La partida no está IN_PROGRESS' })
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
  @ApiOperation({ summary: 'Consultar el estado/result de una jugada (polling)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'clientMoveId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MoveStatusResponseDto })
  @ApiResponse({ status: 404, description: 'La jugada no existe' })
  async getMove(
    @Param('id') id: string,
    @Param('clientMoveId') clientMoveId: string,
  ): Promise<MoveStatusResponseDto> {
    return this.getMoveUc.execute(id, clientMoveId);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Stream de eventos de la partida en tiempo real (SSE)',
    description:
      'Server-Sent Events: emite match.started, match.move_applied y match.finished ' +
      'de esta partida. Evita el polling de GET /matches/:id.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.eventsHub.stream(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el estado de una partida' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: MatchResponseDto })
  @ApiResponse({ status: 404, description: 'La partida no existe' })
  async findOne(@Param('id') id: string): Promise<MatchResponseDto> {
    const match = await this.getMatch.execute(id);
    return MatchResponseDto.fromDomain(match);
  }
}
