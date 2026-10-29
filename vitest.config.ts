import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Les modules serveur importent "server-only" ; neutralisé en test.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://MAC@localhost:5432/vamos_gestion_test?schema=public" },
  },
});
