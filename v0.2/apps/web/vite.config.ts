import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// v0.2 web is the canonical "latest" build, served at the site root in
// production behind Caddy. The dev server runs at :5174 and proxies /api/*
// to the v0.2 API on :3002. Caddy fronts everything on :8080 in local dev.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
});
