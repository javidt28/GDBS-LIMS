import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    hookTimeout: 180000,
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
