import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve("src") } },
  test: { environment: "jsdom", setupFiles: ["src/test/setup.ts"], css: true }
});
