import { ApiProperty } from '@nestjs/swagger';

export class RoleConfigItemDto {
  @ApiProperty({ example: 'merlin' })
  roleId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  count: number;
}

export class CreateRoomDto {
  @ApiProperty({ example: 5, minimum: 5, maximum: 10 })
  playerCount: number;

  @ApiProperty({ example: '小王' })
  hostName: string;

  @ApiProperty({ type: [RoleConfigItemDto] })
  roleConfig: RoleConfigItemDto[];
}

export class JoinRoomDto {
  @ApiProperty({ example: '小李' })
  playerName: string;
}

export class UpdateRoleConfigDto {
  @ApiProperty({ example: 'p_001' })
  hostPlayerId: string;

  @ApiProperty({ example: 5, minimum: 5, maximum: 10 })
  playerCount: number;

  @ApiProperty({ type: [RoleConfigItemDto] })
  roleConfig: RoleConfigItemDto[];
}

export class ReadyRoomDto {
  @ApiProperty({ example: 'p_002' })
  playerId: string;

  @ApiProperty({ example: true })
  isReady: boolean;
}

export class PlayerIdDto {
  @ApiProperty({ example: 'p_001' })
  playerId: string;
}

export class HostPlayerIdDto {
  @ApiProperty({ example: 'p_001' })
  hostPlayerId: string;
}

export class SubmitTeamDto {
  @ApiProperty({ example: 'p_001' })
  leaderPlayerId: string;

  @ApiProperty({ example: ['p_001', 'p_003'], type: [String] })
  teamPlayerIds: string[];
}

export class TeamVoteDto {
  @ApiProperty({ example: 'p_002' })
  playerId: string;

  @ApiProperty({ enum: ['approve', 'reject'], example: 'approve' })
  vote: 'approve' | 'reject';
}

export class MissionVoteDto {
  @ApiProperty({ example: 'p_003' })
  playerId: string;

  @ApiProperty({ enum: ['success', 'fail'], example: 'success' })
  vote: 'success' | 'fail';
}

export class AssassinateDto {
  @ApiProperty({ example: 'p_004' })
  assassinPlayerId: string;

  @ApiProperty({ example: 'p_001' })
  targetPlayerId: string;
}
