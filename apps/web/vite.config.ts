import path from "node:path";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@cmv/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
      "@cmv/tokens": path.resolve(import.meta.dirname, "../../packages/tokens/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
