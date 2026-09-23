#!/bin/bash
#
# Déploiement tiré du NAS (#266). Installé UNE fois sur le NAS, à côté du `.env`, et lancé toutes les
# 5 minutes par une tâche planifiée DSM, en root.
#
# Il remplace le runner auto-hébergé : GitHub ne pousse plus rien vers le NAS, c'est le NAS qui va
# chercher la version PROMUE — le tag `preview` des images GHCR, posé par le workflow de promotion.
# Tant qu'aucune version n'a été promue, il ne fait rien.
#
#   1. tire `cimavia-api:preview` et `cimavia-web:preview` ;
#   2. s'arrête si ce sont les images déjà déployées ;
#   3. lit dans l'image de l'API le commit dont elle est issue, et télécharge le compose DE CE
#      COMMIT (le dépôt est public) : le compose suit la version promue, jamais une copie locale ;
#   4. le valide contre le `.env`, puis `up -d` avec les deux images épinglées par digest ;
#   5. attend que l'API soit saine, et ne note la version comme déployée qu'à ce moment-là.
#
# Code de sortie non nul = échec : la tâche DSM peut l'envoyer par e-mail. Journal :
# `pull-preview/pull-preview.log` à côté du script.
set -euo pipefail

# Le script vit dans le dossier du `.env` : rien à configurer.
STACK_DIR="${STACK_DIR:-$(cd "$(dirname "$0")" && pwd)}"
ENV_FILE="$STACK_DIR/.env"
STATE_DIR="$STACK_DIR/pull-preview"
LOG="$STATE_DIR/pull-preview.log"
# Les identifiants GHCR posés par `docker login` : un dossier explicite, parce qu'une tâche DSM ne
# garantit pas le HOME de root.
export DOCKER_CONFIG="$STACK_DIR/.docker"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

API_REF="ghcr.io/cimavia/cimavia-api:preview"
WEB_REF="ghcr.io/cimavia/cimavia-web:preview"
RAW="https://raw.githubusercontent.com/Cimavia/cimavia"
# Le dossier du compose a changé en #271, et les deux chemins restent lus : ce script tire le
# compose du commit PROMU, qui peut être antérieur au déplacement. Le nouveau d'abord.
COMPOSE_PATHS="deploy/preview/docker-compose.yml deploy/dev/docker-compose.yml"
HEALTH_TIMEOUT_S=300

mkdir -p "$STATE_DIR"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
fail() {
  log "ÉCHEC : $*"
  exit 1
}

# Un seul passage à la fois : une migration longue ne doit pas voir démarrer un second `up`.
LOCK="$STATE_DIR/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # Verrou laissé par un passage interrompu (redémarrage du NAS) : repris au-delà de 30 minutes.
  [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]] || exit 0
  rmdir "$LOCK" && mkdir "$LOCK"
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"; rmdir "$LOCK" 2>/dev/null || true' EXIT

# Journal borné : un passage toutes les 5 minutes, pendant des mois.
if [[ -f "$LOG" && "$(wc -l <"$LOG")" -gt 5000 ]]; then
  tail -n 2000 "$LOG" >"$tmp/log" && cat "$tmp/log" >"$LOG"
fi

command -v docker >/dev/null 2>&1 || fail "docker introuvable dans $PATH"
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  fail "ni « docker compose » ni « docker-compose »"
fi
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE introuvable"

# ── 1. La version promue ─────────────────────────────────────────────────────
if ! out="$(docker pull -q "$API_REF" 2>&1)"; then
  case "$out" in
    # Aucune promotion encore : l'état normal avant la première, rien à signaler.
    *"manifest unknown"*) exit 0 ;;
    # Tout le reste est une panne : jeton GHCR expiré, réseau, registre.
    *) fail "tirage de $API_REF : $out" ;;
  esac
fi
docker pull -q "$WEB_REF" >/dev/null 2>&1 || fail "tirage de $WEB_REF impossible"

