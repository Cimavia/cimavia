#!/bin/bash
#
# Sauvegarde du NAS (#268). Installé à côté du `.env`, lancé chaque nuit par une tâche planifiée
# DSM, en root — comme `pull-preview.sh`, dont il reprend la forme.
#
# Il fabrique une copie COHÉRENTE des données, et rien de plus :
#   1. `pg_dump -Fc` de la base, daté, relu pour prouver qu'il est exploitable ;
#   2. miroir du bucket, suppressions comprises : la copie est l'image exacte du stockage ;
#   3. un manifeste (nombre d'objets, tailles, empreinte du dump) qui rend la vérification possible
#      sans rien restaurer ;
#   4. rétention : les 7 derniers dumps.
#
# Ce qu'il ne fait pas, et c'est voulu : sortir du NAS. Cette copie protège du `down -v`, du bug qui
# efface, de la migration fautive et de la suppression par erreur — pas de la panne de disque ni du
# rançongiciel. Le hors-site reste manuel (`deploy/dev/README.md`), le temps que preview vive sur le
# NAS.
#
# Copier les fichiers du volume PostgreSQL à chaud ne vaut RIEN : une copie prise pendant une
# écriture est incohérente. D'où `pg_dump`, qui lit une image transactionnelle de la base.
#
# Code de sortie non nul = échec : la tâche DSM l'envoie par e-mail. Journal : `backup/backup.log`.
set -euo pipefail

# Le script vit dans le dossier du `.env`. Les noms ci-dessous sont ceux du NAS ; ils se surchargent
# par l'environnement, ce qui permet de rejouer le script contre la pile locale.
STACK_DIR="${STACK_DIR:-$(cd "$(dirname "$0")" && pwd)}"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$STACK_DIR/backup}"
PG_CONTAINER="${PG_CONTAINER:-cimavia_dev_postgres}"
DOCKER_NETWORK="${DOCKER_NETWORK:-cimavia-dev_default}"
# L'endpoint du stockage, en pièces détachées pour être surchargeable d'un bloc. Par défaut, le
# service `silo` du réseau interne du compose, en clair : ce saut ne quitte jamais le NAS, et le
# chiffrer coûterait un aller-retour par le tunnel Cloudflare pour rien. Un stockage distant se
# vise en posant S3_SCHEME=https et S3_HOST.
S3_SCHEME="${S3_SCHEME:-http}"
S3_HOST="${S3_HOST:-silo}"
S3_PORT="${S3_PORT:-9000}"
S3_ENDPOINT="${S3_ENDPOINT:-${S3_SCHEME}://${S3_HOST}:${S3_PORT}}"
MC_IMAGE="${MC_IMAGE:-ghcr.io/cimavia/mc:RELEASE.2026-09-16T00-00-00Z}"
KEEP_DUMPS="${KEEP_DUMPS:-7}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG="$BACKUP_DIR/backup.log"
LOCK="$BACKUP_DIR/lock"
STAMP="$(date '+%F-%H%M')"

mkdir -p "$BACKUP_DIR/base" "$BACKUP_DIR/media"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
fail() {
  log "ÉCHEC : $*"
  exit 1
}

# Un seul passage à la fois : un dump long ne doit pas croiser le suivant.
if ! mkdir "$LOCK" 2>/dev/null; then
  # Verrou laissé par un passage interrompu (redémarrage du NAS) : repris au-delà de 6 heures.
  [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +360 2>/dev/null)" ]] || fail "un autre passage est en cours"
  rmdir "$LOCK" && mkdir "$LOCK"
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"; rmdir "$LOCK" 2>/dev/null || true' EXIT

# Journal borné : une ligne par nuit, pendant des années.
if [[ -f "$LOG" && "$(wc -l <"$LOG")" -gt 5000 ]]; then
  tail -n 2000 "$LOG" >"$tmp/log" && cat "$tmp/log" >"$LOG"
fi

command -v docker >/dev/null 2>&1 || fail "docker introuvable dans $PATH"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE introuvable"

# Les valeurs viennent du `.env`, jamais d'une copie dans ce script : deux sources finiraient par
# diverger, et la sauvegarde viserait la mauvaise base. `sed` retire les guillemets éventuels.
val() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}
for var in POSTGRES_USER POSTGRES_DB S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET; do
  [[ -n "$(val "$var")" ]] || fail "$var absente de $ENV_FILE"
done

