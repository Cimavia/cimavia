import { resolve } from "node:path";
import { currentWorktree, worktreeDatabaseUrl, worktreePort } from "@cmv/e2e";

/**
 * L'environnement des parcours mobiles (#638) : une API JETABLE, à eux, sur une base à eux, et la
 * build `e2e` de l'app, qui la vise.
 *
 * Rien n'est partagé avec les autres suites : celle de l'API vide `cimavia_db_e2e`, celle du web
 * `cimavia_db_web_e2e`. Le conteneur, lui, est le même (`docker-compose.test.yml`, port 5434).
 */

/** Un worktree lié prend son port et sa base (#630), comme les autres suites e2e. */
const worktree = currentWorktree();

/**
 * Après ceux du web (3101-3150, un par worktree) : 3151-3200. Le port est INLINÉ dans la build —
 * une APK construite dans un worktree vise l'API de ce worktree, et `global-setup.ts` refuse d'en
 * installer une construite pour un autre.
 */
export const API_PORT = worktreePort(3151, worktree);
export const API_URL = `http://localhost:${API_PORT}`;

/**
 * L'adresse de l'API vue de l'appareil : son `localhost`, que `adb reverse` relie à celui de la
 * machine qui porte le serveur adb. Le même chemin vaut pour l'émulateur de la CI, celui d'un poste
 * Windows piloté depuis WSL, et un téléphone branché en USB — là où `10.0.2.2` ne vaut que pour un
 * émulateur, sur la machine même de l'API.
 */
export const DEVICE_API_URL = API_URL;

/**
 * Le suffixe `_e2e` n'est pas décoratif : `prepare-database.mjs` VIDE cette base, et refuse d'en
 * toucher une qui ne l'annonce pas jetable.
 */
export const DATABASE_URL = worktreeDatabaseUrl(
  "postgresql://cimavia_e2e:cimavia_dev_e2e@localhost:5434/cimavia_db_mobile_e2e",
  worktree,
);

/** L'identifiant et l'origine de la variante `e2e` (`app.config.ts`). */
export const APP_ID = "fr.cimavia.app.e2e";
export const APP_ORIGIN = "cimavia-e2e://";

/** Le fuseau des parcours, celui du seed (`todayInParis`) : l'appareil doit être réglé dessus. */
export const TIME_ZONE = "Europe/Paris";

/**
 * `__dirname` et non `import.meta.dirname` : le mobile n'est pas `"type": "module"` (Metro et ses
 * configs `.js` sont en CommonJS), et Playwright charge donc ces fichiers en CommonJS.
 */
export const MOBILE_DIR = resolve(__dirname, "../..");
export const ANDROID_DIR = resolve(MOBILE_DIR, "android");
export const FLOWS_DIR = resolve(MOBILE_DIR, "e2e/flows");

/**
 * Hors de `android/`, que la build rend au dev client : l'APK e2e, et le temps de la build, le
 * `android/` du dev client mis de côté. Sous `node_modules/.cache`, que git ignore déjà.
 */
const CACHE_DIR = resolve(MOBILE_DIR, "node_modules/.cache/cmv-e2e");
export const APK = resolve(CACHE_DIR, "app-e2e.apk");
export const PARKED_ANDROID_DIR = resolve(CACHE_DIR, "android-dev-client");

/** Rangé à côté de l'APK : l'URL d'API qu'elle a inlinée, relue avant de l'installer. */
export const BUILD_STAMP = `${APK}.api-url`;
