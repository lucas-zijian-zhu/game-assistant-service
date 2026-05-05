import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'node:http';
import { URL } from 'node:url';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { WsEvent } from './avalon.types';

interface ClientConnection {
  roomCode: string;
  playerId: string;
  socket: WebSocket;
}

interface LobbyConnection {
  playerId: string;
  socket: WebSocket;
}

type RoomConnectionCountListener = (
  roomCode: string,
  connectionCount: number,
) => void;

@Injectable()
export class AvalonWsHub implements OnModuleDestroy {
  private server: WebSocketServer | null = null;
  private readonly clientsByRoom = new Map<string, Set<ClientConnection>>();
  private readonly lobbyClients = new Set<LobbyConnection>();
  private roomConnectionCountListener: RoomConnectionCountListener | null =
    null;

  attach(server: Server) {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const host = request.headers.host ?? 'localhost';
      const url = new URL(request.url ?? '/', `http://${host}`);
      const match = url.pathname.match(/^\/ws\/rooms\/([^/]+)$/);
      const playerId = url.searchParams.get('playerId');

      if (!playerId || (!match && url.pathname !== '/ws/lobby')) {
        socket.destroy();
        return;
      }

      this.server?.handleUpgrade(request, socket, head, (ws) => {
        if (match) {
          this.registerRoom(ws, match[1].toUpperCase(), playerId);
          return;
        }
        this.registerLobby(ws, playerId);
      });
    });
  }

  onRoomConnectionCountChanged(listener: RoomConnectionCountListener) {
    this.roomConnectionCountListener = listener;
  }

  getRoomConnectionCount(roomCode: string) {
    return this.clientsByRoom.get(roomCode.toUpperCase())?.size ?? 0;
  }

  broadcast(roomCode: string, event: WsEvent) {
    for (const client of this.clientsByRoom.get(roomCode.toUpperCase()) ?? []) {
      this.send(client.socket, event);
    }
  }

  sendToPlayer(roomCode: string, playerId: string, event: WsEvent) {
    for (const client of this.clientsByRoom.get(roomCode.toUpperCase()) ?? []) {
      if (client.playerId === playerId) {
        this.send(client.socket, event);
      }
    }
  }

  broadcastLobby(event: WsEvent) {
    for (const client of this.lobbyClients) {
      this.send(client.socket, event);
    }
  }

  onModuleDestroy() {
    this.server?.close();
    this.server = null;
    this.clientsByRoom.clear();
    this.lobbyClients.clear();
  }

  private registerRoom(socket: WebSocket, roomCode: string, playerId: string) {
    const client: ClientConnection = { roomCode, playerId, socket };
    const clients = this.clientsByRoom.get(roomCode) ?? new Set();
    clients.add(client);
    this.clientsByRoom.set(roomCode, clients);
    this.notifyRoomConnectionCountChanged(roomCode, clients.size);

    this.send(socket, {
      type: 'connection.ready',
      payload: {
        roomCode,
        playerId,
        serverTime: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    });

    socket.on('message', (raw) => {
      this.handleClientMessage(socket, this.rawDataToString(raw));
    });
    socket.on('close', () => {
      clients.delete(client);
      if (clients.size === 0) {
        this.clientsByRoom.delete(roomCode);
      }
      this.notifyRoomConnectionCountChanged(roomCode, clients.size);
    });
  }

  private registerLobby(socket: WebSocket, playerId: string) {
    const client: LobbyConnection = { playerId, socket };
    this.lobbyClients.add(client);

    this.send(socket, {
      type: 'connection.ready',
      payload: {
        scope: 'lobby',
        playerId,
        serverTime: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    });

    socket.on('message', (raw) => {
      this.handleClientMessage(socket, this.rawDataToString(raw));
    });
    socket.on('close', () => {
      this.lobbyClients.delete(client);
    });
  }

  private handleClientMessage(socket: WebSocket, raw: string) {
    try {
      const message = JSON.parse(raw) as { type?: string };
      if (message.type === 'ping') {
        this.send(socket, {
          type: 'pong',
          payload: { serverTime: new Date().toISOString() },
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_MESSAGE',
          message: 'WebSocket 消息格式无效。',
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  private rawDataToString(raw: RawData) {
    if (typeof raw === 'string') {
      return raw;
    }
    if (Buffer.isBuffer(raw)) {
      return raw.toString('utf8');
    }
    if (Array.isArray(raw)) {
      return Buffer.concat(raw).toString('utf8');
    }
    return Buffer.from(raw).toString('utf8');
  }

  private send(socket: WebSocket, event: WsEvent) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  private notifyRoomConnectionCountChanged(
    roomCode: string,
    connectionCount: number,
  ) {
    this.roomConnectionCountListener?.(roomCode, connectionCount);
  }
}
