# CLAUDE.md — cimavia

Contexte auto-chargé par Claude Code. Garder **court et à jour** : toute dérive de qualité d'instruction vient d'un fichier trop long ou périmé.

## Projet

**cimavia** — application de suivi de la relation **coach ↔ athlète** en escalade (multi-sport à terme). Un coach crée des planifications, les diffuse à ses athlètes, échange avec eux et les facture ; l'athlète consulte ses séances, les débriefe avec médias, et discute avec son coach. Dev **solo**, assisté de Claude / Claude Code.

- Scope packages : `@cmv/*` · préfixe composants : `Cmv` (ex. `CmvButton`) · scheme Expo : `cimavia`
- Langue produit : **français d'abord**, anglais prévu (strings externalisées dès P0)

## Docs de référence (lire avant de coder)

- `CONTEXT.cimavia.md` — **glossaire métier** (termes canoniques : Coach, Athlete, Session, Plan, Feedback…). Utiliser ces termes tels quels.
- `architecture-choice.md` — **règles & conventions** d'archi (à respecter pour toute feature).
- `cahier-des-charges-mvp.md` — périmètre MVP (MoSCoW, modèle de données, non-fonctionnel).
- `dev-plan` (HTML) — plan en 8 phases P0→P7.

## Monorepo

```
apps/
  api/        # NestJS 11 — modules par feature
  mobile/     # Expo SDK 56 (RN ~0.85) — Expo Router + NativeWind
  web/        # React 19 + Vite — TanStack Router + Query (coach surtout)
packages/
  shared/     # @cmv/shared — types métier (DTO), schémas Zod, logique pure
  tokens/     # @cmv/tokens — design tokens → Tailwind (web) + NativeWind (mobile)
  tsconfig/   # @cmv/tsconfig — configs TS de base
```

Outils : **Turborepo + pnpm** (`pnpm@10.34.4`). Lint/format **Biome** (`2.5.1`, pas ESLint/Prettier). Tests **Vitest** (`4.1.9`). Hooks **Husky + commitlint** — Conventional Commits, **sujet en minuscule**. CI : GitHub Actions + **SonarCloud** (exclut `apps/mobile` et `apps/web` des sources analysées). Observabilité : **Pino → Axiom** + **Sentry** sur les 3 couches.

## Stack & versions (épinglées P0)

| Couche | Choix | Version épinglée |
|---|---|---|
| Runtime / Package manager | Node.js / pnpm | `≥22` / `10.34.4` |
| Monorepo | Turborepo | `2.10.0` |
| TypeScript | strict partout | `6.0.3` (^6.0) |
| Lint/format | Biome | `2.5.1` |
| Tests | Vitest | `4.1.9` |
| Hooks | Husky / lint-staged / commitlint | `9.1.7` / `17.0.8` / `21.1.0` |
| API | NestJS | `11.1.27` |
| ORM / DB | Prisma + adapter-pg / PostgreSQL | `7.8.0` / PG **18** |
| Auth | Better Auth (`@thallesp/nestjs-better-auth`, `@better-auth/expo`) | `^1.5` *(P1)* |
| Validation + env | Zod | `4.4.3` |
| Observabilité API | nestjs-pino / @sentry/nestjs | `4.6.1` / `10.61.0` |
| Mobile | Expo SDK / React Native / NativeWind | `56.0.12` / `0.85.3` / `4.2.6` |
| Web | React / Vite / TanStack Router / TanStack Query / Tailwind | `19.2.7` / `8.1.0` / `1.170.16` / `5.101.1` / `3.4.19` |
| Storage médias | Scaleway Object Storage via `@aws-sdk/client-s3` | — *(P2)* |
| Push | `expo-server-sdk` + `expo-notifications` | — *(P3)* |
| i18n | i18next + expo-localization | — *(P1)* |

> **Note react-native** : résolu à `0.85.3` par `pnpm install` (Expo SDK 56 = RN ~0.85). `react` épinglé à `19.2.3` dans `@cmv/mobile` (version attendue par SDK 56) et `19.2.7` dans `@cmv/web`.

## Règles dures (non négociables)

1. **Multi-tenant** : 1 athlète = **exactement 1 coach** (unicité en base). Toute requête est **scopée à l'acteur courant** via le tenancy guard + **Prisma Client Extension** — jamais par la seule logique applicative. Un coach ne voit que SES athlètes ; un athlète que SES données. Couvrir par des tests e2e d'isolation.
2. **Types métier** : tout ce qui transite par l'API HTTP vit dans **`@cmv/shared`** (DTO). Pas de type métier dupliqué côté app.
3. **Design system** : composants préfixés **`Cmv`**. **Zéro `#xxxxxx`** hors `@cmv/tokens` / `theme/`. Couleurs exposées en classes `bg-cmv-*` / `text-cmv-*`.
4. **Pure shells** (mobile) : les fichiers sous `app/` sont du routing ou un shell d'1 ligne `export { Screen as default } from "@/feature/<x>"`. Aucune logique dans `app/`.
5. **Nullable, pas de fallback silencieux** : une fonction sur données manquantes retourne `null`, jamais `0`/valeur par défaut. Le rendu gère le `null` (`—`).
6. **i18n dès le départ** : aucune string en dur dans l'UI — tout passe par i18next.
7. **Médias hors BDD** : photos/vidéos/audio → object storage (URLs signées). Postgres ne stocke que du relationnel.

## Commandes

```bash
pnpm install
pnpm turbo dev                 # tous les apps
pnpm --filter @cmv/api dev    # API seule
pnpm --filter @cmv/mobile start
pnpm --filter @cmv/web dev
pnpm turbo lint typecheck test # qualité (= ce que la CI bloque)
pnpm --filter @cmv/api exec prisma migrate dev   # migrations (Neon/local)
```

## Hébergement

- **MVP (gratuit)** : API → Scaleway Serverless Containers · médias → Scaleway Object Storage (FR) · **BDD → Neon free** (EU, Prisma-natif). Redis **différé**.
- **v1.0 (souverain FR)** : bascule **Clever Cloud** (app + PostgreSQL + Redis + Cellar S3, HDS). Portabilité = variables d'env, rien de propriétaire.

## Hors périmètre MVP (ne pas implémenter sans validation)

Résultats de compétition · paiement intégré (Stripe) · WebSocket temps réel (messagerie = async + polling/push en MVP) · débrief par exercice · historique des modifications.

## README.md

- Tiens à jour le README.md avec les bonnes conventions
