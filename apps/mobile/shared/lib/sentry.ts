import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/**
 * Remontée des erreurs non maîtrisées. Importé en side-effect depuis `app/_layout.tsx`, comme
 * `notification.ts` et `audio.ts` : c'est une configuration globale, pas un effet de composant.
 *
 * Un DSN absent laisse le SDK INERTE plutôt que de faire échouer le démarrage — en dev on ne
 * configure rien et l'app doit marcher pareil. `EXPO_PUBLIC_` dit exactement ce que ce DSN est :
 * inliné dans le bundle, donc lisible par quiconque ouvre le binaire. Ce n'est pas un secret.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * L'environnement vient d'`expo-constants`, pas de `process.env`.
 *
 * `APP_VARIANT` existe déjà et porte exactement la bonne notion — le TIER de déploiement, comme
 * l'`APP_ENV` de l'API — mais il n'est **pas lisible à l'exécution** : `app.config.ts` s'exécute
 * dans Node au moment du bundling, et Metro n'inline que les variables préfixées `EXPO_PUBLIC_`.
 * Un `process.env.APP_VARIANT` ici rendrait `undefined`, et TOUS les événements seraient tagués
 * `development` — y compris ceux de la production, en silence.
 *
 * Inventer une `EXPO_PUBLIC_APP_ENV` de plus serait l'autre voie, et la mauvaise : deux sources de
 * vérité pour la même notion, qui divergeraient au premier profil EAS ajouté.
 */
const environment =
  (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? "development";

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,
  environment,

  // `false` là où l'API est à `true` (#183) : le téléphone n'a aucune raison d'envoyer son IP.
  // L'identité tient dans le seul `id` posé par `Sentry.setUser` — un pseudonyme, qui ne redevient
  // une personne qu'en base, chez nous.
  sendDefaultPii: false,

  // Erreurs seulement. Le quota de performance se vide bien plus vite depuis un téléphone que
  // depuis l'API, et aucune question de perf mobile n'est ouverte (#183).
  tracesSampleRate: 0,
});
