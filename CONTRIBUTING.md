# Contribuer à cimavia

Workflow de développement et conventions opérationnelles. Pour les règles
d'architecture, voir `docs/architecture-choice.md`.

## Git flow (GitLab Flow)

Merge unidirectionnel `feature/* → main → staging → production` (jamais en sens inverse).

- `main` : branche de dev, **protégée** (ruleset « Main ») — PR obligatoire, les trois checks
  ci-dessous verts requis, commits signés, ni force-push ni suppression. Le push direct, autorisé
  jusqu'en #130, ne l'est plus : une porte qu'on peut contourner ne garde rien.
- `staging` / `production` : cibles de promotion **protégées** (ruleset « Production ») — mêmes
  exigences, plus l'historique linéaire.

CI (`.github/workflows/`) :

- `ci.yml`, job **`Lint + Typecheck + Test`** — Biome, `turbo typecheck test`, `check:i18n`.
- `ci.yml`, job **`E2E (isolation multi-tenant)`** — les 268 e2e de l'API, contre un Postgres et
  un MinIO jetables montés par les composes du dépôt. Ils portent la couverture réelle de la couche
  API (~89 %) : ses douze tests unitaires n'en couvrent que 3,5 %. Bloquant.
- `ci.yml`, job **`SonarCloud Analysis`** — qualité, sécurité et **couverture des quatre paquets**
  (`@cmv/shared`, API, web, mobile). Rapatrié depuis `sonar.yml` en #57 : Sonar veut tous les lcov
  dans UN scan, or celui des e2e naît dans le job ci-dessus — les mettre dans le même run rend
  l'ordre déterministe, là où un artefact ne traverse pas deux workflows sans course.
  Le job **échoue si la Quality Gate échoue** (`sonar.qualitygate.wait`) : sans cette option il
  sortait en 0 quoi que dise la porte, et ne vérifiait donc que l'envoi du scan.

Les trois tournent sur push/PR vers `main`, `staging`, `production`.

> Ces libellés sont ceux des **jobs**, et c'est sous ce nom exact que les rulesets les exigent —
> pas sous le nom du workflow. Renommer un job décroche donc la porte qui le référence : le check
> requis n'arrive jamais et la PR reste bloquée sur « Waiting for status to be reported ». Toute
> renommage se répercute dans les deux rulesets (Settings → Rules).

## Commits

Convention **Conventional Commits**, sujet en minuscule (vérifié par commitlint).

### Commits signés (SSH)

`main` (et la promotion) exige des signatures vérifiées. Config locale, une fois :

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/<ta_clé>.pub
git config --global commit.gpgsign true

git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Puis ajouter la clé publique sur GitHub en **Signing Key** (Settings → SSH and GPG keys).

## Secrets et variables GitHub Actions (Settings → Secrets and variables → Actions)

**Secrets** — ce que seule la CI doit connaître :

