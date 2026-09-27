# syntax=docker/dockerfile:1
#
# Image du frontend web cimavia : build Vite statique servi par nginx.
#
# Différence ASSUMÉE avec l'image API : le web est construit PAR ENVIRONNEMENT, pas une fois pour
# tous. Les variables `VITE_*` sont lues via `import.meta.env` et figées dans le bundle au moment
# du `vite build` (c'est la nature d'un SPA statique — aucune variable n'existe plus à
# l'exécution). Il faut donc un build par cible : un `VITE_API_URL` pour le NAS, un
# autre pour la prod. L'API, elle, reste une image unique pilotée par
# ses variables d'environnement au démarrage.
#
# Build depuis la RACINE du monorepo (le contexte doit voir pnpm-lock.yaml et packages/) :
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api-preview.example \
#     --build-arg VITE_SENTRY_DSN=https://…@…ingest.sentry.io/… \
#     --build-arg VITE_APP_ENV=preview --build-arg VITE_APP_VERSION=1.2.0 \
#     --build-arg SENTRY_ORG=… --build-arg SENTRY_PROJECT=cimavia-web \
#     --build-arg SENTRY_RELEASE=1.2.0+3f2a1c \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN .
#
# Sans le secret, le build aboutit quand même : les sourcemaps ne sont simplement pas publiées.

# Base épinglée par DIGEST (#379) : un tag se reconstruit en silence, et l'image changerait de
# base sans qu'aucune PR ne le dise — ce que #186 refuse pour l'artefact promu. Dependabot
# réécrit le digest, commentaire de version compris, dans une PR que la CI construit.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
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

# La version du produit, figée dans le bundle comme tout le reste (#186). Sans valeur, l'écran de
# compte affiche `—` : un build local n'a pas de version, et en inventer une la rendrait
# indiscernable d'une vraie (règle dure n°5).
#
# Pas de `VITE_APP_BUILD` en face : personne ne l'afficherait. Ce qui distingue deux bundles
# portant le MÊME numéro, c'est le nom de release Sentry ci-dessous, et lui seul en a besoin.
ARG VITE_APP_VERSION=
ENV VITE_APP_VERSION=$VITE_APP_VERSION

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
# `nginx-unprivileged` et non l'image officielle `nginx` (#379, #83) : le maître nginx y tourne en
# utilisateur `nginx` (uid 101), jamais en root, et le port d'écoute passe donc à 8080. Le conteneur
# ne fait que servir des fichiers déjà construits ; le lancer en root n'apportait rien qu'une
# surface d'évasion.
#
# Branche `stable` épinglée par DIGEST : `1.27-alpine`, la mainline d'avant, était close depuis
# avril 2025 et plus jamais reconstruite — nginx et Alpine y étaient figés sans qu'aucune PR ne le
# dise. Dependabot réécrit désormais ce digest à chaque reconstruction de `stable`.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5 AS runtime

# Server block avec fallback SPA + politique de cache (cf. nginx.conf).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# L'image de base tourne déjà en uid 101 ; le redire ici n'est pas redondant : c'est ce qu'un
# lecteur du fichier, et `trivy config` (DS-0002), voient. Sans cette ligne, un changement d'image
# de base qui repasserait en root ne se lirait nulle part (#399).
USER 101

# 8080 et non 80 : c'est ce port que le tunnel Cloudflare doit viser (`http://web:8080`,
# `deploy/preview/README.md`). Les hébergeurs de conteneurs l'attendent souvent par défaut.
EXPOSE 8080

# La sonde vérifie que nginx sert bien index.html (le SPA est en ligne). wget est présent dans
# l'image alpine de nginx — pas besoin d'installer curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