digest_of() {
  local ref="$1"
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$ref" | grep "^${ref%:*}@" | head -n1
}
API_DIGEST="$(digest_of "$API_REF")"
WEB_DIGEST="$(digest_of "$WEB_REF")"
[[ -n "$API_DIGEST" && -n "$WEB_DIGEST" ]] || fail "digest introuvable après le tirage"

# ── 2. Rien de nouveau ? ─────────────────────────────────────────────────────
CURRENT="$API_DIGEST $WEB_DIGEST"
if [[ -f "$STATE_DIR/deployed" && "$(cat "$STATE_DIR/deployed")" == "$CURRENT" ]]; then
  exit 0
fi

# ── 3. Le compose du commit promu ────────────────────────────────────────────
REVISION="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$API_REF")"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || fail "commit absent des étiquettes de l'image de l'API : « $REVISION »"
COMPOSE_FILE=""
# HTTPS exigé jusque dans les redirections : ce fichier décide de ce qui tourne sur le NAS, en root.
for path in $COMPOSE_PATHS; do
  if curl --proto '=https' --proto-redir '=https' -fsSL --max-time 30 "$RAW/$REVISION/$path" -o "$tmp/docker-compose.yml" 2>/dev/null; then
    COMPOSE_FILE="$tmp/docker-compose.yml"
    break
  fi
done
[[ -n "$COMPOSE_FILE" ]] || fail "aucun compose au commit $REVISION"

# ── 4. Valider, puis déployer ────────────────────────────────────────────────
# Épinglées par digest, et non par tag : une promotion peut déplacer `preview` pendant ce passage.
# Une variable du shell l'emporte sur le `.env` : ses API_IMAGE / WEB_IMAGE ne servent plus.
export API_IMAGE="$API_DIGEST" WEB_IMAGE="$WEB_DIGEST"
compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config -q 2>"$tmp/err" ||
  fail "compose de $REVISION invalide avec ce .env : $(tr '\n' ' ' <"$tmp/err")"

NEW_PROJECT="$(compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config 2>/dev/null | sed -n 's/^name: *//p' | head -n1)"
OLD_PROJECT="$(cat "$STATE_DIR/project" 2>/dev/null || true)"
# Un projet renommé (#271) garde ses volumes sous leur ancien nom : l'ancien projet doit être ARRÊTÉ
# d'abord, sinon deux PostgreSQL écriraient dans le même volume.
if [[ -n "$OLD_PROJECT" && "$OLD_PROJECT" != "$NEW_PROJECT" ]]; then
  log "projet renommé : $OLD_PROJECT → $NEW_PROJECT, arrêt de l'ancien"
  compose -p "$OLD_PROJECT" -f "$STATE_DIR/docker-compose.yml" --env-file "$ENV_FILE" down --remove-orphans >>"$LOG" 2>&1 ||
    fail "arrêt de $OLD_PROJECT impossible : rien n'a été démarré"
fi

log "déploiement de $REVISION (api $API_DIGEST, web $WEB_DIGEST)"
compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --quiet >>"$LOG" 2>&1 || fail "tirage des images du compose"
compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans >>"$LOG" 2>&1 || fail "up -d"

# ── 5. L'API est-elle saine ? ────────────────────────────────────────────────
# La sonde de l'image interroge /health ; les migrations se jouent avant que l'API n'écoute.
api_id="$(compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q api)"
[[ -n "$api_id" ]] || fail "conteneur api introuvable après up"
waited=0
until [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$api_id")" == "healthy" ]]; do
  if [[ "$waited" -ge "$HEALTH_TIMEOUT_S" ]]; then
    fail "API non saine après ${HEALTH_TIMEOUT_S}s : $(docker logs --tail 20 "$api_id" 2>&1 | tr '\n' ' ')"
  fi
  sleep 10
  waited=$((waited + 10))
done

cp "$COMPOSE_FILE" "$STATE_DIR/docker-compose.yml"
printf '%s\n' "$NEW_PROJECT" >"$STATE_DIR/project"
printf '%s\n' "$CURRENT" >"$STATE_DIR/deployed"
log "OK : $REVISION déployée, API saine"
