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
      },
    },
  ],
};
