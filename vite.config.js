import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works from any sub-path (GitHub Pages serves /<repo>/)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200, // three.js alone is ~600 kB; this is a single-page demo
  },
  test: {
    environment: "node",
  },
});
