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
      // Sans ça, le générateur prend `__root.test.tsx` pour une route, avertit qu'elle n'exporte
      // pas de `Route` et invite à la préfixer d'un tiret — un fichier de test renommé pour
      // satisfaire un générateur de routes, alors qu'il est à sa place à côté de ce qu'il teste.
      routeFileIgnorePattern: String.raw`\.test\.tsx?$`,
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
