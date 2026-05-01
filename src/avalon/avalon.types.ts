export type Team = 'good' | 'evil';
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';
export type GamePhase =
  | 'not_started'
  | 'role_reveal'
  | 'speech'
  | 'team_building'
  | 'team_vote'
  | 'mission_vote'
  | 'round_result'
  | 'assassination'
  | 'finished';
export type VoteStatus = 'pending' | 'submitted';
export type Winner = 'good' | 'evil' | null;
export type TeamVote = 'approve' | 'reject';
export type MissionVote = 'success' | 'fail';
export type RoundHistoryStatus =
  | 'team_rejected'
  | 'mission_pending'
  | 'mission_succeeded'
  | 'mission_failed';

export interface Role {
  id: string;
  name: string;
  team: Team;
  description: string;
}

export interface RoleConfigItem {
  roleId: string;
  count: number;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  playerCount: number;
  roleConfig: RoleConfigItem[];
  players: Player[];
  createdAt: string;
}

export interface KnownPlayer {
  playerId: string;
  name: string;
  hint: string;
}

export interface VisibleRoleInfo {
  myRole: Role;
  knownPlayers: KnownPlayer[];
  notes: string[];
}

export interface VoteProgress {
  required: number;
  submitted: number;
  players: Record<string, VoteStatus>;
}

export interface TeamVoteResult {
  approveCount: number;
  rejectCount: number;
  passed: boolean;
  forced?: boolean;
}

export interface MissionResult {
  successCount: number;
  failCount: number;
  passed: boolean;
}

export interface RoundResult {
  round: number;
  status: RoundHistoryStatus;
  leaderPlayerId: string;
  teamPlayerIds: string[];
  teamVoteResult: TeamVoteResult;
  missionResult?: MissionResult;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  round: number;
  teamVoteAttempt: number;
  leaderPlayerId: string | null;
  teamPlayerIds: string[];
  teamVoteProgress: VoteProgress;
  missionVoteProgress: VoteProgress;
  history: RoundResult[];
  winner: Winner;
  updatedAt: string;
}

export interface RoomState {
  room: Room;
  game: GameState;
  visibleRoleInfo: VisibleRoleInfo | null;
  version: number;
}

export interface InternalRoomState {
  room: Room;
  game: GameState;
  version: number;
  rolesByPlayerId: Map<string, string>;
  teamVotesByRound: Map<number, Map<string, TeamVote>>;
  missionVotesByRound: Map<number, Map<string, MissionVote>>;
}

export interface WsEvent<T = unknown> {
  type: string;
  payload: T;
  version?: number;
  createdAt: string;
}