# Une sauvegarde qui remplit le disque casserait ce qu'elle protège.
free_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
[[ "$free_mb" -ge "$MIN_FREE_MB" ]] || fail "espace libre insuffisant : ${free_mb} Mo, minimum ${MIN_FREE_MB} Mo"

# ── 1. La base ───────────────────────────────────────────────────────────────
# Écrit d'abord dans un fichier temporaire : un dump interrompu ne doit pas prendre la place d'un
# dump valide dans la rétention.
if ! docker exec "$PG_CONTAINER" pg_dump -U "$(val POSTGRES_USER)" -Fc "$(val POSTGRES_DB)" >"$tmp/base.dump" 2>"$tmp/err"; then
  fail "pg_dump : $(tr '\n' ' ' <"$tmp/err")"
fi
# Relire l'en-tête prouve que le fichier est un dump exploitable, pas un tronçon.
docker exec -i "$PG_CONTAINER" pg_restore -l <"$tmp/base.dump" >/dev/null 2>"$tmp/err" ||
  fail "le dump ne se relit pas : $(tr '\n' ' ' <"$tmp/err")"
dump="$BACKUP_DIR/base/cimavia-${STAMP}.dump"
mv "$tmp/base.dump" "$dump"

# ── 2. Les médias ────────────────────────────────────────────────────────────
# `--remove` : ce que l'app supprime disparaît aussi de la copie. Sans lui, un média effacé
# survivrait indéfiniment ici, ce qu'un effacement RGPD (#285) ne peut pas accepter. L'historique
# long, ce sont les copies manuelles.
docker run --rm --network "$DOCKER_NETWORK" -v "$BACKUP_DIR/media:/backup" --entrypoint sh "$MC_IMAGE" -c \
  "mc alias set nas ${S3_ENDPOINT} '$(val S3_ACCESS_KEY_ID)' '$(val S3_SECRET_ACCESS_KEY)' >/dev/null \
   && mc mirror --quiet --overwrite --remove nas/$(val S3_BUCKET) /backup \
   && mc ls --recursive --summarize nas/$(val S3_BUCKET) | tail -2" >"$tmp/mc" 2>"$tmp/err" ||
  fail "miroir des médias : $(tr '\n' ' ' <"$tmp/err")"

objects_bucket="$(grep -oE 'Total Objects: [0-9]+' "$tmp/mc" | grep -oE '[0-9]+' || echo "")"
objects_copy="$(find "$BACKUP_DIR/media" -type f | wc -l)"
[[ -n "$objects_bucket" ]] || fail "nombre d'objets illisible dans la sortie de mc"
[[ "$objects_bucket" -eq "$objects_copy" ]] ||
  fail "la copie ne correspond pas au bucket : ${objects_copy} fichiers pour ${objects_bucket} objets"

# ── 3. Le manifeste ──────────────────────────────────────────────────────────
# De quoi vérifier une sauvegarde sans la restaurer, et repérer un dump qui rétrécit.
{
  echo "date          : $(date '+%F %T')"
  echo "dump          : $(basename "$dump") ($(du -h "$dump" | cut -f1))"
  echo "sha256        : $(sha256sum "$dump" | cut -d' ' -f1)"
  echo "objets        : $objects_copy"
  echo "taille medias : $(du -sh "$BACKUP_DIR/media" | cut -f1)"
} >"$BACKUP_DIR/manifest-${STAMP}.txt"

# ── 4. Rétention ─────────────────────────────────────────────────────────────
# Par NOMBRE et non par âge : une machine arrêtée trois semaines ne doit pas se réveiller sans
# aucune sauvegarde.
# `stat` plutôt que `ls` (illisible par un script) ou `find -printf` (absent du busybox de DSM).
surplus() {
  local pattern="$1" keep="$2" file
  shopt -s nullglob
  for file in $pattern; do stat -c "%Y %n" "$file"; done | sort -rn | tail -n +"$((keep + 1))" | cut -d" " -f2-
  shopt -u nullglob
}
while read -r old; do
  [[ -n "$old" ]] || continue
  rm -f "$old"
  log "rétention : $(basename "$old") supprimé"
done < <(surplus "$BACKUP_DIR/base/cimavia-*.dump" "$KEEP_DUMPS")
while read -r old; do
  [[ -n "$old" ]] && rm -f "$old"
done < <(surplus "$BACKUP_DIR/manifest-*.txt" "$KEEP_DUMPS")

log "OK : $(basename "$dump") ($(du -h "$dump" | cut -f1)), ${objects_copy} objets, $(du -sh "$BACKUP_DIR/media" | cut -f1) de médias"
