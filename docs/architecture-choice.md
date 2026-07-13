# Architecture choices — règles & conventions

Document vivant des choix architecturaux de **cimavia** (monorepo `api` + `mobile` + `web`). Chaque règle a été décidée explicitement et s'applique à toute nouvelle feature/contribution.

Glossaire métier : `CONTEXT.cimavia.md`. Préfixe composants : `Cmv`. Scope packages : `@cmv/*`.

---

## 1. Monorepo

```
apps/
  api/                # NestJS — modules par feature (cf. §2)
  mobile/             # Expo Router + NativeWind (cf. §3)
  web/                # React + Vite + TanStack (cf. §4)
packages/
  shared/             # @cmv/shared — types métier (DTO), schémas Zod, logique pure
  tokens/             # @cmv/tokens — design tokens (couleurs/spacing/typo)
  tsconfig/           # @cmv/tsconfig — configs TS de base
```

Règle de promotion : un type/une fonction utilisé par **2+ apps** monte dans un package (`@cmv/*`). Spécifique à une app → reste dans l'app.

---

## 2. Backend (`apps/api`, NestJS)

### Modules par feature
Un module par domaine métier : `auth/`, `account/` (users, rôles, relation coach↔athlète, fiche athlète), `exercise/`, `session/`, `plan/`, `feedback/`, `message/`, `invoice/`. Infra technique transverse à part : `infra/` (`prisma/`, `storage/`, `redis/` à venir).

### Accès données
- **Une seule instance `PrismaClient`**, partagée (et étendue, cf. §5). Adapter `@prisma/adapter-pg`.
- Pas de SQL brut hors migrations. `prisma migrate dev` doit fonctionner (BDD MVP = Neon free, Prisma-natif — ne pas réintroduire une BDD qui casse le shadow database).

### Configuration de l'app — **`app.setup.ts` (point unique)**
Tout ce qui configure l'app HTTP (pipe de validation global, CORS…) vit dans **`configureApp(app)`**, appelé par `main.ts` **ET** par les tests e2e.

