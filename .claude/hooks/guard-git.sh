#!/usr/bin/env bash
# PreToolUse (Bash) : commit, push et création de PR sont faits par Kylian, jamais par Claude
# (CLAUDE.md, « Façon de travailler »). Claude donne la commande ; ce hook en fait une garantie.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty')

# `git`/`gh` en position de commande seulement (début, ou après ; & | ( ) : un `grep "git commit"`
# passe.
start='(^|[;&|(])[[:space:]]*'
end='([^[:alnum:]_-]|$)'
if grep -Eq "${start}git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+)*[[:space:]]+(commit|push)${end}|${start}gh[[:space:]]+pr[[:space:]]+(create|merge)${end}" <<<"$cmd"; then
  echo "Bloqué : commit, push et création ou merge de PR sont faits par Kylian. Donner la commande au lieu de la lancer." >&2
  exit 2
fi
