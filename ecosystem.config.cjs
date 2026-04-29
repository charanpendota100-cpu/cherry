module.exports = {
  apps: [
    {
      name: "wa-backend-pro",
      script: "backend/server.cjs",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1600M",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        DAILY_LIMIT: 500,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      node_args: "--expose-gc",
    },
  ],
};
