module.exports = {
  apps: [
    {
      name: "keychain-ifbaps-backend",
      script: "dist/main.js",
      cwd: "/opt/keychain-ifbaps/backend",
      exec_mode: "fork",
      instances: 1,
      time: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        EXTERNAL_ENV_PATH: "/etc/keychain-ifbaps/.env",
        SUAP_ROOM_SCHEDULE_SYNC_ENABLED: "true",
        SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS: "7",
        SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS: "34",
      },
    },
    {
      name: "keychain-ifbaps-sync-worker",
      script: "dist/reservations/sync-worker.js",
      cwd: "/opt/keychain-ifbaps/backend",
      exec_mode: "fork",
      instances: 1,
      time: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        EXTERNAL_ENV_PATH: "/etc/keychain-ifbaps/.env",
        SUAP_ROOM_SCHEDULE_SYNC_ENABLED: "true",
        SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS: "7",
        SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS: "34",
      },
    },
  ],
};
