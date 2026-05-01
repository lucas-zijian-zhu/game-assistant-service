import { HttpException, HttpStatus } from '@nestjs/common';

const STATUS_BY_CODE: Record<string, HttpStatus> = {
  ROOM_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROOM_NOT_JOINABLE: HttpStatus.CONFLICT,
  ROOM_FULL: HttpStatus.CONFLICT,
  PLAYER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ONLY_HOST_ALLOWED: HttpStatus.FORBIDDEN,
  ONLY_LEADER_ALLOWED: HttpStatus.FORBIDDEN,
  INVALID_ROLE_CONFIG: HttpStatus.BAD_REQUEST,
  PLAYERS_NOT_READY: HttpStatus.CONFLICT,
  GAME_ALREADY_STARTED: HttpStatus.CONFLICT,
  INVALID_GAME_PHASE: HttpStatus.CONFLICT,
  INVALID_TEAM_SIZE: HttpStatus.BAD_REQUEST,
  DUPLICATE_VOTE: HttpStatus.CONFLICT,
  MISSION_VOTER_NOT_IN_TEAM: HttpStatus.FORBIDDEN,
  GOOD_PLAYER_CANNOT_FAIL: HttpStatus.FORBIDDEN,
};

export class AvalonException extends HttpException {
  constructor(code: string, message: string) {
    super({ code, message }, STATUS_BY_CODE[code] ?? HttpStatus.BAD_REQUEST);
  }
}
