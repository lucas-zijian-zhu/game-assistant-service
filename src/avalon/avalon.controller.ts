import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AssassinateDto,
  CreateRoomDto,
  HostPlayerIdDto,
  JoinRoomDto,
  MissionVoteDto,
  PlayerIdDto,
  ReadyRoomDto,
  SubmitTeamDto,
  TeamVoteDto,
  UpdateRoleConfigDto,
} from './avalon.dto';
import { AvalonService } from './avalon.service';

const roomExample = {
  id: 'room_001',
  code: 'A1B2C3',
  status: 'lobby',
  playerCount: 5,
  roleConfig: [
    { roleId: 'merlin', count: 1 },
    { roleId: 'loyal', count: 2 },
    { roleId: 'assassin', count: 1 },
    { roleId: 'minion', count: 1 },
  ],
  players: [
    {
      id: 'p_001',
      name: '小王',
      seat: 1,
      isHost: true,
      isReady: true,
      connected: true,
    },
  ],
  createdAt: '2026-04-29T22:00:00.000Z',
};

const gameExample = {
  roomId: 'room_001',
  phase: 'team_vote',
  round: 1,
  teamVoteAttempt: 1,
  leaderPlayerId: 'p_001',
  teamPlayerIds: ['p_001', 'p_003'],
  teamVoteProgress: {
    required: 5,
    submitted: 2,
    players: {
      p_001: 'submitted',
      p_002: 'pending',
    },
  },
  missionVoteProgress: {
    required: 0,
    submitted: 0,
    players: {},
  },
  history: [],
  winner: null,
  updatedAt: '2026-04-29T22:05:00.000Z',
};

const visibleRoleInfoExample = {
  myRole: {
    id: 'merlin',
    name: '梅林',
    team: 'good',
    description: '知道除莫德雷德外的坏人，终局需要避免被刺客识破。',
  },
  knownPlayers: [{ playerId: 'p_004', name: '小赵', hint: 'evil' }],
  notes: ['你知道除莫德雷德外的坏人。'],
};

@ApiTags('Avalon Rooms')
@Controller('api/rooms')
export class AvalonController {
  constructor(private readonly avalonService: AvalonService) {}

  @Post()
  @ApiOperation({ summary: '创建房间' })
  @ApiBody({ type: CreateRoomDto })
  @ApiCreatedResponse({
    description: '房间创建成功。',
    schema: {
      example: {
        room: roomExample,
        currentPlayerId: 'p_001',
      },
    },
  })
  createRoom(@Body() body: CreateRoomDto) {
    return this.avalonService.createRoom(body);
  }

  @Get()
  @ApiOperation({ summary: '获取房间列表' })
  @ApiOkResponse({
    description: '返回所有未关闭房间。',
    schema: { example: { rooms: [roomExample] } },
  })
  listRooms() {
    return this.avalonService.listRooms();
  }

  @Post(':roomCode/join')
  @ApiOperation({ summary: '加入房间' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: JoinRoomDto })
  @ApiCreatedResponse({
    description: '加入成功。',
    schema: {
      example: {
        room: roomExample,
        currentPlayerId: 'p_002',
      },
    },
  })
  joinRoom(@Param('roomCode') roomCode: string, @Body() body: JoinRoomDto) {
    return this.avalonService.joinRoom(roomCode, body.playerName);
  }

  @Put(':roomCode/role-config')
  @ApiOperation({ summary: '更新房间角色配置' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: UpdateRoleConfigDto })
  @ApiOkResponse({
    description: '角色配置更新成功。',
    schema: { example: { room: roomExample } },
  })
  updateRoleConfig(
    @Param('roomCode') roomCode: string,
    @Body() body: UpdateRoleConfigDto,
  ) {
    return this.avalonService.updateRoleConfig(roomCode, body);
  }

  @Post(':roomCode/ready')
  @ApiOperation({ summary: '玩家准备/取消准备' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: ReadyRoomDto })
  @ApiCreatedResponse({
    description: '准备状态更新成功。',
    schema: { example: { room: roomExample } },
  })
  setReady(@Param('roomCode') roomCode: string, @Body() body: ReadyRoomDto) {
    return this.avalonService.setReady(roomCode, body.playerId, body.isReady);
  }

