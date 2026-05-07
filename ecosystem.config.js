module.exports = {
  apps: [
    {
      name: 'vkmotion',
      script: 'server.ts',
      interpreter: 'ts-node',
      interpreter_args: '--project tsconfig.server.json',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        DB_PATH: '/home/ubuntu/vkmotion/db/vkmotion.db',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
