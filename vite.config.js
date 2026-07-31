import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4175",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
