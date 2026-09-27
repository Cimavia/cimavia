import * as Sentry from "@sentry/react";
import { runtimeConfig } from "./shared/lib/runtime-config";
import { scrubEvent } from "./shared/lib/sentry-scrub";

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
// Le DSN et le tier viennent de `config.js`, servi par le conteneur au démarrage et chargé par
// `index.html` avant ce module (#417) : le même bundle part sur preview puis en production.
//
// Un DSN absent laisse le SDK INERTE plutôt que de faire échouer le démarrage : en dev on ne
// configure rien et l'app doit marcher pareil. Un tier absent aussi, mais pour une autre raison :
// il n'y a plus de défaut `development` (règle dure n°5), et un événement sans `environment` serait
// pire qu'aucun — il ne se filtrerait nulle part. L'app, elle, refusera de démarrer sans tier
// (`main.tsx`) : c'est l'écran de crash qui le dira, pas Sentry.
const { sentryDsn, tier } = runtimeConfig();
const dsn = tier === null ? null : sentryDsn;

Sentry.init({
  dsn: dsn ?? undefined,
  enabled: dsn !== null,

  // Le TIER de déploiement, pas le mode de build : `import.meta.env.MODE` vaut `production` sur le
  // NAS ET en prod, et taguerait les deux pareil. Même vocabulaire que l'`APP_ENV` de l'API.
  environment: tier ?? undefined,

  // `false` là où l'API est à `true` (#183) : le front n'a aucune raison d'envoyer l'IP.
  // L'identité tient dans le seul `id` posé par `Sentry.setUser` — un pseudonyme, qui ne redevient
  // une personne qu'en base, chez nous. Ce réglage ne couvre QUE l'IP : l'URL de la page, le
  // `Referer` et le `User-Agent` partent quand même (`httpContextIntegration`, par défaut).
  sendDefaultPii: false,

  // D'où `beforeSend` : l'URL et les fils d'Ariane peuvent porter un jeton de réinitialisation ou
  // une signature S3 (#335).
  beforeSend: scrubEvent,

  // Erreurs seulement. Le quota de performance se vide bien plus vite depuis un navigateur que
  // depuis l'API, et aucune question de perf front n'est ouverte — à monter à 0.1 le jour où il y
  // en a une (#183).
  tracesSampleRate: 0,
});
