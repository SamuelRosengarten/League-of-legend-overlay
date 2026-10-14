import { defineConfig } from "vite";

// Images dropped into the project root (art references) must not be watched: a file still
// being written there crashed the dev server with EBUSY.
const root = process.cwd().replaceAll("\\", "/");

// Tauri expects a fixed dev port and must not have its terminal output cleared.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", `${root}/*.{png,jpg,jpeg,webp}`] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
} as never);
