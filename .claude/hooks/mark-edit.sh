#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) : retient que CETTE session a modifié un fichier, pour que
# `stop-gate.sh` ne vérifie le dépôt qu'à la fin d'une réponse qui a écrit quelque chose. Une session
# qui ne fait que lire — une revue lancée dans le même worktree — n'est donc jamais bloquée par les
# fichiers en cours d'une autre.
set -uo pipefail

session=$(jq -r '.session_id // empty')
[[ -n "$session" ]] || exit 0

touch "${TMPDIR:-/tmp}/cmv-claude-edited-${session}"
