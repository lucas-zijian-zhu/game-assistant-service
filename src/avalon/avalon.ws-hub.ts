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
type RoomConnectionValidator = (roomCode: string, playerId: string) => boolean;

const DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const DEFAULT_WS_UPGRADE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_WS_UPGRADE_RATE_LIMIT_MAX = 120;

@Injectable()
export class AvalonWsHub implements OnModuleDestroy {
  private server: WebSocketServer | null = null;
  private readonly clientsByRoom = new Map<string, Set<ClientConnection>>();
  private readonly lobbyClients = new Set<LobbyConnection>();
  private readonly aliveSockets = new WeakMap<WebSocket, boolean>();
  private readonly upgradeRateLimitBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private roomConnectionCountListener: RoomConnectionCountListener | null =
    null;
  private roomConnectionValidator: RoomConnectionValidator | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly heartbeatIntervalMs = this.getNumberEnv(
    'AVALON_WS_HEARTBEAT_INTERVAL_MS',
    DEFAULT_WS_HEARTBEAT_INTERVAL_MS,
  );
  private readonly upgradeRateLimitWindowMs = this.getNumberEnv(
    'AVALON_WS_UPGRADE_RATE_LIMIT_WINDOW_MS',
    DEFAULT_WS_UPGRADE_RATE_LIMIT_WINDOW_MS,
  );
  private readonly upgradeRateLimitMax = this.getNumberEnv(
    'AVALON_WS_UPGRADE_RATE_LIMIT_MAX',
    DEFAULT_WS_UPGRADE_RATE_LIMIT_MAX,
  );

  attach(server: Server) {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      if (!this.consumeUpgradeRateLimit(request.socket.remoteAddress)) {
        socket.destroy();
        return;
      }

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
          const roomCode = match[1].toUpperCase();
          if (
            this.roomConnectionValidator &&
            !this.roomConnectionValidator(roomCode, playerId)
          ) {
            ws.close(1008, 'room_not_available');
            return;
          }
          this.registerRoom(ws, roomCode, playerId);
          return;
        }
        this.registerLobby(ws, playerId);
      });
    });
    this.startHeartbeat();
  }

  onRoomConnectionCountChanged(listener: RoomConnectionCountListener) {
    this.roomConnectionCountListener = listener;
  }

  onRoomConnectionRequested(validator: RoomConnectionValidator) {
    this.roomConnectionValidator = validator;
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

  closeRoomConnections(roomCode: string, code = 1000, reason = 'room_closed') {
    for (const client of [
      ...(this.clientsByRoom.get(roomCode.toUpperCase()) ?? []),
    ]) {
      client.socket.close(code, reason);
    }
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.server?.close();
    this.server = null;
    this.clientsByRoom.clear();
    this.lobbyClients.clear();
    this.upgradeRateLimitBuckets.clear();
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
    this.trackHeartbeat(socket);

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
    this.trackHeartbeat(socket);

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

  private trackHeartbeat(socket: WebSocket) {
    this.aliveSockets.set(socket, true);
    socket.on('pong', () => {
      this.aliveSockets.set(socket, true);
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer || this.heartbeatIntervalMs === 0) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.allSockets()) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }
        if (this.aliveSockets.get(socket) === false) {
          socket.terminate();
          continue;
        }
        this.aliveSockets.set(socket, false);
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
      }
      this.pruneRateLimitBuckets();
    }, this.heartbeatIntervalMs);
  }

  private allSockets() {
    const sockets: WebSocket[] = [];
    for (const clients of this.clientsByRoom.values()) {
      for (const client of clients) {
        sockets.push(client.socket);
      }
    }
    for (const client of this.lobbyClients) {
      sockets.push(client.socket);
    }
    return sockets;
  }

  private consumeUpgradeRateLimit(remoteAddress?: string) {
    if (this.upgradeRateLimitMax === 0) {
      return true;
    }

    const key = remoteAddress ?? 'unknown';
    const now = Date.now();
    const bucket = this.upgradeRateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.upgradeRateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + this.upgradeRateLimitWindowMs,
      });
      return true;
    }

    bucket.count += 1;
    return bucket.count <= this.upgradeRateLimitMax;
  }

  private pruneRateLimitBuckets() {
    const now = Date.now();
    for (const [key, bucket] of this.upgradeRateLimitBuckets) {
      if (bucket.resetAt <= now) {
        this.upgradeRateLimitBuckets.delete(key);
      }
    }
  }

  private getNumberEnv(name: string, fallback: number) {
    const configured = Number(process.env[name]);
    if (Number.isFinite(configured) && configured >= 0) {
      return configured;
    }
    return fallback;
  }

  private notifyRoomConnectionCountChanged(
    roomCode: string,
    connectionCount: number,
  ) {
    this.roomConnectionCountListener?.(roomCode, connectionCount);
  }
}
