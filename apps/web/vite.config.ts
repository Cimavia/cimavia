import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Téléversement des sourcemaps à Sentry. Le JETON est le seul déclencheur : présent, on publie ;
 * absent, le plugin ne fait rien et `pnpm build` reste muet sur un poste de développement. Un build
 * qui exigerait un jeton pour aboutir casserait le poste de tout le monde.
 *
 * Le nom de release est passé EXPLICITEMENT, jamais deviné. Le plugin le déduirait de git
 * (`sentry-cli propose-version`) — mais `.git` est exclu du contexte de build par `.dockerignore`,
 * et l'étape `builder` de l'image n'en a donc aucun : la détection échouerait précisément là où le
 * seul build qui compte a lieu. Le plugin l'INJECTE aussi dans le bundle, si bien que le SDK le
 * rapporte tout seul — ce qui est téléversé et ce qui est signalé bougent ensemble, par cette
 * variable. C'est le point de raccord de #186, qui y mettra la version du produit à la place du sha.
 */
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_RELEASE = process.env.SENTRY_RELEASE;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

/**
 * On échoue TÔT plutôt que de publier sous un nom que personne ne rapportera : des sourcemaps
 * téléversées sous une release absente ou fausse laissent l'unminification silencieusement morte —
 * la panne qui ne se découvre qu'au premier crash en production, c'est-à-dire trop tard.
 */
if (SENTRY_AUTH_TOKEN && !(SENTRY_RELEASE && SENTRY_ORG && SENTRY_PROJECT)) {
  throw new Error(
    "SENTRY_RELEASE, SENTRY_ORG et SENTRY_PROJECT sont requis dès qu'un SENTRY_AUTH_TOKEN est fourni",
  );
}

const sentryOptions: Parameters<typeof sentryVitePlugin>[0] =
  SENTRY_AUTH_TOKEN && SENTRY_RELEASE && SENTRY_ORG && SENTRY_PROJECT
    ? {
        authToken: SENTRY_AUTH_TOKEN,
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        release: { name: SENTRY_RELEASE },
      }
    : { disable: true };

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
    // En DERNIER : le plugin lit les artefacts que les précédents ont produits.
    sentryVitePlugin(sentryOptions),
  ],
  build: {
    // Les `.map` sont produits pour être TÉLÉVERSÉS, pas servis : le Dockerfile les efface avant
    // l'étape nginx. Sans cette suppression, `COPY dist` publierait le source de l'app à la racine
    // du site.
    sourcemap: true,
  },
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