> **Pourquoi c'est une règle et pas un détail** : `Test.createTestingModule()` **n'exécute pas `main.ts`**. Tout comportement câblé uniquement là (validation, CORS) est **absent des tests** — l'API testée n'est alors pas celle qui tourne en prod. Deux bugs réels en P2 : la validation Zod inactive en e2e, et un CORS refusant `PUT`/`PATCH`/`DELETE` en preflight (invisible en supertest, qui n'émet pas de preflight). Toute nouvelle config HTTP passe par `configureApp`, et est couverte par un e2e.

### Validation
- Toute entrée HTTP validée par **Zod** (`@cmv/shared`). DTO = schéma Zod + type inféré, **partagés** front/back. Pas de DTO redéfini côté app.
- **Les contraintes vivent dans le schéma**, pas dans le service : types MIME acceptés, tailles max, longueurs… Ainsi la règle est appliquée par le pipe (400 automatique) **et** réutilisable par le client (cf. `requestUploadUrlSchema`, `isAllowedDocumentMime`). Un contrôle réécrit dans un service est une duplication.
- Schéma non portable par une classe DTO (**union discriminée**) → `@Body(new ZodSchemaPipe(schema))` par route (une classe ne peut pas étendre un type union).
- `ConfigModule` + Zod valident l'environnement **au boot** : l'API refuse de démarrer si une variable manque/est mal typée.

### Observabilité
- `nestjs-pino` → Axiom (logs JSON structurés). `instrument.ts` = **1er import** de `main.ts`. `SentryExceptionFilter` custom. Pas de `console.*` : Sentry/Pino sont les canaux.

---

## 3. Mobile (`apps/mobile`, Expo Router + NativeWind)

### Structure cible
```
app/                  # routing only — pas de logique
  (auth)/ login.tsx, register.tsx          # shells
  (app)/(tabs)/ ...                         # shells
feature/              # features métier
  <feat>/  api.ts  constant.ts  component/  hook/  screen/  index.ts
shared/
  component/          # design system Cmv*
  hook/  lib/ (api, auth, query, error)  theme/  type/  util/
```

### Règle « pure shells »
Tout `.tsx` sous `app/` est soit du routing (`_layout.tsx`, `index.tsx`), soit un shell d'1 ligne :
```ts
export { ScreenName as default } from "@/feature/<feat>";
```
Aucune logique, aucun JSX dans `app/<screen>.tsx`. Un stub trivial peut rester dans `app/` provisoirement, mais migre dès qu'il a 2+ pièces (hook + component).

### Promotion feature → shared
Composant/hook utilisé par **1 feature** → `feature/<feat>/`. Par **2+** → `shared/`. Type métier front+back → `@cmv/shared`.

### NativeWind content paths — **critique**
À chaque création/renommage de dossier, mettre à jour `tailwind.config.js#content[]` (`./app`, `./feature`, `./shared`). Sinon NativeWind n'extrait pas les classes → CSS incomplet → bugs visuels silencieux non rattrapés par le typecheck.

---

## 4. Web (`apps/web`, React + Vite)

- **Pas de Next.js.** React 19 + Vite + **TanStack Router** (routing) + **TanStack Query** (data) + Tailwind v3.
- Même découpage d'esprit que mobile : `feature/<feat>/` (api, component, hook, screen) + `shared/` (lib api/auth/query, theme, util). Routing TanStack ≈ rôle des shells : pas de logique métier dans la définition de routes.
- Mêmes règles design system (§5) : composants `Cmv`, tokens partagés, zéro hex hors tokens.
- Surface principale du **coach** (création de contenu) ; reste responsive pour dépannage athlète.

---

## 5. Design system (web + mobile)

### Tokens — source unique
- **`@cmv/tokens`** porte couleurs/spacing/typo. Exposé à **Tailwind (web)** ET **NativeWind (mobile)** → classes `bg-cmv-*`, `text-cmv-*`, `border-cmv-*`.
- **Règle stricte** : **zéro `#xxxxxx` dans le code hors `@cmv/tokens` / `theme/`**. Nouvelle couleur → l'ajouter au token puis aux configs Tailwind.

### Composants
- Préfixe **`Cmv`** pour les composants du design system (`CmvButton`, `CmvCard`, `CmvScreen`…). **Ne pas** préfixer d'éventuelles primitives générées par un outil tiers (les garder non-préfixées dans un dossier `ui/` à part).
- Atomic Design : atoms → molecules → organisms → templates → pages. Composants **non partagés** web↔mobile (implémentations distinctes) ; seuls les **tokens** sont partagés.
- Wrappers de primitives RN : étendre via `Pick<XProps, ...>`, prop list explicite (pas de `Omit + ...rest` global), spread typé.
- **Variants** (`{ containerClassName, textClassName }`) vs **Modifiers** (chaînes Tailwind composables via `cn`). Un même `cn(...)` répété 3× → créer un variant.
- Composants conditionnels : `if (!visible) return null;` plutôt qu'un Fragment `{visible && ...}`.

---

## 6. Multi-tenant — **règle structurante**

L'isolation des données est garantie **à la couche données**, pas par la seule logique applicative.

- **Invariant** : 1 `Athlete` a **au plus 1 `Coach`** (0 ou 1, unicité en base). 1 `Coach` = N `Athlete`. MVP : tout athlète est lié à 1 coach ; relation **nullable et réversible** dès le départ pour ne pas bloquer l'athlète **autonome** (0 coach, auto-coaching v1.0).
- **Tenancy guard** (NestJS) : résout l'acteur courant + sa relation `CoachAthlete` à partir de la session Better Auth, et l'injecte dans le contexte de requête.
- **Prisma Client Extension** : applique automatiquement le scope tenant à toute requête (filtre `where` par coach/athlète). Aucune query métier ne s'exécute sans scope.
- **Conséquence** : un coach ne lit/écrit que SES athlètes ; un athlète que SES données. Toute nouvelle entité métier doit être rattachée au tenant.
- **Tests** : e2e d'isolation obligatoires — vérifier qu'un coach A ne peut jamais accéder aux données d'un athlète du coach B.

### Pièges du scope automatique (appris en P2 — à respecter pour toute entité)

1. **Le champ tenant doit être DIRECT sur le modèle.** L'extension scope par un champ du modèle lui-même (`TENANT_SCOPES`). Les tables enfant (`ExerciseDocument`, `SessionExercise`) portent donc un **`coachId` dénormalisé** — on ne s'appuie pas sur le parent. Un modèle absent du registre est **refusé** (fail-closed).
2. **Les `include` imbriqués ne sont PAS scopés.** L'extension n'intercepte que les opérations de **premier niveau** : un `include: { exercise: true }` lit la table jointe **sans filtre tenant**. Conséquence : ne jamais résoudre une donnée d'un autre modèle par un `include` — la charger par une **requête scopée séparée** (cf. `SessionService.loadExerciseMap`).
3. **Les FK n'imposent pas le tenant.** Rien n'empêche en base de référencer l'`exerciseId` d'un autre coach. Toute référence entrante venant du client doit être **validée comme possédée** avant écriture (cf. `SessionService.assertExercisesOwned` → 400).
4. **Les suppressions `Restrict` doivent être gardées côté applicatif.** Sinon la violation de FK remonte en 500 : préférer un **409 explicite** et actionnable (cf. suppression d'un exercice utilisé dans une séance).

> Pas de RLS Postgres en MVP : tous les accès passent par Prisma, donc l'extension suffit et reste portable.

---

## 7. Data layer & logique métier

- **Types métier** : source unique `@cmv/shared`. Tout ce qui transite par l'API HTTP y est défini.
- **Logique pure** : formules/conversions métier = fonctions pures dans `@cmv/shared` (testables, partagées front/back). Aucun magic number dans le JSX — nommer les constantes.
- **Nullable, pas de fallback silencieux** : une fonction sur données potentiellement manquantes retourne `null`, jamais `0`/défaut. Le rendu gère le `null` (`{value == null ? "—" : ...}`). Préférer `null` à `undefined` pour les états métier optionnels (cohérence JSON API).
- **Pas de duplication** : si une feature recompose une formule déjà dans `@cmv/shared`, c'est un bug.

### Médias
- Photos/vidéos/audio → **object storage** (S3-compatible) via `@aws-sdk/client-s3` + **URLs signées**. Jamais le binaire en BDD. Compression côté client. Limites : vidéo 60 s/720p/~50 Mo, 3 vidéos + 5 photos par débrief.
- Backend abstrait par `infra/storage/StorageService` : endpoint/credentials par variables `S3_*` → **MinIO** en dev local (docker-compose), **Scaleway** en prod, **Cellar** (Clever Cloud) en v1.0, sans changer le code. Path-style (`S3_FORCE_PATH_STYLE`) pour MinIO, virtual-hosted pour Scaleway.
- **Flux d'upload** : le client demande une **URL PUT signée** à l'API (jamais le binaire via l'API), l'envoie directement au bucket **privé**, puis confirme le rattachement. Lecture via **URL GET signée** courte régénérée à chaque requête.

---

## 8. Conventions de nommage & imports

- Sous-dossiers techniques **au singulier** : `component/`, `hook/`, `screen/`, `type/`, `util/`.
- Composants React : `PascalCase.tsx`. Design system : préfixe `Cmv`.
- Helpers : `kebab-case.util.ts`. Configs/constantes : `kebab-case.<role>.ts`. Types du package : `<name>.type.ts`.
- Fichiers plats d'une feature (`api.ts`, `constant.ts`, `index.ts`) : pas de suffixe (le dossier porte le contexte).
- Imports : alias absolu `@/...` hors dossier courant ; relatif uniquement intra-module. Ordre alphabétique imposé par **Biome** (vendor → `@cmv/*` → `@/...` → relatif).

---

## 9. Routing & navigation (mobile)

- Redirection conditionnelle : **toujours** `<Redirect href="..." />` déclaratif, jamais `router.replace` dans un `useEffect` (double-fire en strict mode, flash). `router.replace` reste valide dans des **handlers** (post-mutation).
- Animations Stack : garder les défauts Expo Router ; configurer par écran si besoin (modal, fade). Ne pas mettre `animation: "none"` globalement.
- `import "../global.css";` **une seule fois**, dans `app/_layout.tsx`.

---

## 10. i18n

- **Aucune string en dur** dans l'UI dès P0 : tout passe par **i18next** (+ `expo-localization` mobile). Français = langue par défaut ; `en.json` ajouté en P7. Formats date/montant localisés.

---

## 11. Qualité & CI

- **Biome** (lint + format) ; pas d'ESLint/Prettier. **Vitest** pour les tests. Hooks **Husky + lint-staged + commitlint** : Conventional Commits, **sujet en minuscule**.
- CI GitHub Actions : `biome ci` + `turbo typecheck test` bloquent le merge. **SonarCloud** sur chaque PR (exclut `apps/mobile` et `apps/web` des sources). **Sentry** sur les 3 couches.
- Écrans/données mockés : commentaire `// MOCKED — <desc>. À connecter en P<X>.` (`grep -r MOCKED` doit tous les lister).
