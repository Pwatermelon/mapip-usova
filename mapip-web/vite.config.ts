import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const core = process.env.VITE_DEV_CORE_PROXY || "http://127.0.0.1:8000";
const routing = process.env.VITE_DEV_ROUTING_PROXY || "http://127.0.0.1:8080";
const flask = process.env.VITE_DEV_FLASK_PROXY || "http://127.0.0.1:5001";
const basePath = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: core, changeOrigin: true },
      "/client": { target: core, changeOrigin: true },
      "/GetSocialMapObject": { target: core, changeOrigin: true },
      "/routing": {
        target: routing,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/routing/, "") || "/",
      },
      "/comments": { target: flask, changeOrigin: true },
      "/recommendations": { target: flask, changeOrigin: true },
      "/mapip/api": { target: core, changeOrigin: true, rewrite: (p) => p.replace(/^\/mapip/, "") || "/" },
      "/mapip/client": { target: core, changeOrigin: true, rewrite: (p) => p.replace(/^\/mapip/, "") || "/" },
      "/mapip/GetSocialMapObject": {
        target: core,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mapip/, "") || "/",
      },
      "/mapip/routing": {
        target: routing,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mapip\/routing/, "") || "/",
      },
      "/mapip/comments": {
        target: flask,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mapip/, "") || "/",
      },
      "/mapip/recommendations": {
        target: flask,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mapip/, "") || "/",
      },
    },
  },
});
