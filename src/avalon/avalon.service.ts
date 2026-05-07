import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { AvalonException } from './avalon.errors';
import { getRole, ROLES } from './avalon.roles';
import {
  GameState,
  InternalRoomState,
  KnownPlayer,
  MissionVote,
  Player,
  RoleConfigItem,
  Room,
  RoundResult,
  RoomState,
  TeamVote,
  VisibleRoleInfo,
  VoteProgress,
  WsEvent,
} from './avalon.types';
import { AvalonWsHub } from './avalon.ws-hub';

const TEAM_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

const DEFAULT_EMPTY_ROOM_CLOSE_DELAY_MS = 30 * 60 * 1000;
const DEFAULT_FINISHED_ROOM_RETENTION_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class AvalonService implements OnModuleDestroy {
  private readonly roomsByCode = new Map<string, InternalRoomState>();
  private readonly emptyRoomCloseTimers = new Map<string, NodeJS.Timeout>();
  private readonly finishedRoomDeletionTimers = new Map<
    string,
    NodeJS.Timeout
  >();
  private readonly emptyRoomCloseDelayMs = this.getEmptyRoomCloseDelayMs();
  private readonly finishedRoomRetentionMs =
    this.getFinishedRoomRetentionMs();
  private roomSequence = 1;
  private playerSequence = 1;

  constructor(private readonly wsHub: AvalonWsHub) {
    this.wsHub.onRoomConnectionCountChanged((roomCode, connectionCount) => {
      this.handleRoomConnectionCountChanged(roomCode, connectionCount);
    });
    this.wsHub.onRoomConnectionRequested((roomCode, playerId) =>
      this.canConnectToRoom(roomCode, playerId),
    );
  }

  onModuleDestroy() {
    for (const timer of this.emptyRoomCloseTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.finishedRoomDeletionTimers.values()) {
      clearTimeout(timer);
    }
    this.emptyRoomCloseTimers.clear();
    this.finishedRoomDeletionTimers.clear();
  }

  createRoom(input: {
    playerCount: number;
    hostName: string;
    roleConfig: RoleConfigItem[];
  }) {
    this.assertRoleConfig(input.playerCount, input.roleConfig);
    const roomCode = this.createRoomCode();
    const host = this.createPlayer(input.hostName, 1, true);
    const room: Room = {
      id: `room_${this.roomSequence.toString().padStart(3, '0')}`,
      code: roomCode,
      status: 'lobby',
      playerCount: input.playerCount,
      roleConfig: input.roleConfig,
      players: [host],
      createdAt: new Date().toISOString(),
    };
    this.roomSequence += 1;

    const state: InternalRoomState = {
      room,
      game: this.createInitialGame(room.id),
      version: 1,
      rolesByPlayerId: new Map(),
      teamVotesByRound: new Map(),
      missionVotesByRound: new Map(),
    };
    this.roomsByCode.set(roomCode, state);
    this.broadcastLobbyRoomsChanged('room_created', roomCode);

    return { room: state.room, currentPlayerId: host.id };
  }

  joinRoom(roomCode: string, playerName: string) {
    const state = this.getInternal(roomCode);
    if (state.room.status !== 'lobby') {
      throw new AvalonException(
        'ROOM_NOT_JOINABLE',
        '当前房间已开始，无法加入。',
      );
    }
    if (state.room.players.length >= state.room.playerCount) {
      throw new AvalonException('ROOM_FULL', '当前房间人数已满。');
    }

    const player = this.createPlayer(
      playerName,
      this.nextAvailableSeat(state.room.players),
      false,
    );
    state.room.players.push(player);
    this.bumpAndBroadcastRoom(state);
    return { room: state.room, currentPlayerId: player.id };
  }

  listRooms() {
    const rooms = [...this.roomsByCode.values()]
      .map((state) => state.room)
      .filter((room) => room.status !== 'closed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return { rooms };
  }

  updateRoleConfig(
    roomCode: string,
    input: {
      hostPlayerId: string;
      playerCount: number;
      roleConfig: RoleConfigItem[];
    },
  ) {
    const state = this.getInternal(roomCode);
    this.assertHost(state, input.hostPlayerId);
    if (state.room.status !== 'lobby') {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '只有房间等待中可以修改角色配置。',
      );
    }
    if (input.playerCount < state.room.players.length) {
      throw new AvalonException(
        'INVALID_ROLE_CONFIG',
        '玩家人数不能小于已加入人数。',
      );
    }
    this.assertRoleConfig(input.playerCount, input.roleConfig);
    state.room.playerCount = input.playerCount;
    state.room.roleConfig = input.roleConfig;
    this.bumpAndBroadcastRoom(state);
    return { room: state.room };
  }

  setReady(roomCode: string, playerId: string, isReady: boolean) {
    const state = this.getInternal(roomCode);
    const player = this.getPlayer(state, playerId);
    player.isReady = player.isHost ? true : isReady;
    this.bumpAndBroadcastRoom(state);
    return { room: state.room };
  }

  getRoom(roomCode: string) {
    return { room: this.getInternal(roomCode).room };
  }

  getRoomState(roomCode: string, playerId?: string): RoomState {
    const state = this.getInternal(roomCode);
    return {
      room: state.room,
      game: state.game,
      visibleRoleInfo: playerId
        ? this.getVisibleRoleInfoOrNull(state, playerId)
        : null,
      version: state.version,
    };
  }

  leaveRoom(roomCode: string, playerId: string) {
    const state = this.getInternal(roomCode);
    const index = state.room.players.findIndex(
      (player) => player.id === playerId,
    );
    if (index < 0) {
      throw new AvalonException('PLAYER_NOT_FOUND', '玩家不存在或不在房间内。');
    }
    const [removed] = state.room.players.splice(index, 1);
    state.rolesByPlayerId.delete(playerId);
    if (removed.isHost && state.room.players.length > 0) {
      state.room.players[0].isHost = true;
      state.room.players[0].isReady = true;
    }
    this.bumpAndBroadcastRoom(state);
    return { room: state.room };
  }

  closeRoom(roomCode: string, hostPlayerId: string) {
    const state = this.getInternal(roomCode);
    this.assertHost(state, hostPlayerId);

    this.closeRoomState(state, 'host_closed');
    return { room: state.room };
  }

  closeRoomForInactivity(roomCode: string) {
    const state = this.roomsByCode.get(roomCode.toUpperCase());
    if (!state || state.room.status === 'closed') {
      return false;
    }

    this.closeRoomState(state, 'empty_timeout');
    return true;
  }

  private closeRoomState(state: InternalRoomState, reason: string) {
    this.clearEmptyRoomCloseTimer(state.room.code);
    const roomCode = state.room.code;
    state.room.status = 'closed';
    state.room.players = [];
    state.game.phase = 'finished';
    state.game.winner = null;
    this.bump(state);
    this.broadcast(state, 'room.closed', {
      roomCode: state.room.code,
      reason,
    });
    this.broadcast(state, 'room.updated', { room: state.room });
    this.broadcastLobbyRoomsChanged(reason, roomCode);
    this.wsHub.closeRoomConnections(roomCode);
    this.deleteRoomState(roomCode);
  }

  startGame(roomCode: string, hostPlayerId: string) {
    const state = this.getInternal(roomCode);
    this.assertHost(state, hostPlayerId);
    if (state.room.status !== 'lobby') {
      throw new AvalonException('GAME_ALREADY_STARTED', '对局已经开始。');
    }
    if (state.room.players.length !== state.room.playerCount) {
      throw new AvalonException(
        'PLAYERS_NOT_READY',
        '玩家人数未达到房间人数。',
      );
    }
    if (
      state.room.players.some((player) => !player.isHost && !player.isReady)
    ) {
      throw new AvalonException('PLAYERS_NOT_READY', '玩家未全部准备。');
    }
    this.assertRoleConfig(state.room.playerCount, state.room.roleConfig);

    state.rolesByPlayerId = this.assignRoles(
      state.room.players,
      state.room.roleConfig,
    );
    state.room.status = 'playing';
    state.game = {
      ...this.createInitialGame(state.room.id),
      phase: 'role_reveal',
      round: 1,
      teamVoteAttempt: 1,
      leaderPlayerId: this.randomPlayerId(state.room.players),
      updatedAt: new Date().toISOString(),
    };
    this.bump(state);
    this.broadcast(state, 'room.updated', { room: state.room });
    this.broadcast(state, 'game.updated', { game: state.game });
    this.broadcastLobbyRoomsChanged('room_updated', state.room.code);
    for (const player of state.room.players) {
      this.wsHub.sendToPlayer(
        state.room.code,
        player.id,
        this.event(state, 'game.private_role', {
          visibleRoleInfo: this.getVisibleRoleInfo(state, player.id),
        }),
      );
    }

    return {
      game: state.game,
      visibleRoleInfo: this.getVisibleRoleInfo(state, hostPlayerId),
    };
  }

  getGame(roomCode: string, playerId?: string) {
    const state = this.getInternal(roomCode);
    return {
      game: state.game,
      visibleRoleInfo: playerId
        ? this.getVisibleRoleInfoOrNull(state, playerId)
        : null,
    };
  }

  getMyRole(roomCode: string, playerId: string) {
    return {
      visibleRoleInfo: this.getVisibleRoleInfo(
        this.getInternal(roomCode),
        playerId,
      ),
    };
  }

  enterSpeech(roomCode: string, playerId: string) {
    const state = this.getInternal(roomCode);
    const player = this.getPlayer(state, playerId);
    if (!player.isHost && state.game.leaderPlayerId !== playerId) {
      throw new AvalonException(
        'ONLY_LEADER_ALLOWED',
        '只有房主或当前队长可以推进发言阶段。',
      );
    }
    if (
      !['role_reveal', 'round_result', 'team_building'].includes(
        state.game.phase,
      )
    ) {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '当前阶段不允许进入发言阶段。',
      );
    }
    state.game.phase = 'speech';
    this.bumpAndBroadcastGame(state);
    return { game: state.game };
  }

  submitTeam(
    roomCode: string,
    leaderPlayerId: string,
    teamPlayerIds: string[],
  ) {
    const state = this.getInternal(roomCode);
    if (state.game.leaderPlayerId !== leaderPlayerId) {
      throw new AvalonException(
        'ONLY_LEADER_ALLOWED',
        '只有当前队长可以提交出任务队伍。',
      );
    }
    if (!['speech', 'team_building'].includes(state.game.phase)) {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '当前阶段不允许提交队伍。',
      );
    }
    const expectedSize = this.currentTeamSize(state);
    const uniqueIds = new Set(teamPlayerIds);
    if (
      uniqueIds.size !== teamPlayerIds.length ||
      teamPlayerIds.length !== expectedSize
    ) {
      throw new AvalonException(
        'INVALID_TEAM_SIZE',
        '出任务人数不符合当前轮次要求。',
      );
    }
    for (const playerId of teamPlayerIds) {
      this.getPlayer(state, playerId);
    }

    state.game.teamPlayerIds = teamPlayerIds;
    if (state.game.teamVoteAttempt >= 5) {
      state.game.phase = 'mission_vote';
      state.game.teamVoteProgress = this.emptyProgress();
      state.missionVotesByRound.set(state.game.round, new Map());
      state.game.missionVoteProgress = this.createProgress(
        state.game.teamPlayerIds,
      );
      state.game.history.push({
        round: state.game.round,
        status: 'mission_pending',
        leaderPlayerId: state.game.leaderPlayerId ?? '',
        teamPlayerIds: state.game.teamPlayerIds,
        teamVoteResult: {
          approveCount: 0,
          rejectCount: 0,
          passed: true,
          votes: {},
          forced: true,
        },
      });
    } else {
      state.game.phase = 'team_vote';
      state.teamVotesByRound.set(state.game.round, new Map());
      state.game.teamVoteProgress = this.createProgress(
        state.room.players.map((player) => player.id),
      );
      state.game.missionVoteProgress = this.emptyProgress();
    }
    this.bumpAndBroadcastGame(state);
    return { game: state.game };
  }

  submitTeamVote(roomCode: string, playerId: string, vote: TeamVote) {
    const state = this.getInternal(roomCode);
    if (vote !== 'approve' && vote !== 'reject') {
      throw new AvalonException('INVALID_GAME_PHASE', '队伍投票内容无效。');
    }
    if (state.game.phase !== 'team_vote') {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '当前阶段不允许队伍投票。',
      );
    }
    this.getPlayer(state, playerId);
    const votes = this.getRoundVotes(state.teamVotesByRound, state.game.round);
    if (votes.has(playerId)) {
      throw new AvalonException('DUPLICATE_VOTE', '当前轮次已经投过票。');
    }
    votes.set(playerId, vote);
    state.game.teamVoteProgress = this.progressFromVotes(
      state.room.players.map((player) => player.id),
      votes,
    );
    this.bump(state);
    this.broadcast(state, 'vote.progress', {
      voteType: 'team',
      ...state.game.teamVoteProgress,
    });

    if (votes.size === state.room.players.length) {
      this.resolveTeamVote(state, votes);
    } else {
      this.broadcast(state, 'game.updated', { game: state.game });
    }
    return { game: state.game };
  }

  submitMissionVote(roomCode: string, playerId: string, vote: MissionVote) {
    const state = this.getInternal(roomCode);
    if (vote !== 'success' && vote !== 'fail') {
      throw new AvalonException('INVALID_GAME_PHASE', '任务投票内容无效。');
    }
    if (state.game.phase !== 'mission_vote') {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '当前阶段不允许任务投票。',
      );
    }
    if (!state.game.teamPlayerIds.includes(playerId)) {
      throw new AvalonException(
        'MISSION_VOTER_NOT_IN_TEAM',
        '非出任务玩家不能提交任务票。',
      );
    }
    const role = this.getPlayerRole(state, playerId);
    if (role.team === 'good' && vote === 'fail') {
      throw new AvalonException(
        'GOOD_PLAYER_CANNOT_FAIL',
        '好人阵营不能提交失败票。',
      );
    }
    const votes = this.getRoundVotes(
      state.missionVotesByRound,
      state.game.round,
    );
    if (votes.has(playerId)) {
      throw new AvalonException('DUPLICATE_VOTE', '当前轮次已经投过票。');
    }
    votes.set(playerId, vote);
    state.game.missionVoteProgress = this.progressFromVotes(
      state.game.teamPlayerIds,
      votes,
    );
    this.bump(state);
    this.broadcast(state, 'vote.progress', {
      voteType: 'mission',
      ...state.game.missionVoteProgress,
    });

    if (votes.size === state.game.teamPlayerIds.length) {
      this.resolveMissionVote(state, votes);
    } else {
      this.broadcast(state, 'game.updated', { game: state.game });
    }
    return { game: state.game };
  }

  nextRound(roomCode: string, playerId: string) {
    const state = this.getInternal(roomCode);
    const player = this.getPlayer(state, playerId);
    if (!player.isHost && state.game.leaderPlayerId !== playerId) {
      throw new AvalonException(
        'ONLY_LEADER_ALLOWED',
        '只有房主或当前队长可以进入下一轮。',
      );
    }
    if (state.game.phase !== 'round_result') {
      throw new AvalonException(
        'INVALID_GAME_PHASE',
        '当前阶段不允许进入下一轮。',
      );
    }
    state.game.round += 1;
    state.game.teamVoteAttempt = 1;
    state.game.phase = 'team_building';
    state.game.leaderPlayerId = this.nextLeaderId(state);
    state.game.teamPlayerIds = [];
    state.game.teamVoteProgress = this.emptyProgress();
    state.game.missionVoteProgress = this.emptyProgress();
    this.bumpAndBroadcastGame(state);
    return { game: state.game };
  }

  assassinate(
    roomCode: string,
    assassinPlayerId: string,
    targetPlayerId: string,
  ) {
    const state = this.getInternal(roomCode);
    if (state.game.phase !== 'assassination') {
      throw new AvalonException('INVALID_GAME_PHASE', '当前阶段不允许刺杀。');
    }
    if (this.getPlayerRole(state, assassinPlayerId).id !== 'assassin') {
      throw new AvalonException(
        'ONLY_LEADER_ALLOWED',
        '只有刺客可以提交刺杀目标。',
      );
    }
    const targetRole = this.getPlayerRole(state, targetPlayerId);
    state.game.phase = 'finished';
    state.game.winner = targetRole.id === 'merlin' ? 'evil' : 'good';
    state.room.status = 'finished';
    this.bump(state);
    this.broadcast(state, 'game.updated', { game: state.game });
    this.broadcast(state, 'room.updated', { room: state.room });
    this.broadcastLobbyRoomsChanged('room_updated', state.room.code);
    this.scheduleFinishedRoomDeletionIfEmpty(state.room.code);
    return { game: state.game };
  }

  resetGame(roomCode: string, hostPlayerId: string) {
    const state = this.getInternal(roomCode);
    this.assertHost(state, hostPlayerId);
    this.clearFinishedRoomDeletionTimer(state.room.code);
    state.room.status = 'lobby';
    state.room.players = state.room.players.map((player) => ({
      ...player,
      isReady: player.isHost,
    }));
    state.game = this.createInitialGame(state.room.id);
    state.rolesByPlayerId.clear();
    state.teamVotesByRound.clear();
    state.missionVotesByRound.clear();
    this.bump(state);
    this.broadcast(state, 'room.updated', { room: state.room });
    this.broadcast(state, 'game.updated', { game: state.game });
    this.broadcastLobbyRoomsChanged('room_updated', state.room.code);
    return { room: state.room };
  }

  private resolveTeamVote(
    state: InternalRoomState,
    votes: Map<string, TeamVote>,
  ) {
    const approveCount = [...votes.values()].filter(
      (vote) => vote === 'approve',
    ).length;
    const rejectCount = votes.size - approveCount;
    const passed = approveCount > rejectCount;
    const result: RoundResult = {
      round: state.game.round,
      status: passed ? 'mission_pending' : 'team_rejected',
      leaderPlayerId: state.game.leaderPlayerId ?? '',
      teamPlayerIds: state.game.teamPlayerIds,
      teamVoteResult: {
        approveCount,
        rejectCount,
        passed,
        votes: Object.fromEntries(votes),
      },
    };

    if (passed) {
      state.game.phase = 'mission_vote';
      state.missionVotesByRound.set(state.game.round, new Map());
      state.game.missionVoteProgress = this.createProgress(
        state.game.teamPlayerIds,
      );
      state.game.history.push(result);
    } else {
      state.game.phase = 'team_building';
      state.game.leaderPlayerId = this.nextLeaderId(state);
      state.game.teamPlayerIds = [];
      state.game.teamVoteProgress = this.emptyProgress();
      state.game.missionVoteProgress = this.emptyProgress();
      state.game.teamVoteAttempt += 1;
      state.game.history.push(result);
    }
    this.bump(state);
    this.broadcast(state, 'round.result', { roundResult: result });
    this.broadcast(state, 'game.updated', { game: state.game });
  }

  private resolveMissionVote(
    state: InternalRoomState,
    votes: Map<string, MissionVote>,
  ) {
    const failCount = [...votes.values()].filter(
      (vote) => vote === 'fail',
    ).length;
    const successCount = votes.size - failCount;
    const passed = failCount < this.requiredFailsForMission(state);
    const latest = state.game.history[state.game.history.length - 1];
    const result: RoundResult = {
      ...(latest ?? {
        round: state.game.round,
        status: 'mission_pending',
        leaderPlayerId: state.game.leaderPlayerId ?? '',
        teamPlayerIds: state.game.teamPlayerIds,
        teamVoteResult: {
          approveCount: 0,
          rejectCount: 0,
          passed: true,
          votes: {},
        },
      }),
      status: passed ? 'mission_succeeded' : 'mission_failed',
      missionResult: { successCount, failCount, passed },
    };
    state.game.history[state.game.history.length - 1] = result;

    const goodWins = state.game.history.filter(
      (item) => item.missionResult?.passed,
    ).length;
    const evilWins = state.game.history.filter(
      (item) => item.missionResult && !item.missionResult.passed,
    ).length;
    if (evilWins >= 3) {
      state.game.phase = 'finished';
      state.game.winner = 'evil';
      state.room.status = 'finished';
    } else if (goodWins >= 3) {
      state.game.phase = this.hasRole(state, 'assassin')
        ? 'assassination'
        : 'finished';
      state.game.winner = state.game.phase === 'finished' ? 'good' : null;
      if (state.game.phase === 'finished') {
        state.room.status = 'finished';
      }
    } else {
      state.game.phase = 'round_result';
    }
    this.bump(state);
    this.broadcast(state, 'round.result', { roundResult: result });
    this.broadcast(state, 'game.updated', { game: state.game });
    if (state.room.status === 'finished') {
      this.broadcast(state, 'room.updated', { room: state.room });
      this.broadcastLobbyRoomsChanged('room_updated', state.room.code);
      this.scheduleFinishedRoomDeletionIfEmpty(state.room.code);
    }
  }

  private getVisibleRoleInfo(
    state: InternalRoomState,
    playerId: string,
  ): VisibleRoleInfo {
    const myRole = this.getPlayerRole(state, playerId);
    const knownPlayers: KnownPlayer[] = [];
    const notes: string[] = [];

    if (myRole.id === 'merlin') {
      for (const player of state.room.players) {
        const role = this.getPlayerRole(state, player.id);
        if (
          role.team === 'evil' &&
          role.id !== 'mordred' &&
          player.id !== playerId
        ) {
          knownPlayers.push({
            playerId: player.id,
            name: player.name,
            hint: 'evil',
          });
        }
      }
      notes.push('你知道除莫德雷德外的坏人。');
    } else if (myRole.id === 'percival') {
      for (const player of state.room.players) {
        const role = this.getPlayerRole(state, player.id);
        if (role.id === 'merlin' || role.id === 'morgana') {
          knownPlayers.push({
            playerId: player.id,
            name: player.name,
            hint: 'merlin_candidate',
          });
        }
      }
      notes.push('你知道梅林和莫甘娜的候选人，但无法区分。');
    } else if (myRole.team === 'evil' && myRole.id !== 'oberon') {
      for (const player of state.room.players) {
        const role = this.getPlayerRole(state, player.id);
        if (
          role.team === 'evil' &&
          role.id !== 'oberon' &&
          player.id !== playerId
        ) {
          knownPlayers.push({
            playerId: player.id,
            name: player.name,
            hint: 'evil_teammate',
          });
        }
      }
      notes.push('你知道除奥伯伦外的坏人队友。');
    }

    return { myRole, knownPlayers, notes };
  }

  private getVisibleRoleInfoOrNull(state: InternalRoomState, playerId: string) {
    if (!state.rolesByPlayerId.has(playerId)) {
      return null;
    }
    return this.getVisibleRoleInfo(state, playerId);
  }

  private assignRoles(players: Player[], roleConfig: RoleConfigItem[]) {
    const roleIds = roleConfig.flatMap(
      (item) => Array(item.count).fill(item.roleId) as string[],
    );
    const shuffledRoles = this.shuffle(roleIds);
    return new Map(
      players.map((player, index) => [player.id, shuffledRoles[index]]),
    );
  }

  private assertRoleConfig(playerCount: number, roleConfig: RoleConfigItem[]) {
    if (playerCount < 5 || playerCount > 10) {
      throw new AvalonException('INVALID_ROLE_CONFIG', '基础包支持 5-10 人。');
    }
    const total = roleConfig.reduce((sum, item) => sum + item.count, 0);
    if (
      total !== playerCount ||
      roleConfig.some((item) => item.count < 1 || !getRole(item.roleId))
    ) {
      throw new AvalonException('INVALID_ROLE_CONFIG', '角色配置无效。');
    }
  }

  private getInternal(roomCode: string) {
    const state = this.roomsByCode.get(roomCode.toUpperCase());
    if (!state) {
      throw new AvalonException('ROOM_NOT_FOUND', '房间不存在。');
    }
    return state;
  }

  private canConnectToRoom(roomCode: string, playerId: string) {
    const state = this.roomsByCode.get(roomCode.toUpperCase());
    return (
      !!state &&
      state.room.status !== 'closed' &&
      state.room.players.some((player) => player.id === playerId)
    );
  }

  private getPlayer(state: InternalRoomState, playerId: string) {
    const player = state.room.players.find((item) => item.id === playerId);
    if (!player) {
      throw new AvalonException('PLAYER_NOT_FOUND', '玩家不存在或不在房间内。');
    }
    return player;
  }

  private getPlayerRole(state: InternalRoomState, playerId: string) {
    this.getPlayer(state, playerId);
    const roleId = state.rolesByPlayerId.get(playerId);
    const role = roleId ? ROLES[roleId] : undefined;
    if (!role) {
      throw new AvalonException('INVALID_GAME_PHASE', '当前玩家尚未分配身份。');
    }
    return role;
  }

  private assertHost(state: InternalRoomState, playerId: string) {
    if (!this.getPlayer(state, playerId).isHost) {
      throw new AvalonException('ONLY_HOST_ALLOWED', '只有房主可以操作。');
    }
  }

  private createInitialGame(roomId: string): GameState {
    return {
      roomId,
      phase: 'not_started',
      round: 0,
      teamVoteAttempt: 0,
      leaderPlayerId: null,
      teamPlayerIds: [],
      teamVoteProgress: this.emptyProgress(),
      missionVoteProgress: this.emptyProgress(),
      history: [],
      winner: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private createPlayer(name: string, seat: number, isHost: boolean): Player {
    const player: Player = {
      id: `p_${this.playerSequence.toString().padStart(3, '0')}`,
      name,
      seat,
      isHost,
      isReady: isHost,
      connected: true,
    };
    this.playerSequence += 1;
    return player;
  }

  private createRoomCode() {
    let code = '';
    do {
      code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    } while (this.roomsByCode.has(code));
    return code;
  }

  private nextAvailableSeat(players: Player[]) {
    const taken = new Set(players.map((player) => player.seat));
    for (let seat = 1; seat <= 10; seat += 1) {
      if (!taken.has(seat)) {
        return seat;
      }
    }
    return players.length + 1;
  }

  private randomPlayerId(players: Player[]) {
    return players[randomInt(players.length)].id;
  }

  private currentTeamSize(state: InternalRoomState) {
    return TEAM_SIZES[state.room.playerCount][state.game.round - 1];
  }

  private nextLeaderId(state: InternalRoomState) {
    const currentIndex = state.room.players.findIndex(
      (player) => player.id === state.game.leaderPlayerId,
    );
    return state.room.players[(currentIndex + 1) % state.room.players.length]
      .id;
  }

  private requiredFailsForMission(state: InternalRoomState) {
    return state.room.playerCount >= 7 && state.game.round === 4 ? 2 : 1;
  }

  private hasRole(state: InternalRoomState, roleId: string) {
    return [...state.rolesByPlayerId.values()].includes(roleId);
  }

  private emptyProgress(): VoteProgress {
    return { required: 0, submitted: 0, players: {} };
  }

  private createProgress(playerIds: string[]): VoteProgress {
    return {
      required: playerIds.length,
      submitted: 0,
      players: Object.fromEntries(
        playerIds.map((playerId) => [playerId, 'pending']),
      ),
    };
  }

  private progressFromVotes<T>(
    playerIds: string[],
    votes: Map<string, T>,
  ): VoteProgress {
    return {
      required: playerIds.length,
      submitted: votes.size,
      players: Object.fromEntries(
        playerIds.map((playerId) => [
          playerId,
          votes.has(playerId) ? 'submitted' : 'pending',
        ]),
      ),
    };
  }

  private getRoundVotes<T>(store: Map<number, Map<string, T>>, round: number) {
    const votes = store.get(round) ?? new Map<string, T>();
    store.set(round, votes);
    return votes;
  }

  private bumpAndBroadcastRoom(state: InternalRoomState) {
    this.bump(state);
    this.broadcast(state, 'room.updated', { room: state.room });
    this.broadcastLobbyRoomsChanged('room_updated', state.room.code);
  }

  private bumpAndBroadcastGame(state: InternalRoomState) {
    this.bump(state);
    this.broadcast(state, 'game.updated', { game: state.game });
  }

  private bump(state: InternalRoomState) {
    state.version += 1;
    state.game.updatedAt = new Date().toISOString();
  }

  private broadcast(state: InternalRoomState, type: string, payload: unknown) {
    this.wsHub.broadcast(state.room.code, this.event(state, type, payload));
  }

  private broadcastLobbyRoomsChanged(reason: string, roomCode: string) {
    this.wsHub.broadcastLobby({
      type: 'lobby.rooms.changed',
      payload: { reason, roomCode },
      createdAt: new Date().toISOString(),
    });
  }

  private event(
    state: InternalRoomState,
    type: string,
    payload: unknown,
  ): WsEvent {
    return {
      type,
      payload,
      version: state.version,
      createdAt: new Date().toISOString(),
    };
  }

  private handleRoomConnectionCountChanged(
    roomCode: string,
    connectionCount: number,
  ) {
    const normalizedRoomCode = roomCode.toUpperCase();
    if (connectionCount > 0) {
      this.clearEmptyRoomCloseTimer(normalizedRoomCode);
      this.clearFinishedRoomDeletionTimer(normalizedRoomCode);
      return;
    }

    const state = this.roomsByCode.get(normalizedRoomCode);
    if (!state || state.room.status === 'closed') {
      return;
    }
    if (state.room.status === 'finished') {
      this.scheduleFinishedRoomDeletion(normalizedRoomCode);
      return;
    }

    this.clearEmptyRoomCloseTimer(normalizedRoomCode);
    const timer = setTimeout(() => {
      if (this.wsHub.getRoomConnectionCount(normalizedRoomCode) === 0) {
        this.closeRoomForInactivity(normalizedRoomCode);
      }
    }, this.emptyRoomCloseDelayMs);
    this.emptyRoomCloseTimers.set(normalizedRoomCode, timer);
  }

  private scheduleFinishedRoomDeletionIfEmpty(roomCode: string) {
    const normalizedRoomCode = roomCode.toUpperCase();
    if (this.wsHub.getRoomConnectionCount(normalizedRoomCode) === 0) {
      this.scheduleFinishedRoomDeletion(normalizedRoomCode);
    }
  }

  private scheduleFinishedRoomDeletion(roomCode: string) {
    const normalizedRoomCode = roomCode.toUpperCase();
    const state = this.roomsByCode.get(normalizedRoomCode);
    if (!state || state.room.status !== 'finished') {
      return;
    }

    this.clearFinishedRoomDeletionTimer(normalizedRoomCode);
    if (this.finishedRoomRetentionMs === 0) {
      this.deleteRoomState(normalizedRoomCode);
      return;
    }

    const timer = setTimeout(() => {
      const latestState = this.roomsByCode.get(normalizedRoomCode);
      if (
        latestState?.room.status === 'finished' &&
        this.wsHub.getRoomConnectionCount(normalizedRoomCode) === 0
      ) {
        this.deleteRoomState(normalizedRoomCode);
      }
    }, this.finishedRoomRetentionMs);
    this.finishedRoomDeletionTimers.set(normalizedRoomCode, timer);
  }

  private clearEmptyRoomCloseTimer(roomCode: string) {
    const normalizedRoomCode = roomCode.toUpperCase();
    const timer = this.emptyRoomCloseTimers.get(normalizedRoomCode);
    if (timer) {
      clearTimeout(timer);
      this.emptyRoomCloseTimers.delete(normalizedRoomCode);
    }
  }

  private clearFinishedRoomDeletionTimer(roomCode: string) {
    const normalizedRoomCode = roomCode.toUpperCase();
    const timer = this.finishedRoomDeletionTimers.get(normalizedRoomCode);
    if (timer) {
      clearTimeout(timer);
      this.finishedRoomDeletionTimers.delete(normalizedRoomCode);
    }
  }

  private deleteRoomState(roomCode: string) {
    const normalizedRoomCode = roomCode.toUpperCase();
    this.clearEmptyRoomCloseTimer(normalizedRoomCode);
    this.clearFinishedRoomDeletionTimer(normalizedRoomCode);
    this.roomsByCode.delete(normalizedRoomCode);
  }

  private getEmptyRoomCloseDelayMs() {
    const configuredDelay = Number(
      process.env.AVALON_EMPTY_ROOM_CLOSE_DELAY_MS,
    );
    if (Number.isFinite(configuredDelay) && configuredDelay >= 0) {
      return configuredDelay;
    }
    return DEFAULT_EMPTY_ROOM_CLOSE_DELAY_MS;
  }

  private getFinishedRoomRetentionMs() {
    const configuredDelay = Number(
      process.env.AVALON_FINISHED_ROOM_RETENTION_MS,
    );
    if (Number.isFinite(configuredDelay) && configuredDelay >= 0) {
      return configuredDelay;
    }
    return DEFAULT_FINISHED_ROOM_RETENTION_MS;
  }

  private shuffle<T>(items: T[]) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = randomInt(index + 1);
      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }
}
