import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.mjs"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