- `SONAR_TOKEN` — SonarCloud.
- `REMINDER_TICK_SECRET` — authentifie le tick des rappels auprès de l'API (`reminder-tick.yml`).
- `SENTRY_AUTH_TOKEN` — téléversement des sourcemaps web (#181). C'est un jeton d'**organisation** : un seul suffit pour les trois projets Sentry, et c'est le **même** qui sert au mobile, posé là-bas en variable d'environnement EAS. Le seul secret Sentry du dépôt — il n'est jamais embarqué dans un artefact.

**Variables** (onglet *Variables*), pas des secrets — elles partent dans le bundle ou ne sont que des noms, les protéger donnerait l'illusion d'une protection qui n'existe pas :

- `DEV_ENV_FILE` — chemin du `.env` sur le NAS · `DEV_PUBLIC_API_URL` — l'URL publique de l'API du tier dev.
- `DEV_SENTRY_DSN_WEB` — le DSN du projet web, lisible par tout visiteur du site.
- `SENTRY_ORG` — le slug de l'organisation Sentry.
- `SENTRY_PROJECT_WEB` — `cimavia-web`.

**Ce qui n'est PAS ici**, contrairement à ce que cette section a longtemps affirmé : `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SENTRY_DSN`, `AXIOM_TOKEN`, `AXIOM_DATASET`. Ce sont des variables d'**exécution** de l'API, interpolées par `deploy/dev/docker-compose.yml` depuis le `.env` qui vit sur le NAS — GitHub Actions ne les voit jamais. Le DSN du mobile non plus : il est dans `apps/mobile/eas.json`, les builds EAS partant du poste de développement et non d'un workflow.

## Observabilité

**Trois projets Sentry** — `cimavia-api`, `cimavia-web`, `cimavia-mobile` (#183). Releases et sourcemaps s'attachent par projet : mêler un bundle Vite et un bundle Hermes dans un seul projet rendrait l'unminification hasardeuse.

### API

- Logs structurés **pino → Axiom** : transport actif dès que `AXIOM_TOKEN` + `AXIOM_DATASET` sont définis. `AXIOM_URL` selon la région du dataset (EU par défaut).
- Erreurs **Sentry** (`SENTRY_DSN`) : init dans `apps/api/src/instrument.ts` (1er import) + `SentryExceptionFilter` global, qui ne remonte que les erreurs *inattendues* — une `HttpException` (4xx, 503 de santé) est ignorée.
- Variables d'environnement : voir `apps/api/.env.example`.

### Web

- Init dans `apps/web/src/instrument.ts`, **premier import** de `main.tsx` : les imports statiques sont hoistés, donc une init placée dans le corps de `main.tsx` arriverait après l'évaluation de tout le graphe de modules et n'entendrait pas ce qui y casse.
- Écran de repli : `defaultErrorComponent` du routeur → `CmvCrashScreen`. Sa portée s'arrête au routeur — ce qui casse au-dessus (les providers, l'import d'i18n) tombe à l'écran blanc, mais part quand même chez Sentry.
- Identité : `useSentryUser()` dans `routes/__root.tsx`, l'`id` du compte seul, effacé à la déconnexion. `sendDefaultPii: false` côté front, contrairement à l'API.
- Variables, **figées au `vite build`** (voir `apps/web/.env.example` et le `Dockerfile`) : `VITE_SENTRY_DSN` — pas un secret, il part dans le bundle — et `VITE_APP_ENV`, le *tier* de déploiement et non le mode de build.
- Sourcemaps : téléversées par `@sentry/vite-plugin` quand `SENTRY_AUTH_TOKEN` est fourni, puis effacées de `dist/` avant l'étape nginx. Le jeton passe par un **secret BuildKit** et jamais un `ARG`, qui le graverait dans `docker history` de l'image publiée. `SENTRY_RELEASE` est passé explicitement : `.git` est hors du contexte de build, la détection automatique n'aurait rien à lire.

### Mobile

- Init dans `apps/mobile/shared/lib/sentry.ts`, importé en side-effect en tête de `app/_layout.tsx` — même forme que `notification.ts` et `audio.ts`.
- Écran de repli : export nommé `ErrorBoundary` depuis `app/_layout.tsx` (mécanisme natif d'expo-router, pas un boundary maison) → `CmvCrashScreen`. Il enveloppe le layout ENTIER, providers compris — un boundary posé autour du seul `<Stack>` serait resté à l'intérieur des quatre providers du layout.
- Identité : `useSentryUser()` appelé dans `RootLayout`, l'`id` du compte seul, effacé à la déconnexion — l'effacement compte plus qu'au web, la session mobile survivant à la fermeture de l'app (`expo-secure-store`).
- Variables : `EXPO_PUBLIC_SENTRY_DSN`, inlinée dans le bundle par Metro — pas un secret, déclarée par profil dans `eas.json` comme `EXPO_PUBLIC_API_URL`. L'environnement, lui, ne se déclare PAS en variable : il vient d'`APP_VARIANT` via `extra.appVariant` (`app.config.ts`), relu par `expo-constants` — `process.env.APP_VARIANT` est invisible à l'exécution, Metro n'inlinant que les variables `EXPO_PUBLIC_`.
- Sourcemaps Hermes : téléversées automatiquement par le plugin `@sentry/react-native/expo` (organisation et projet déclarés dans `app.json` → `expo.plugins`, pas des secrets) au build EAS. Le jeton n'y figure JAMAIS — `eas.json` est versionné — il vient de `SENTRY_AUTH_TOKEN` posé en **secret EAS** (`eas secret:create --name SENTRY_AUTH_TOKEN --scope project`), lu automatiquement en son absence de la config du plugin.
- Vitest : `@sentry/react-native` importe des modules natifs, mocké dans `test/setup.ts` pour tous les tests — même garantie que l'`AsyncStorage` qui y est déjà mocké.
