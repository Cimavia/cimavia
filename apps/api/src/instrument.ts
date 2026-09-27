import * as Sentry from "@sentry/nestjs";
import { sentryOptions } from "./observability/sentry.config";

// Ce fichier DOIT être importé en premier dans main.ts — avant tout autre import
// Sentry instrumente les modules Node.js au chargement
// Si NestJS est chargé avant, certaines intégrations (Prisma, HTTP) ne fonctionneront pas

// Lecture du .env par Node (natif depuis 20.12) plutôt que par dotenv : ce fichier s'exécute
// AVANT NestJS, donc avant ConfigModule, et doit lire SENTRY_DSN par lui-même. dotenv était une
// devDependency — en image de production (install --prod) l'import échouait et l'API ne démarrait
// pas du tout, le crash tombant sur le tout premier import de main.ts.
// Le try/catch est le cœur du sujet : en conteneur il n'y a PAS de .env (les variables viennent
// de l'environnement), et `loadEnvFile` lève ENOENT. L'absence du fichier est le cas normal en
// production, pas une erreur. Même sémantique que dotenv : une variable déjà définie n'est pas
// écrasée par le fichier.
try {
  process.loadEnvFile();
} catch {
  // Pas de .env : les variables sont déjà dans l'environnement (conteneur, CI).
}

Sentry.init(sentryOptions());
