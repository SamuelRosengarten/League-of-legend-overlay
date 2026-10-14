import { defineConfig } from "vite";

// Tauri expects a fixed dev port and must not have its terminal output cleared.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
} as never);
