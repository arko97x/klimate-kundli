import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at /0.1/ in production behind the repo-root Caddy proxy. Dev runs at
// the same base so fetch URLs derived from import.meta.env.BASE_URL match
// production. Caddy strips the /0.1 prefix when forwarding /0.1/api/* to the
// v0.1 server on :3001.
export default defineConfig({
  base: "/0.1/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/0.1/api": {
        target: "http://localhost:3001",
        rewrite: (p) => p.replace(/^\/0\.1/, ""),
      },
    },
  },
});
