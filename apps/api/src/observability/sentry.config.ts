import * as Sentry from "@sentry/nestjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { scrubEvent } from "./sentry-scrub";

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/**
 * Les options de `Sentry.init`, hors de `instrument.ts` pour être testées sur ce qu'elles
 * produisent — un événement émis par le vrai SDK — et pas sur leur valeur.
 *
 * `instrument.ts` s'exécute AVANT NestJS, donc avant ConfigModule/Zod : on lit l'environnement
 * directement, avec les mêmes défauts que le schéma (@cmv/shared).
 */
export function sentryOptions(env: NodeJS.ProcessEnv = process.env): SentryOptions {
  /**
   * Nom de release Sentry : ce qui rattache une erreur à un état du produit. Sans lui, aucune issue
   * n'est attribuable à une version — impossible de dire si un bug est déjà corrigé.
   *
   * `1.2.0+3f2a1c` et NON `1.2.0` nu. `api-image.yml` publie une image à CHAQUE push sur `main`, alors
   * que le numéro, lui, ne bouge qu'au merge de la PR de release : plusieurs builds différents
   * porteraient donc la même release. Sur le web, où des sourcemaps sont téléversées sous ce nom, le
   * dernier envoi gagne et l'unminification désigne le mauvais code — en silence. Ici l'API n'en
   * téléverse pas, mais le nom doit vouloir dire la même chose des deux côtés.
   *
   * Les deux moitiés vont ENSEMBLE : le workflow les injecte d'un bloc, et une identité amputée de
   * son build n'identifie plus un build. À défaut, `undefined` — Sentry range l'erreur sans version,
   * ce qui est vrai, plutôt que sous un numéro inventé (règle dure n°5).
   */
  const release =
    env.APP_VERSION && env.APP_BUILD ? `${env.APP_VERSION}+${env.APP_BUILD}` : undefined;

  return {
    // Le DSN identifie ton projet Sentry — vide en dev si SENTRY_DSN non configuré
    dsn: env.SENTRY_DSN || undefined,

    integrations: [
      // Profiling continu — flamegraphs de performance dans Sentry
      nodeProfilingIntegration(),
      // Le corps des requêtes n'est JAMAIS lu (#433). Par défaut Sentry en garde 10 ko, attachés à
      // tout événement de la requête, transactions échantillonnées comprises : le mot de passe
      // d'une connexion, le jeton d'une réinitialisation, le code d'une invitation, le texte d'un
      // débrief. Couper partout plutôt que sur `/api/auth/*` seulement : une liste d'exceptions
      // s'oublie à la prochaine route sensible, et une 500 se rejoue avec sa stack sans son corps.
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
    ],

    // Taux d'échantillonnage des transactions de performance
    // 1.0 = 100% des transactions en dev pour tout voir
    // En prod : 0.1 (10%) pour réduire le volume
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,

    // Taux d'échantillonnage du profiling (subset des transactions tracées)
    profilesSampleRate: 1,

    // Environnement — apparaît dans le dashboard Sentry pour filtrer les issues. On lit APP_ENV
    // (le TIER de déploiement), pas NODE_ENV (le MODE runtime) : sur le NAS comme en prod l'image
    // tourne en NODE_ENV=production, donc s'y fier taguerait preview ET prod comme "production".
    environment: env.APP_ENV || "development",
    release,
    enabled: !!env.SENTRY_DSN,

    // IP et en-têtes, assumés en #183 — mais ni cookies, ni en-têtes secrets, ni jetons d'URL, que
    // `scrubEvent` retire des erreurs COMME des transactions (#433).
    sendDefaultPii: true,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  };
}
