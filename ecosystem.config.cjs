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
        AVALON_EMPTY_ROOM_CLOSE_DELAY_MS: '60000',
      },
    },
  ],
};
