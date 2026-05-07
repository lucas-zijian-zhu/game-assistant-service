module.exports = {
  apps: [
    {
      name: 'avalon-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3000',
        AVALON_EMPTY_ROOM_CLOSE_DELAY_MS: '1800000',
        AVALON_FINISHED_ROOM_RETENTION_MS: '7200000',
        AVALON_HTTP_RATE_LIMIT_WINDOW_MS: '60000',
        AVALON_HTTP_RATE_LIMIT_MAX: '240',
        AVALON_WS_HEARTBEAT_INTERVAL_MS: '30000',
        AVALON_WS_UPGRADE_RATE_LIMIT_WINDOW_MS: '60000',
        AVALON_WS_UPGRADE_RATE_LIMIT_MAX: '120',
      },
    },
  ],
};
