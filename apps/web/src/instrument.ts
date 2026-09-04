import * as Sentry from "@sentry/react";

// Ce fichier DOIT être importé en PREMIER dans main.tsx — même rôle et même raison que son
// homologue `apps/api/src/instrument.ts`.
//
// #181 le plaçait dans le corps de main.tsx, « avant createRoot ». Ça n'aurait pas tenu sa
// promesse : les imports statiques sont hoistés, si bien que TOUT le graphe de modules
// (`./shared/lib/i18n`, les tokens, le routeur) est évalué AVANT la première ligne du corps. Une
// erreur levée à l'initialisation d'un de ces modules — le trou que #181 nomme lui-même et dont
// il annonce que « Sentry le capturera » — serait partie sans SDK pour l'entendre. Un module à
// part, importé en tête, est ce qui rend cette phrase vraie.
//
// Un DSN absent laisse le SDK INERTE plutôt que de faire échouer le démarrage : en dev on ne
// configure rien et l'app doit marcher pareil. C'est aussi ce qui distingue cette variable de
// VITE_API_URL, dont l'absence livrerait un SPA cassé.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,

  // Le TIER de déploiement, pas le mode de build : `import.meta.env.MODE` vaut `production` sur le
  // NAS ET en prod, et taguerait les deux pareil. Même sémantique et même défaut que l'`APP_ENV`
  // de l'API et que le schéma de @cmv/shared (`env.schema.ts`).
  environment: (import.meta.env.VITE_APP_ENV as string | undefined) || "development",

  // `false` là où l'API est à `true` (#183) : le front n'a aucune raison d'envoyer l'IP ni les
  // en-têtes du navigateur. L'identité tient dans le seul `id` posé par `Sentry.setUser` — un
  // pseudonyme, qui ne redevient une personne qu'en base, chez nous.
  sendDefaultPii: false,

  // Erreurs seulement. Le quota de performance se vide bien plus vite depuis un navigateur que
  // depuis l'API, et aucune question de perf front n'est ouverte — à monter à 0.1 le jour où il y
  // en a une (#183).
  tracesSampleRate: 0,
});
