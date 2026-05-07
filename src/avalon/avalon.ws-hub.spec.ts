import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { AvalonWsHub } from './avalon.ws-hub';

class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  send(message: string) {
    this.sent.push(message);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}

describe('AvalonWsHub', () => {
  it('broadcasts lobby room list changes to lobby clients', () => {
    const hub = new AvalonWsHub();
    const socket = new FakeSocket();

    (
      hub as unknown as {
        registerLobby(socket: WebSocket, playerId: string): void;
      }
    ).registerLobby(socket as unknown as WebSocket, 'lobby_001');

    expect(JSON.parse(socket.sent[0])).toEqual(
      expect.objectContaining({
        type: 'connection.ready',
        payload: expect.objectContaining({
          scope: 'lobby',
          playerId: 'lobby_001',
        }),
      }),
    );

    hub.broadcastLobby({
      type: 'lobby.rooms.changed',
      payload: { reason: 'room_created', roomCode: 'A1B2C3' },
      createdAt: new Date().toISOString(),
    });

    expect(JSON.parse(socket.sent[1])).toEqual(
      expect.objectContaining({
        type: 'lobby.rooms.changed',
        payload: {
          reason: 'room_created',
          roomCode: 'A1B2C3',
        },
      }),
    );

    socket.emit('close');
    hub.broadcastLobby({
      type: 'lobby.rooms.changed',
      payload: { reason: 'room_updated', roomCode: 'A1B2C3' },
      createdAt: new Date().toISOString(),
    });

    expect(socket.sent).toHaveLength(2);
  });

  it('closes all active connections for a room', () => {
    const hub = new AvalonWsHub();
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();

    (
      hub as unknown as {
        registerRoom(
          socket: WebSocket,
          roomCode: string,
          playerId: string,
        ): void;
      }
    ).registerRoom(firstSocket as unknown as WebSocket, 'A1B2C3', 'p_001');
    (
      hub as unknown as {
        registerRoom(
          socket: WebSocket,
          roomCode: string,
          playerId: string,
        ): void;
      }
    ).registerRoom(secondSocket as unknown as WebSocket, 'A1B2C3', 'p_002');

    hub.closeRoomConnections('a1b2c3');

    expect(firstSocket.closeCalls).toEqual([
      { code: 1000, reason: 'room_closed' },
    ]);
    expect(secondSocket.closeCalls).toEqual([
      { code: 1000, reason: 'room_closed' },
    ]);
    expect(hub.getRoomConnectionCount('A1B2C3')).toBe(0);
  });
});
