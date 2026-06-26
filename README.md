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
# Démarrer PostgreSQL local (apps/api)
docker compose -f apps/api/docker-compose.yml up -d
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
```

## Conventions

- Lint/format : **Biome** (pas ESLint/Prettier)
- Tests : **Vitest**
- Commits : **Conventional Commits** (sujet en minuscule)
- Composants design system : préfixe `Cmv`
- Packages : scope `@cmv/*`

Voir `docs/architecture-choice.md` pour les règles détaillées.
