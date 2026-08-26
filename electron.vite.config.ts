import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve("electron/main/index.ts") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve("electron/preload/index.ts") } },
  },
  renderer: {
    root: ".",
    resolve: { alias: { "@": resolve("src") } },
    plugins: [react()],
    build: { rollupOptions: { input: resolve("index.html") } },
  },
});
