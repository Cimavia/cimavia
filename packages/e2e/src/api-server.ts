import { envSchema } from "@cmv/shared";

/**
 * L'API de test des parcours — web (#627) et mobile (#638) : construite, démarrée sur son port et
 * sa base, puis arrêtée avec la suite. Chaque app la déclare en `webServer` de sa config Playwright.
 *
 * Aucun secret : ces valeurs décrivent des conteneurs et des processus qui ne vivent que le temps
 * d'une suite, comme `apps/api/.env.test.example`.
 */

/**
 * Le secret Better Auth de l'API de test. Exporté parce que le seed en a besoin (#270) : il fabrique
 * le jeton de vérification d'adresse comme l'API l'aurait mis dans l'e-mail, faute d'en recevoir.
 */
export const AUTH_SECRET = "test-secret-not-for-production-0123456789abcdef";

/**
 * Toutes les variables que l'API lit, posées VIDES. `ConfigModule` et `instrument.ts` chargent
 * `apps/api/.env` pour toute variable que le process ne pose pas : sur un poste, l'API de test
 * partirait sinon avec le DSN Sentry, le jeton Axiom et le SMTP du développeur. Une variable vide
 * l'emporte sur le fichier, et le schéma la lit comme absente.
 *
 * Tirées du schéma, pas listées à la main : une variable ajoutée à l'API est neutralisée ici sans
 * que personne ait à y penser.
 */
const BLANK_ENV = Object.fromEntries(Object.keys(envSchema.shape).map((key) => [key, ""]));

export type TestApiOptions = {
  port: number;
  /** Une base À ELLE, dont le nom finit par `_e2e` : `prepare-database.mjs` la vide. */
  databaseUrl: string;
  /** Les origines que l'app testée présente : l'URL du web, ou le scheme de l'app mobile. */
  origins: readonly string[];
  /** En CI, les logs de l'API vont dans ceux du job ; en local, ils noieraient le reporter. */
  ci: boolean;
};

/**
 * L'entrée `webServer` de l'API de test. Son `cwd` est `../api` : les configs Playwright vivent à la
 * racine de leur app (`apps/web`, `apps/mobile`), et Playwright le résout depuis leur dossier.
 */
export function testApiServer({ port, databaseUrl, origins, ci }: TestApiOptions) {
  const url = `http://localhost:${port}`;
  return {
    // La base d'abord : l'API ne démarre que sur une base créée, migrée et vidée. Puis le build
    // par Turbo, qui construit `@cmv/shared` d'abord — l'API le lit depuis son `dist`.
    command:
      "node ../../packages/e2e/prepare-database.mjs && pnpm turbo build --filter=@cmv/api --output-logs=errors-only && node dist/main.js",
    cwd: "../api",
    url: `${url}/health`,
    env: {
      ...BLANK_ENV,
      NODE_ENV: "test",
      APP_ENV: "development",
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: AUTH_SECRET,
      BETTER_AUTH_URL: url,
      CORS_ORIGINS: origins.join(","),
      // Les parcours inscrivent leurs comptes sans invitation, comme la suite d'isolation. Sans
      // storage (`S3_*` vides), l'API démarre et ses routes médias répondent 503 : aucun parcours
      // n'en a besoin.
      SIGNUP_MODE: "open",
    },
    /**
     * JAMAIS de réutilisation d'un serveur déjà là : une API restée sur son port tournerait sur du
     * code périmé. Le port pris fait échouer la suite en le nommant, ce qui vaut mieux qu'un
     * parcours qui teste autre chose que ce qu'il croit.
     */
    reuseExistingServer: false,
    timeout: 180_000,
    // Les logs de l'API dans ceux du job : sans eux, un 500 du jeu de données n'a ni pile ni
    // contexte.
    stdout: ci ? ("pipe" as const) : ("ignore" as const),
  };
}
