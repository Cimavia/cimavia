#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) : passe Biome sur le SEUL fichier que Claude vient de modifier.
# Ce que Biome corrige seul est corrigé ; ce qu'il ne sait pas corriger revient à Claude (exit 2),
# tout de suite plutôt qu'à la porte qualité. Un seul fichier : dans un worktree partagé, les
# fichiers en cours d'une autre session ne doivent pas bloquer celle-ci.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[[ -n "$file" && -f "$file" ]] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Les fichiers exclus par biome.json (docs/, configs JS…) et les extensions inconnues sortent en 0.
if ! out=$(pnpm exec biome check --write --no-errors-on-unmatched --files-ignore-unknown=true "$file" 2>&1); then
  printf 'Biome signale des erreurs non corrigeables automatiquement dans %s :\n%s\n' "$file" "$out" >&2
  exit 2
fi
