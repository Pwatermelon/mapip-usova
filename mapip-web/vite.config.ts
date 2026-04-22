import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const core = process.env.VITE_DEV_CORE_PROXY || "http://127.0.0.1:8000";
const routing = process.env.VITE_DEV_ROUTING_PROXY || "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: core, changeOrigin: true },
      "/GetSocialMapObject": { target: core, changeOrigin: true },
      "/routing": {
        target: routing,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/routing/, "") || "/",
      },
    },
  },
});
