import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { AvalonWsHub } from './avalon.ws-hub';

class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent: string[] = [];

  send(message: string) {
    this.sent.push(message);
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
});
