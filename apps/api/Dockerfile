# syntax=docker/dockerfile:1
#
# Image de production de l'API cimavia. UNE seule image sert staging (NAS Synology) et prod
# (Clever Cloud HDS) : seules les variables d'environnement changent — c'est la portabilité
# revendiquée au CDC §7.5, et la construire ici permet de la vérifier sur le NAS avant la prod.
#
# Base glibc (bookworm-slim) et NON alpine : `@sentry/profiling-node` est un module natif dont
# les binaires précompilés ciblent la glibc. Prisma, lui, n'impose rien — Prisma 7 avec l'adapter
# pg utilise le compilateur WASM (query_compiler_fast_bg.wasm), donc aucun moteur Rust de requête
# à embarquer ni dépendance OpenSSL à installer.
#
# Build depuis la RACINE du monorepo (le contexte doit voir pnpm-lock.yaml et packages/) :
#   docker build -f apps/api/Dockerfile -t cimavia-api .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# OpenSSL pour le *schema engine* de Prisma (celui de `migrate deploy`, seul binaire natif que
# Prisma 7 conserve — le moteur de requêtes, lui, est en WASM). Sans lui, il n'arrive pas à
# détecter la version de libssl, retombe sur « openssl-1.1.x » et journalise un avertissement à
# chaque démarrage du conteneur.
#
# pnpm est épinglé explicitement : l'arbre produit par `pnpm deploy` n'a pas de champ
# `packageManager`, et corepack y retomberait sinon sur le dernier pnpm publié (11.x observé).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@10.34.4 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Étape 1 — pruning du monorepo
# ─────────────────────────────────────────────────────────────────────────────
# `turbo prune` réécrit le lockfile en n'y gardant que le sous-graphe de @cmv/api
# (+ @cmv/shared, @cmv/tsconfig) et produit deux dossiers : `out/json` (les manifests seuls,
# pour la couche d'install) et `out/full` (les sources).
#
# L'intérêt est la VITESSE et la stabilité du cache : sans lui, la couche d'install dépend du
# lockfile entier, donc une modification côté mobile ou web invaliderait le build de l'API.
# (À noter : cela ne réduit PAS le poids de l'image — cf. la remarque sur Expo plus bas.)
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.0 prune @cmv/api --docker

# ─────────────────────────────────────────────────────────────────────────────
# Étape 2 — build (devDependencies incluses)
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

# Les manifests d'abord : cette couche n'est invalidée que si une dépendance bouge, et non à
# chaque modification de source.
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

# @cmv/shared est compilé AVANT l'API : celle-ci consomme son `dist` CJS (cf. son package.json,
# main → ./dist/index.js), pas ses sources. `prisma generate` ensuite, puis `nest build`.
# `--ignore-scripts` plus haut a sauté le postinstall qui appelle `prisma generate` — d'où
# l'appel explicite, de toute façon plus lisible.
RUN pnpm --filter @cmv/shared build \
 && pnpm --filter @cmv/api exec prisma generate \
 && pnpm --filter @cmv/api build

# `pnpm deploy` produit dans /out un arbre AUTONOME : dépendances de production seules, et
# @cmv/shared injecté comme paquet réel au lieu d'un lien de workspace — ce qui permet au
# runtime de n'embarquer NI le workspace, NI pnpm, NI corepack.
# `--legacy` : sans lui, pnpm 10 exige `inject-workspace-packages=true` dans .npmrc.
#
# Poids de l'image (~1 Go) : l'essentiel vient de `@better-auth/expo`, dépendance réelle de
# l'API (plugin serveur gérant le scheme cimavia:// et les cookies natifs), qui déclare `expo`,
# `expo-constants`, `expo-linking` et `expo-network` en peerDependencies — auto-installées par
# pnpm, elles tirent React Native et Hermes (~150 Mo) dans une image de SERVEUR. Ce n'est donc
# ni un défaut de pruning ni un défaut de deploy. Piste de réduction : marquer ces peers
# optionnelles via `pnpm.packageExtensions` à la racine. À traiter à part, sous dette.
RUN pnpm --filter @cmv/api --prod deploy --legacy /out \
 && rm -rf /out/src /out/test /out/Dockerfile /out/docker-compose*.yml \
           /out/nest-cli.json /out/tsconfig*.json /out/vitest.config.e2e.ts

# ─────────────────────────────────────────────────────────────────────────────
# Étape 3 — runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# L'arbre déployé devient la racine de l'app : `dist`, `prisma/` et `prisma.config.ts` y sont
# déjà (deploy copie les fichiers du paquet), d'où un WORKDIR à plat plutôt qu'un chemin
# apps/api/ reconstitué.
COPY --from=builder /out ./

# `prisma generate` est rejoué ICI : `pnpm deploy` réinstalle @prisma/client depuis le store,
# donc sans le client généré à l'étape de build. Sans cette ligne, l'API démarre puis échoue à
# la première requête.
# Le binaire est appelé directement plutôt que via `pnpm exec` : l'arbre déployé n'a pas de
# pnpm-lock.yaml, et le contrôle de dépendances que pnpm lance avant `exec` y échoue. Le runtime
# n'a ainsi besoin ni de pnpm ni de corepack.
RUN node_modules/.bin/prisma generate

COPY --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Exécution non-root : l'utilisateur `node` existe déjà dans l'image officielle.
# Volontairement PAS de `chown -R node:node /app` : la récursion réécrit chaque fichier de
# node_modules dans une nouvelle couche (~6 min de build et autant de disque, mesuré). C'est
# inutile ici — l'application ne fait que LIRE /app, et les fichiers sont world-readable. Les
# rares écritures (logs pnpm, temp Prisma) vont dans /home/node et /tmp, déjà accessibles.
USER node

ENV PORT=3000
EXPOSE 3000

# Sonde alignée sur l'endpoint réel de l'app (p0-15). `fetch` est global depuis Node 18 : pas de
# curl à installer pour autant. On vise /health (liveness) et non /health/ready : une base
# momentanément indisponible ne doit pas faire redémarrer le conteneur en boucle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
