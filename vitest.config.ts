import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      // loaded from .env.test automatically by vitest
    },
    setupFiles: ["./tests/setup.ts"],
  },
});
