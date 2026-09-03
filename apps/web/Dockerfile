# syntax=docker/dockerfile:1
#
# Image du frontend web cimavia : build Vite statique servi par nginx.
#
# Différence ASSUMÉE avec l'image API : le web est construit PAR ENVIRONNEMENT, pas une fois pour
# tous. Les variables `VITE_*` sont lues via `import.meta.env` et figées dans le bundle au moment
# du `vite build` (c'est la nature d'un SPA statique — aucune variable n'existe plus à
# l'exécution). Il faut donc un build par cible : `--build-arg VITE_API_URL=https://api.staging.
# <domaine>` pour le NAS, un autre pour la prod. L'API, elle, reste une image unique pilotée par
# ses variables d'environnement au démarrage.
#
# Build depuis la RACINE du monorepo (le contexte doit voir pnpm-lock.yaml et packages/) :
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.staging.example \
#     --build-arg VITE_SENTRY_DSN=https://…@…ingest.sentry.io/… \
#     --build-arg VITE_APP_ENV=staging \
#     --build-arg SENTRY_ORG=… --build-arg SENTRY_PROJECT=cimavia-web \
#     --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN .
#
# Sans le secret, le build aboutit quand même : les sourcemaps ne sont simplement pas publiées.

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

# Sentry. Le DSN suit exactement le même chemin que VITE_API_URL — figé dans le bundle, donc un
# build par tier. Ce n'est PAS un secret : il part chez tous les visiteurs, n'importe qui peut le
# lire. Vide, le SDK reste inerte et l'app démarre pareil.
# VITE_APP_ENV est le TIER de déploiement, pas le mode de build : `import.meta.env.MODE` vaut
# `production` sur le NAS comme en prod et taguerait les deux pareil.
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_APP_ENV=development
ENV VITE_APP_ENV=$VITE_APP_ENV

# Téléversement des sourcemaps. L'organisation, le projet et la release ne sont pas des secrets ;
# le JETON, lui, en est un — d'où le montage BuildKit et non un ARG. Un ARG serait gravé dans
# `docker history` de l'image publiée sur GHCR : on publierait le seul vrai secret du chantier.
# La release est passée explicitement parce que `.git` est exclu du contexte (.dockerignore) : la
# détection automatique du plugin n'a rien à lire ici.
ARG SENTRY_ORG=
ENV SENTRY_ORG=$SENTRY_ORG
ARG SENTRY_PROJECT=
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ARG SENTRY_RELEASE=
ENV SENTRY_RELEASE=$SENTRY_RELEASE

RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    pnpm --filter @cmv/web build

# Les .map partent chez Sentry, jamais chez le visiteur : `COPY dist` ci-dessous prend TOUT le
# dossier, on publierait sinon le source de l'app à la racine du site (5 Mo de code lisible).
# Suppression INCONDITIONNELLE — elle doit valoir aussi pour un build sans jeton, où le plugin
# n'a rien téléversé mais où Vite a quand même écrit les fichiers.
RUN find /app/apps/web/dist -name "*.map" -delete

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
