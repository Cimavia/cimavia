import { currentWorktree, worktreeDatabaseUrl, worktreePort } from "@cmv/e2e";

/**
 * L'environnement des e2e navigateur : une API et un web JETABLES, à eux, sur une base à eux.
 *
 * Rien ici n'est partagé avec la suite e2e de l'API, qui vide `cimavia_db_e2e` à l'ouverture et
 * écoute sur 3001 : lancées ensemble, les deux suites se videraient la base l'une sous l'autre. Le
 * conteneur, lui, est le même (`docker-compose.test.yml`, port 5434) — une base de plus n'y coûte
 * rien, un conteneur de plus si.
 *
 * L'API elle-même, ses variables et son secret sont ceux de `@cmv/e2e/api-server`, partagés avec
 * les parcours mobiles (#638) : ce fichier n'en fixe que le port et la base.
 */

/**
 * Un worktree lié prend ses ports et sa base (#630), par le même module que les e2e de l'API : le
 * dépôt principal et la CI gardent les valeurs ci-dessous. Calculé à chaque chargement de la
 * config — Playwright la relit dans chaque worker — et toujours au même résultat.
 */
const worktree = currentWorktree();

/**
 * Des ports que rien d'autre ne prend : 3000 est l'API de dev, 3001-3100 les e2e de l'API (deux par
 * worktree), 5173 le web de dev, et 4173 le `vite preview` de n'importe qui.
 */
export const API_PORT = worktreePort(3101, worktree);
export const WEB_PORT = worktreePort(4310, worktree);

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * Le suffixe `_e2e` n'est pas décoratif : `prepare-database.mjs` VIDE cette base, et refuse d'en
 * toucher une qui ne l'annonce pas jetable (même garde que `apps/api/test/global-setup.e2e.ts`).
 */
export const DATABASE_URL = worktreeDatabaseUrl(
  "postgresql://cimavia_e2e:cimavia_dev_e2e@localhost:5434/cimavia_db_web_e2e",
  worktree,
);