  @Get(':roomCode')
  @ApiOperation({ summary: '获取房间' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiOkResponse({
    description: '返回房间信息。',
    schema: { example: { room: roomExample } },
  })
  getRoom(@Param('roomCode') roomCode: string) {
    return this.avalonService.getRoom(roomCode);
  }

  @Get(':roomCode/state')
  @ApiOperation({ summary: '获取房间完整状态' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiHeader({
    name: 'X-Player-Id',
    required: false,
    description: '当前玩家 ID，用于返回当前玩家可见身份信息。',
  })
  @ApiOkResponse({
    description: '返回完整快照。',
    schema: {
      example: {
        room: roomExample,
        game: gameExample,
        visibleRoleInfo: visibleRoleInfoExample,
        version: 12,
      },
    },
  })
  getRoomState(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId?: string,
  ) {
    return this.avalonService.getRoomState(roomCode, playerId);
  }

  @Post(':roomCode/leave')
  @ApiOperation({ summary: '离开房间' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: PlayerIdDto })
  @ApiCreatedResponse({
    description: '离开成功。',
    schema: { example: { room: roomExample } },
  })
  leaveRoom(@Param('roomCode') roomCode: string, @Body() body: PlayerIdDto) {
    return this.avalonService.leaveRoom(roomCode, body.playerId);
  }

  @Post(':roomCode/close')
  @ApiOperation({ summary: '房主解散房间' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: HostPlayerIdDto })
  @ApiCreatedResponse({
    description: '房间已关闭。',
    schema: {
      example: { room: { ...roomExample, status: 'closed', players: [] } },
    },
  })
  closeRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: HostPlayerIdDto,
  ) {
    return this.avalonService.closeRoom(roomCode, body.hostPlayerId);
  }

  @Post(':roomCode/game/start')
  @ApiOperation({ summary: '开始对局并随机发身份' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: HostPlayerIdDto })
  @ApiCreatedResponse({
    description: '对局开始。',
    schema: {
      example: {
        game: { ...gameExample, phase: 'role_reveal' },
        visibleRoleInfo: visibleRoleInfoExample,
      },
    },
  })
  startGame(
    @Param('roomCode') roomCode: string,
    @Body() body: HostPlayerIdDto,
  ) {
    return this.avalonService.startGame(roomCode, body.hostPlayerId);
  }

  @Get(':roomCode/game')
  @ApiOperation({ summary: '获取对局状态' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiHeader({ name: 'X-Player-Id', required: false })
  @ApiOkResponse({
    description: '返回对局状态。',
    schema: {
      example: { game: gameExample, visibleRoleInfo: visibleRoleInfoExample },
    },
  })
  getGame(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId?: string,
  ) {
    return this.avalonService.getGame(roomCode, playerId);
  }

  @Get(':roomCode/game/my-role')
  @ApiOperation({ summary: '获取当前玩家身份信息' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiHeader({ name: 'X-Player-Id', required: true })
  @ApiOkResponse({
    description: '返回当前玩家可见身份信息。',
    schema: { example: { visibleRoleInfo: visibleRoleInfoExample } },
  })
  getMyRole(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId: string,
  ) {
    return this.avalonService.getMyRole(roomCode, playerId);
  }

  @Post(':roomCode/game/team')
  @ApiOperation({ summary: '队长提交出任务队伍' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: SubmitTeamDto })
  @ApiCreatedResponse({
    description: '队伍提交成功。',
    schema: { example: { game: { ...gameExample, phase: 'team_vote' } } },
  })
  submitTeam(@Param('roomCode') roomCode: string, @Body() body: SubmitTeamDto) {
    return this.avalonService.submitTeam(
      roomCode,
      body.leaderPlayerId,
      body.teamPlayerIds,
    );
  }

  @Post(':roomCode/game/speech')
  @ApiOperation({ summary: '进入发言/讨论阶段' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: PlayerIdDto })
  @ApiCreatedResponse({
    description: '阶段推进成功。',
    schema: { example: { game: { ...gameExample, phase: 'speech' } } },
  })
  enterSpeech(@Param('roomCode') roomCode: string, @Body() body: PlayerIdDto) {
    return this.avalonService.enterSpeech(roomCode, body.playerId);
  }

  @Post(':roomCode/game/team-votes')
  @ApiOperation({ summary: '提交队伍投票' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: TeamVoteDto })
  @ApiCreatedResponse({
    description: '队伍投票提交成功。',
    schema: { example: { game: gameExample } },
  })
  submitTeamVote(
    @Param('roomCode') roomCode: string,
    @Body() body: TeamVoteDto,
  ) {
    return this.avalonService.submitTeamVote(
      roomCode,
      body.playerId,
      body.vote,
    );
  }

  @Post(':roomCode/game/mission-votes')
  @ApiOperation({ summary: '提交任务投票' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: MissionVoteDto })
  @ApiCreatedResponse({
    description: '任务投票提交成功。',
    schema: { example: { game: { ...gameExample, phase: 'mission_vote' } } },
  })
  submitMissionVote(
    @Param('roomCode') roomCode: string,
    @Body() body: MissionVoteDto,
  ) {
    return this.avalonService.submitMissionVote(
      roomCode,
      body.playerId,
      body.vote,
    );
  }

  @Post(':roomCode/game/next-round')
  @ApiOperation({ summary: '进入下一轮' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: PlayerIdDto })
  @ApiCreatedResponse({
    description: '已进入下一轮。',
    schema: {
      example: { game: { ...gameExample, phase: 'team_building', round: 2 } },
    },
  })
  nextRound(@Param('roomCode') roomCode: string, @Body() body: PlayerIdDto) {
    return this.avalonService.nextRound(roomCode, body.playerId);
  }

  @Post(':roomCode/game/assassinate')
  @ApiOperation({ summary: '刺客刺杀梅林' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: AssassinateDto })
  @ApiCreatedResponse({
    description: '刺杀结算完成。',
    schema: {
      example: { game: { ...gameExample, phase: 'finished', winner: 'evil' } },
    },
  })
  assassinate(
    @Param('roomCode') roomCode: string,
    @Body() body: AssassinateDto,
  ) {
    return this.avalonService.assassinate(
      roomCode,
      body.assassinPlayerId,
      body.targetPlayerId,
    );
  }

  @Post(':roomCode/game/reset')
  @ApiOperation({ summary: '房主重开对局' })
  @ApiParam({ name: 'roomCode', example: 'A1B2C3' })
  @ApiBody({ type: HostPlayerIdDto })
  @ApiCreatedResponse({
    description: '对局已重置。',
    schema: { example: { room: roomExample } },
  })
  resetGame(
    @Param('roomCode') roomCode: string,
    @Body() body: HostPlayerIdDto,
  ) {
    return this.avalonService.resetGame(roomCode, body.hostPlayerId);
  }
}
