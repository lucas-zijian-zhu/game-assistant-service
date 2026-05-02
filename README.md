# Game Assistant Service

NestJS backend for the Avalon assistant MVP.

## Runtime

- HTTP API: `/api`
- Room WebSocket: `/ws/rooms/{roomCode}?playerId={playerId}`
- API document: [docs/avalon-api.md](docs/avalon-api.md)

Current storage is in memory. Rooms and games are lost when the process restarts.

## Local Development

```bash
npm install
npm run start:dev
```

Default local address:

```text
http://localhost:3000
ws://localhost:3000/ws/rooms/{roomCode}?playerId={playerId}
```

Useful checks:

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

## Environment Variables

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket listen port |
| `HOST` | `0.0.0.0` | Listen host. Keep `0.0.0.0` for Docker and cloud deployment |
| `AVALON_EMPTY_ROOM_CLOSE_DELAY_MS` | `60000` | Auto-close delay after all room WebSocket connections disconnect |

## Docker Deployment

Build the image:

```bash
docker build -t avalon-api .
```

Run the container:

```bash
docker run -d \
  --name avalon-api \
  -p 3000:3000 \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e AVALON_EMPTY_ROOM_CLOSE_DELAY_MS=60000 \
  avalon-api
```

Check logs:

```bash
docker logs -f avalon-api
```

Restart:

```bash
docker restart avalon-api
```

Stop and remove:

```bash
docker stop avalon-api
docker rm avalon-api
```

## Docker Compose

Create `docker-compose.yml` on the server if you prefer compose:

```yaml
services:
  avalon-api:
    image: avalon-api
    container_name: avalon-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      HOST: "0.0.0.0"
      AVALON_EMPTY_ROOM_CLOSE_DELAY_MS: "60000"
```

Then run:

```bash
docker compose up -d
```

## Package Locally, Run With PM2

Use this path when the server is too small to install Git or build dependencies. Do not package `node_modules` directly from macOS for a Linux server. Build a Linux runtime bundle locally through Docker instead.

Create the runtime tarball on your Mac:

```bash
chmod +x scripts/package-runtime.sh
./scripts/package-runtime.sh
```

This creates:

```text
avalon-runtime.tar.gz
```

Upload it to the server:

```bash
scp avalon-runtime.tar.gz user@server:/opt/avalon/
```

On the server:

```bash
cd /opt/avalon
tar -xzf avalon-runtime.tar.gz
```

Install PM2 if it is not already installed:

```bash
npm install -g pm2
```

Start the service:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Check logs:

```bash
pm2 logs avalon-api
```

Restart after uploading a new package:

```bash
pm2 restart avalon-api
```

The PM2 config listens on `HOST=0.0.0.0` and `PORT=3000` by default. Change [ecosystem.config.cjs](ecosystem.config.cjs) before packaging if the server needs a different port.

## Build Directly On A Small Server

This is possible, but it is riskier on a 1GB RAM server. If you do it, limit Node memory and install with npm:

```bash
export NODE_OPTIONS="--max-old-space-size=384"
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
```

If install or build is killed by the OS, use the local Docker packaging flow above instead.

## Nginx Reverse Proxy

If the API is exposed through a domain, configure WebSocket upgrade headers.

Example:

```nginx
server {
  server_name api.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Frontend configuration after HTTPS is enabled:

```text
API_BASE_URL=https://api.example.com/api
WS_URL=wss://api.example.com/ws/rooms/{roomCode}?playerId={playerId}
```

## Production Notes

- Use HTTPS and `wss://` in production.
- The current MVP has no login token. `playerId` is still client-provided.
- Current state is in process memory. Use Redis or a database before relying on server restarts, multi-instance deployment, or long-running rooms.
