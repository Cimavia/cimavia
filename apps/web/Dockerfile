# syntax=docker/dockerfile:1
#
# Image du frontend web cimavia : build Vite statique servi par nginx.
#
# Différence ASSUMÉE avec l'image API : le web est construit PAR ENVIRONNEMENT, pas une fois pour
# tous. `VITE_API_URL` est lu via `import.meta.env` et figé dans le bundle au moment du `vite
# build` (c'est la nature d'un SPA statique — aucune variable n'existe plus à l'exécution). Il
# faut donc un build par cible : `--build-arg VITE_API_URL=https://api.staging.<domaine>` pour le
# NAS, un autre pour la prod. L'API, elle, reste une image unique pilotée par ses variables
# d'environnement au démarrage.
#
# Build depuis la RACINE du monorepo (le contexte doit voir pnpm-lock.yaml et packages/) :
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.staging.example .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm épinglé : cohérence avec le lockfile (le monorepo est en pnpm@10.34.4).
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Étape 1 — pruning du monorepo
# ─────────────────────────────────────────────────────────────────────────────
# Isole le sous-graphe de @cmv/web (+ @cmv/shared, @cmv/tokens, @cmv/tsconfig) : la couche
# d'install ne dépend alors plus des manifests de l'API ni du mobile, donc une modification
# côté API n'invalide pas le build du web.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.0 prune @cmv/web --docker

# ─────────────────────────────────────────────────────────────────────────────
# Étape 2 — build
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

# @cmv/shared et @cmv/tokens sont consommés en SOURCE par Vite (alias vers packages/*/src), donc
# rien à compiler en amont — contrairement à l'API qui, elle, consomme le dist de @cmv/shared.
# VITE_API_URL est déclaré ARG puis exposé en ENV le temps du build, pour que `import.meta.env`
# le voie. Le défaut localhost n'a de sens qu'à titre de garde-fou : un build d'image réel doit
# toujours passer --build-arg (sinon le SPA appellerait localhost:3000 depuis le navigateur).
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @cmv/web build

# ─────────────────────────────────────────────────────────────────────────────
# Étape 3 — runtime (nginx)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Server block avec fallback SPA + politique de cache (cf. nginx.conf).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# La sonde vérifie que nginx sert bien index.html (le SPA est en ligne). wget est présent dans
# l'image alpine de nginx — pas besoin d'installer curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
