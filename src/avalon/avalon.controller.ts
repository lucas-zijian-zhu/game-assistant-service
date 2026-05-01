import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AvalonService } from './avalon.service';
import { MissionVote, RoleConfigItem, TeamVote } from './avalon.types';

@Controller('api/rooms')
export class AvalonController {
  constructor(private readonly avalonService: AvalonService) {}

  @Post()
  createRoom(
    @Body()
    body: {
      playerCount: number;
      hostName: string;
      roleConfig: RoleConfigItem[];
    },
  ) {
    return this.avalonService.createRoom(body);
  }

  @Get()
  listRooms() {
    return this.avalonService.listRooms();
  }

  @Post(':roomCode/join')
  joinRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerName: string },
  ) {
    return this.avalonService.joinRoom(roomCode, body.playerName);
  }

  @Put(':roomCode/role-config')
  updateRoleConfig(
    @Param('roomCode') roomCode: string,
    @Body()
    body: {
      hostPlayerId: string;
      playerCount: number;
      roleConfig: RoleConfigItem[];
    },
  ) {
    return this.avalonService.updateRoleConfig(roomCode, body);
  }

  @Post(':roomCode/ready')
  setReady(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string; isReady: boolean },
  ) {
    return this.avalonService.setReady(roomCode, body.playerId, body.isReady);
  }

  @Get(':roomCode')
  getRoom(@Param('roomCode') roomCode: string) {
    return this.avalonService.getRoom(roomCode);
  }

  @Get(':roomCode/state')
  getRoomState(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId?: string,
  ) {
    return this.avalonService.getRoomState(roomCode, playerId);
  }

  @Post(':roomCode/leave')
  leaveRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string },
  ) {
    return this.avalonService.leaveRoom(roomCode, body.playerId);
  }

  @Post(':roomCode/close')
  closeRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: { hostPlayerId: string },
  ) {
    return this.avalonService.closeRoom(roomCode, body.hostPlayerId);
  }

  @Post(':roomCode/game/start')
  startGame(
    @Param('roomCode') roomCode: string,
    @Body() body: { hostPlayerId: string },
  ) {
    return this.avalonService.startGame(roomCode, body.hostPlayerId);
  }

  @Get(':roomCode/game')
  getGame(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId?: string,
  ) {
    return this.avalonService.getGame(roomCode, playerId);
  }

  @Get(':roomCode/game/my-role')
  getMyRole(
    @Param('roomCode') roomCode: string,
    @Headers('x-player-id') playerId: string,
  ) {
    return this.avalonService.getMyRole(roomCode, playerId);
  }

  @Post(':roomCode/game/team')
  submitTeam(
    @Param('roomCode') roomCode: string,
    @Body() body: { leaderPlayerId: string; teamPlayerIds: string[] },
  ) {
    return this.avalonService.submitTeam(
      roomCode,
      body.leaderPlayerId,
      body.teamPlayerIds,
    );
  }

  @Post(':roomCode/game/speech')
  enterSpeech(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string },
  ) {
    return this.avalonService.enterSpeech(roomCode, body.playerId);
  }

  @Post(':roomCode/game/team-votes')
  submitTeamVote(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string; vote: TeamVote },
  ) {
    return this.avalonService.submitTeamVote(
      roomCode,
      body.playerId,
      body.vote,
    );
  }

  @Post(':roomCode/game/mission-votes')
  submitMissionVote(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string; vote: MissionVote },
  ) {
    return this.avalonService.submitMissionVote(
      roomCode,
      body.playerId,
      body.vote,
    );
  }

  @Post(':roomCode/game/next-round')
  nextRound(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string },
  ) {
    return this.avalonService.nextRound(roomCode, body.playerId);
  }

  @Post(':roomCode/game/assassinate')
  assassinate(
    @Param('roomCode') roomCode: string,
    @Body() body: { assassinPlayerId: string; targetPlayerId: string },
  ) {
    return this.avalonService.assassinate(
      roomCode,
      body.assassinPlayerId,
      body.targetPlayerId,
    );
  }

  @Post(':roomCode/game/reset')
  resetGame(
    @Param('roomCode') roomCode: string,
    @Body() body: { hostPlayerId: string },
  ) {
    return this.avalonService.resetGame(roomCode, body.hostPlayerId);
  }
}
