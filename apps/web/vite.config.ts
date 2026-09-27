import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import react from "@vitejs/plugin-react";
import { type Connect, defineConfig, loadEnv, type Plugin } from "vite";

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
 * variable.
 *
 * Depuis #186, le workflow y met `1.2.0+3f2a1c` — et surtout PAS la version seule, contrairement à
 * ce que cette ligne annonçait. Le code change à CHAQUE push sur `main` alors que le numéro n'avance
 * qu'au merge de la PR de release : deux bundles d'états différents porteraient alors le même nom
 * de release, et le dernier téléversement de sourcemaps écraserait les précédents.
 * L'unminification désignerait le mauvais code sans rien dire — exactement la panne contre laquelle
 * le garde-fou ci-dessous a été écrit.
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
        // Même principe, APRÈS le build (#474) : un téléversement qui échoue fait échouer le build.
        // Sans ce gestionnaire, le plugin journalise l'échec de la release et du téléversement puis
        // continue — contrairement à ce que dit sa doc. C'est ainsi que les sourcemaps ne sont
        // jamais parties, derrière des builds tous verts.
        errorHandler: (err) => {
          throw err;
        },
      }
    : { disable: true };

/**
 * `/config.js` en dev et en `vite preview` : ce que le conteneur nginx sert en déploiement, depuis
 * son environnement (#417). Les mêmes noms `CMV_*`, lus dans `apps/web/.env` — un seul vocabulaire
 * du poste au NAS. Relu à CHAQUE requête : modifier `.env` puis recharger la page suffit.
 *
 * Une variable absente part VIDE, pas remplacée : `runtime-config.ts` la lit comme absente et l'app
 * affiche l'écran de crash, exactement comme un conteneur mal configuré. Pas de `public/config.js` :
 * il partirait dans `dist`, donc dans l'image.
 */
function runtimeConfigPlugin(): Plugin {
  const serve =
    (mode: string, envDir: string): Connect.NextHandleFunction =>
    (_req, res) => {
      const env = loadEnv(mode, envDir, "CMV_");
      const config = {
        apiUrl: env.CMV_API_URL ?? "",
        sentryDsn: env.CMV_SENTRY_DSN ?? "",
        tier: env.CMV_APP_ENV ?? "",
      };
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache");
      res.end(`window.__CMV_CONFIG__ = ${JSON.stringify(config)};\n`);
    };

  return {
    name: "cmv-runtime-config",
    configureServer(server) {
      server.middlewares.use("/config.js", serve(server.config.mode, server.config.envDir || "."));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/config.js", serve(server.config.mode, server.config.envDir || "."));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeConfigPlugin(),
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
