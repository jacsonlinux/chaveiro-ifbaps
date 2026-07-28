export default {
  apps: [
    {
      name: "keychain-ifbaps-backend",
      script: "dist/main.js",
      cwd: "/opt/keychain-ifbaps/backend",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        EXTERNAL_ENV_PATH: "/etc/keychain-ifbaps/.env"
      }
    }
  ]
};
