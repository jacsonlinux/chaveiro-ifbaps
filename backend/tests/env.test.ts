import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAppConfig, parseDotEnv, publicConfig } from "../src/config/env.js";

describe("env config", () => {
  it("parses dotenv content without requiring external packages", () => {
    expect(
      parseDotEnv(`
        # comment
        PORT=3010
        export SUAP_RESERVATION_PROVIDER=web-readonly
        QUOTED="value with spaces"
      `)
    ).toEqual({
      PORT: "3010",
      SUAP_RESERVATION_PROVIDER: "web-readonly",
      QUOTED: "value with spaces"
    });
  });

  it("publishes only non-secret configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), "keychain-env-"));
    const envPath = join(dir, ".env");
    writeFileSync(
      envPath,
      [
        "SUAP_URL=https://suap.example.edu.br",
        "SUAP_URL_LOGIN=https://suap.example.edu.br/accounts/login/",
        "SUAP_USERNAME=credential-login",
        "SUAP_PASSWD=credential-password"
      ].join("\n")
    );

    try {
      const config = createAppConfig({
        EXTERNAL_ENV_PATH: envPath,
        SUAP_RESERVATION_PROVIDER: "local"
      });
      const safe = publicConfig(config);

      expect(safe).toMatchObject({
        externalEnvLoaded: true,
        reservationProvider: "local",
        suap: {
          webLoginConfigured: true,
          passwordConfigured: true
        }
      });
      expect(JSON.stringify(safe)).not.toContain("credential-login");
      expect(JSON.stringify(safe)).not.toContain("credential-password");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
