#!/bin/sh
set -e

# Migrations appliquées au démarrage du conteneur.
#
# Choix assumé : `migrate deploy` est idempotent, mais deux instances qui démarrent ensemble
# peuvent se courir dessus. C'est sans risque tant que l'API tourne en instance UNIQUE — le cas
# du staging (NAS) comme de la prod MVP. Le jour où l'API scale horizontalement, il faudra
# sortir cette étape dans un job de migration distinct, joué avant le déploiement.
#
# `migrate deploy` n'applique que des migrations déjà écrites et versionnées : il ne génère
# jamais de schéma à la volée et ne détruit pas de données (contrairement à `migrate dev`).
echo "→ prisma migrate deploy"
# Binaire appelé directement : l'arbre produit par `pnpm deploy` n'a pas de pnpm-lock.yaml, et
# le contrôle de dépendances lancé par `pnpm exec` y échoue. Le runtime n'a donc besoin ni de
# pnpm ni de corepack.
node_modules/.bin/prisma migrate deploy

echo "→ démarrage de l'API"
exec node dist/main
