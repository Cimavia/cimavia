# syntax=docker/dockerfile:1
#
# Image du frontend web cimavia : build Vite statique servi par nginx.
#
# UNE image par version, comme l'API (#417, qui renverse l'exception posée en #186) : construite
# sur `main` (`web-image.yml`), puis RETAGUÉE d'un tier à l'autre, jamais reconstruite. Ce qui
# dépend du tier — l'URL de l'API, le DSN Sentry, le nom du tier — n'est plus figé dans le bundle :
# nginx le sert en `/config.js` depuis les variables `CMV_*` du conteneur, au démarrage (cf.
# nginx.conf). Seul ce qui dépend de la VERSION reste un argument de build.
#
# Build depuis la RACINE du monorepo (le contexte doit voir pnpm-lock.yaml et packages/) :
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_APP_VERSION=1.2.0 \
#     --build-arg SENTRY_ORG=… --build-arg SENTRY_PROJECT=cimavia-web \
#     --build-arg SENTRY_RELEASE=1.2.0+3f2a1c \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN .
#
# Et au démarrage, les trois variables, TOUTES définies (même vides, cf. nginx.conf) :
#   docker run -e CMV_API_URL=https://api-preview.example -e CMV_APP_ENV=preview \
#     -e CMV_SENTRY_DSN= …
#
# Sans le secret, le build aboutit quand même : les sourcemaps ne sont simplement pas publiées.

# Base épinglée par DIGEST (#379) : un tag se reconstruit en silence, et l'image changerait de
# base sans qu'aucune PR ne le dise — ce que #186 refuse pour l'artefact promu. Dependabot
# réécrit le digest, commentaire de version compris, dans une PR que la CI construit.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm épinglé : la même version que `packageManager` (`package.json` racine), à monter ensemble.
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
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

# Les certificats racine du système, pour `sentry-cli` (#474) : l'image `-slim` n'en a aucun. Node
# embarque les siens, d'où un pnpm qui s'en passe ; `sentry-cli`, binaire Rust, lit ceux du système,
# et sans eux chaque téléversement de sourcemaps échouait sur « unable to get local issuer
# certificate » — depuis la première promotion. Dans cet étage seulement : l'image servie est
# nginx, qui ne les voit jamais.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

# @cmv/shared et @cmv/tokens sont consommés en SOURCE par Vite (alias vers packages/*/src), donc
# rien à compiler en amont — contrairement à l'API qui, elle, consomme le dist de @cmv/shared.
# Plus de `VITE_API_URL`, de `VITE_SENTRY_DSN` ni de `VITE_APP_ENV` (#417) : ils sont lus au
# démarrage, et leur ancien défaut `localhost` faisait appeler le poste du Coach par son navigateur.

# La version du produit, elle, reste figée dans le bundle (#186) : elle ne change pas d'un tier à
# l'autre, c'est le même bundle retagué. Sans valeur, l'écran de compte affiche `—` : un build
# local n'a pas de version, et en inventer une la rendrait indiscernable d'une vraie (règle dure
# n°5).
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

# Server block avec fallback SPA, politique de cache et `/config.js` (cf. nginx.conf). Un TEMPLATE,
# réécrit au démarrage par l'entrypoint de l'image (`20-envsubst-on-templates.sh`) dans
# /etc/nginx/conf.d, que l'uid 101 peut écrire — contrairement au dossier html, qui appartient à
# root : c'est pourquoi `config.js` est une réponse d'nginx et non un fichier.
#
# Le filtre borne la substitution aux variables `CMV_*` : sans lui, toute variable du conteneur
# nommée comme une variable d'nginx la remplacerait, et n'importe laquelle pourrait finir chez le
# visiteur.
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^CMV_
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
