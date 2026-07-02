# cimavia

Application de suivi de la relation **coach ↔ athlète** en escalade.

## Structure

```
apps/api      — @cmv/api    : NestJS 11 + Prisma 7 + PostgreSQL
apps/mobile   — @cmv/mobile : Expo SDK 56 + Expo Router + NativeWind
apps/web      — @cmv/web    : React 19 + Vite + TanStack Router/Query + Tailwind v3
packages/shared  — @cmv/shared  : DTOs, schémas Zod (partagés front/back)
packages/tokens  — @cmv/tokens  : Design tokens → Tailwind (web) + NativeWind (mobile)
packages/tsconfig — @cmv/tsconfig : Configs TypeScript de base
```

## Prérequis

- Node.js ≥ 22
- pnpm 10.34.4 (`corepack enable && corepack use pnpm@10.34.4`)
- Docker (pour PostgreSQL local)

## Démarrage

```bash
pnpm install
# Variables d'env : copier les modèles et renseigner les secrets
cp apps/api/.env.example apps/api/.env       # DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -base64 32), CORS_ORIGINS
cp apps/web/.env.example apps/web/.env        # VITE_API_URL
cp apps/mobile/.env.example apps/mobile/.env  # EXPO_PUBLIC_API_URL (IP LAN sur appareil/émulateur, pas localhost)
# Démarrer PostgreSQL local (apps/api)
docker compose -f apps/api/docker-compose.yml up -d
# Migrer la base
pnpm --filter @cmv/api exec prisma migrate dev
# Lancer tout
pnpm turbo dev
```

## Commandes

```bash
pnpm turbo dev                           # toutes les apps
pnpm --filter @cmv/api dev               # API seule
pnpm --filter @cmv/mobile start          # Mobile seule
pnpm --filter @cmv/web dev               # Web seule
pnpm turbo lint typecheck test           # qualité (= ce que la CI bloque)
pnpm --filter @cmv/api exec prisma migrate dev
# Tests e2e d'isolation multi-tenant (DB dédiée sur 5434)
docker compose -f apps/api/docker-compose.test.yml up -d
pnpm --filter @cmv/api test:e2e
```

## Conventions

- Lint/format : **Biome**
- Tests : **Vitest**
- Commits : **Conventional Commits** (sujet en minuscule, signés)
- Composants design system : préfixe `Cmv`
- Packages : scope `@cmv/*`
- Auth : **Better Auth** (email/mot de passe) sur les 3 couches ; profil (`role`, `locale`) sur `user`
- Multi-tenant : isolation à la couche données (tenancy interceptor + Prisma Client Extension) — voir `docs/architecture-choice.md` §6
- i18n : **i18next** dès le départ, aucune string en dur (FR ; EN en P7)

Voir `docs/architecture-choice.md` pour les règles d'archi détaillées, et
`CONTRIBUTING.md` pour le workflow de contribution (git flow, commits signés,
secrets CI, observabilité).
