#!/usr/bin/env bash
# Stop : en fin de réponse, si la session a modifié un fichier (`mark-edit.sh`), passe ce que la
# porte qualité vérifie sur tout le dépôt et qu'un fichier seul ne dit pas — `biome ci .` (imports
# cassés ailleurs, config) et `check:i18n` (une clé utilisée sans traduction). ~3 s.
#
# Un échec est rendu à Claude (exit 2), qui corrige avant de rendre la main. Au second échec
# d'affilée (`stop_hook_active`), il rend la main avec le rapport plutôt que de boucler : ce qui
# reste rouge est peut-être hors de sa portée — un fichier d'une autre session dans le même
# worktree.
#
# Angle mort : un fichier modifié par une commande Bash (sed, script) n'arme pas la vérification,
# comme il échappe déjà à `biome-file.sh`. La porte qualité, elle, le voit.
set -uo pipefail

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
active=$(jq -r '.stop_hook_active // false' <<<"$input")
marker="${TMPDIR:-/tmp}/cmv-claude-edited-${session}"
[[ -n "$session" && -f "$marker" ]] || exit 0

# La racine du checkout où la session travaille, pas forcément celui du projet : une session passée
# dans un worktree y a écrit, et c'est lui qu'il faut vérifier — depuis sa racine, pas depuis le
# sous-dossier où elle se trouve.
cwd=$(jq -r '.cwd // empty' <<<"$input")
root=$(git -C "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

report=""
if ! out=$(pnpm -s biome ci --colors=off . 2>&1); then
  report+=$'pnpm biome ci . :\n'"$(tail -n 60 <<<"$out")"$'\n\n'
fi
if ! out=$(pnpm -s check:i18n 2>&1); then
  report+=$'pnpm check:i18n :\n'"$(tail -n 30 <<<"$out")"$'\n'
fi

if [[ -z "$report" ]]; then
  rm -f "$marker"
  exit 0
fi

if [[ "$active" == "true" ]]; then
  rm -f "$marker"
  jq -n --arg msg "Porte de fin de réponse encore rouge après une correction — à regarder :"$'\n'"$report" \
    '{systemMessage: $msg}'
  exit 0
fi

printf '%s\n%s\n\n%s' \
  "La porte de fin de réponse échoue. Corriger avant de rendre la main ce qui vient de tes modifications." \
  "Une erreur dans un fichier que tu n'as pas touché est peut-être le travail en cours d'une autre session : la signaler, ne pas la corriger." \
  "$report" >&2
exit 2
