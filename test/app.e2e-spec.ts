import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AvalonService } from '../src/avalon/avalon.service';
import { AppModule } from './../src/app.module';

interface RoomResponseBody {
  room: {
    code: string;
    players: unknown[];
    status: string;
  };
  currentPlayerId: string;
}

interface GameResponseBody {
  game: {
    phase: string;
    leaderPlayerId: string;
    teamVoteAttempt: number;
    history: Array<{
      status: string;
      missionResult?: {
        passed: boolean;
      };
      teamVoteResult: {
        votes: Record<string, 'approve' | 'reject'>;
        forced?: boolean;
      };
    }>;
  };
  visibleRoleInfo: {
    myRole: unknown;
  };
}

interface StateResponseBody {
  room: {
    players: unknown[];
  };
  visibleRoleInfo: {
    myRole: unknown;
  };
  rolesByPlayerId?: unknown;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('creates a room, fills it, and starts an Avalon game', async () => {
    const roleConfig = [
      { roleId: 'merlin', count: 1 },
      { roleId: 'loyal', count: 2 },
      { roleId: 'assassin', count: 1 },
      { roleId: 'minion', count: 1 },
    ];

    const createResponse = await request(app.getHttpServer())
      .post('/api/rooms')
      .send({ playerCount: 5, hostName: '小王', roleConfig })
      .expect(201);

    const createBody = createResponse.body as RoomResponseBody;
    const roomCode = createBody.room.code;
    const hostPlayerId = createBody.currentPlayerId;

    const roomsResponse = await request(app.getHttpServer())
      .get('/api/rooms')
      .expect(200);
    expect((roomsResponse.body as { rooms: { code: string }[] }).rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: roomCode })]),
    );

    const joinedPlayerIds: string[] = [];
    for (const playerName of ['小李', '小赵', '小钱', '小孙']) {
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/rooms/${roomCode}/join`)
        .send({ playerName })
        .expect(201);
      joinedPlayerIds.push(
        (joinResponse.body as RoomResponseBody).currentPlayerId,
      );
    }

    for (const playerId of joinedPlayerIds) {
      await request(app.getHttpServer())
        .post(`/api/rooms/${roomCode}/ready`)
        .send({ playerId, isReady: true })
        .expect(201);
    }

    const startResponse = await request(app.getHttpServer())
      .post(`/api/rooms/${roomCode}/game/start`)
      .send({ hostPlayerId })
      .expect(201);

    const startBody = startResponse.body as GameResponseBody;
    expect(startBody.game.phase).toBe('role_reveal');
    expect([hostPlayerId, ...joinedPlayerIds]).toContain(
      startBody.game.leaderPlayerId,
    );
    expect(startBody.visibleRoleInfo.myRole).toBeDefined();

    const stateResponse = await request(app.getHttpServer())
      .get(`/api/rooms/${roomCode}/state`)
      .set('X-Player-Id', joinedPlayerIds[0])
      .expect(200);

    const stateBody = stateResponse.body as StateResponseBody;
    expect(stateBody.room.players).toHaveLength(5);
    expect(stateBody.visibleRoleInfo.myRole).toBeDefined();
    expect(stateBody.rolesByPlayerId).toBeUndefined();
  });

  it('does not count rejected teams as mission results and forces the fifth team', async () => {
    const roleConfig = [
      { roleId: 'merlin', count: 1 },
      { roleId: 'loyal', count: 2 },
      { roleId: 'assassin', count: 1 },
      { roleId: 'minion', count: 1 },
    ];

    const createResponse = await request(app.getHttpServer())
      .post('/api/rooms')
      .send({ playerCount: 5, hostName: '小王', roleConfig })
      .expect(201);

    const createBody = createResponse.body as RoomResponseBody;
    const roomCode = createBody.room.code;
    const hostPlayerId = createBody.currentPlayerId;
    const playerIds = [hostPlayerId];

    for (const playerName of ['小李', '小赵', '小钱', '小孙']) {
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/rooms/${roomCode}/join`)
        .send({ playerName })
        .expect(201);
      playerIds.push((joinResponse.body as RoomResponseBody).currentPlayerId);
    }

    for (const playerId of playerIds.slice(1)) {
      await request(app.getHttpServer())
        .post(`/api/rooms/${roomCode}/ready`)
        .send({ playerId, isReady: true })
        .expect(201);
    }

    const startResponse = await request(app.getHttpServer())
      .post(`/api/rooms/${roomCode}/game/start`)
      .send({ hostPlayerId })
      .expect(201);

    let game = (startResponse.body as GameResponseBody).game;
    await request(app.getHttpServer())
      .post(`/api/rooms/${roomCode}/game/speech`)
      .send({ playerId: hostPlayerId })
      .expect(201);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const leaderPlayerId = game.leaderPlayerId;
      const teammateId = playerIds.find(
        (playerId) => playerId !== leaderPlayerId,
      );

      await request(app.getHttpServer())
        .post(`/api/rooms/${roomCode}/game/team`)
        .send({ leaderPlayerId, teamPlayerIds: [leaderPlayerId, teammateId] })
        .expect(201);

      for (const playerId of playerIds) {
        const voteResponse = await request(app.getHttpServer())
          .post(`/api/rooms/${roomCode}/game/team-votes`)
          .send({ playerId, vote: 'reject' })
          .expect(201);
        game = (voteResponse.body as GameResponseBody).game;
      }

      expect(game.phase).toBe('team_building');
      expect(game.teamVoteAttempt).toBe(attempt + 1);
      expect(game.history).toHaveLength(attempt);
      expect(game.history[attempt - 1].status).toBe('team_rejected');
      expect(game.history[attempt - 1].missionResult).toBeUndefined();
      expect(game.history[attempt - 1].teamVoteResult.votes).toEqual(
        Object.fromEntries(playerIds.map((playerId) => [playerId, 'reject'])),
      );
    }

    const leaderPlayerId = game.leaderPlayerId;
    const teammateId = playerIds.find(
      (playerId) => playerId !== leaderPlayerId,
    );

    const forcedTeamResponse = await request(app.getHttpServer())
      .post(`/api/rooms/${roomCode}/game/team`)
      .send({ leaderPlayerId, teamPlayerIds: [leaderPlayerId, teammateId] })
      .expect(201);

    game = (forcedTeamResponse.body as GameResponseBody).game;
    expect(game.phase).toBe('mission_vote');
    expect(game.teamVoteAttempt).toBe(5);
    expect(game.history).toHaveLength(5);
    expect(game.history[4].status).toBe('mission_pending');
    expect(game.history[4].teamVoteResult.votes).toEqual({});
    expect(game.history[4].teamVoteResult.forced).toBe(true);
  });

  it('allows the host to close a room', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/rooms')
      .send({
        playerCount: 5,
        hostName: '房主',
        roleConfig: [
          { roleId: 'merlin', count: 1 },
          { roleId: 'loyal', count: 2 },
          { roleId: 'assassin', count: 1 },
          { roleId: 'minion', count: 1 },
        ],
      })
      .expect(201);

    const createBody = createResponse.body as RoomResponseBody;

    const closeResponse = await request(app.getHttpServer())
      .post(`/api/rooms/${createBody.room.code}/close`)
      .send({ hostPlayerId: createBody.currentPlayerId })
      .expect(201);

    const closedRoom = (closeResponse.body as RoomResponseBody).room;
    expect(closedRoom.status).toBe('closed');
    expect(closedRoom.players).toHaveLength(0);

    const roomsResponse = await request(app.getHttpServer())
      .get('/api/rooms')
      .expect(200);
    expect(
      (roomsResponse.body as { rooms: { code: string }[] }).rooms,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: createBody.room.code }),
      ]),
    );
  });

  it('removes an inactive closed room from the lobby list', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/rooms')
      .send({
        playerCount: 5,
        hostName: '房主',
        roleConfig: [
          { roleId: 'merlin', count: 1 },
          { roleId: 'loyal', count: 2 },
          { roleId: 'assassin', count: 1 },
          { roleId: 'minion', count: 1 },
        ],
      })
      .expect(201);

    const createBody = createResponse.body as RoomResponseBody;
    expect(
      app.get(AvalonService).closeRoomForInactivity(createBody.room.code),
    ).toBe(true);

    const roomsResponse = await request(app.getHttpServer())
      .get('/api/rooms')
      .expect(200);
    expect(
      (roomsResponse.body as { rooms: { code: string }[] }).rooms,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: createBody.room.code }),
      ]),
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
