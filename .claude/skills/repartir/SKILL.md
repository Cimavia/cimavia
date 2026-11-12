---
name: parallele
description: Répartir des issues prioritaires en lots pour plusieurs worktrees travaillés en parallèle, en minimisant les conflits de fichiers entre lots. Prend les issues dans l'ordre de docs/priorites.md, puis complète sur le board GitHub si besoin. Rend une analyse (lecture seule) puis, sur demande, les commandes `git worktree add`. À utiliser dès qu'on demande de répartir le backlog sur plusieurs worktrees, de paralléliser du développement, ou de préparer X issues pour Y worktrees.
---

# Répartir le backlog sur plusieurs worktrees

Deux nombres en argument : `/parallele <N> <M>` — **N** worktrees à faire travailler en parallèle,
**M** issues à préparer pour **chacun** (N × M issues au total). Le skill ne code rien et n'écrit
rien : il rend un plan de répartition, à valider avant toute exécution.

## Objectif

Donner à N agents, un par worktree, un lot de M issues chacun, pris dans l'ordre de priorité du
dépôt — **sans** qu'ils se gênent en travaillant en même temps sur les mêmes fichiers. Deux
issues qui touchent la même zone doivent atterrir dans le **même** worktree (elles s'y traitent
l'une après l'autre, sans risque) plutôt que dans deux worktrees différents (où elles produiraient
un conflit de merge entre deux branches qui avancent en parallèle).

## Règles d'or

1. **L'ordre de priorité ne se rediscute pas ici.** Il vient de `docs/priorites.md`, section par
   section, dans l'ordre où le fichier les liste (déjà trié 🔴→⚪ à l'intérieur de chaque tableau)
   — c'est le skill `prioriser` qui l'a écrit, ce n'est pas rejugé ici. Ignorer les lignes cochées
   ✅ (fermées) et les épics conteneurs.
2. **Le board GitHub ne sert qu'à compléter**, si `docs/priorites.md` ne fournit pas N × M issues
   ouvertes utilisables. Dans ce cas, trier les candidates restantes du board « Cimavia — Roadmap »
   (Status = Prêt) par le label `prio:` (échelle du skill `prioriser`), et **le dire explicitement**
   dans le rendu : quelles issues viennent du fichier, lesquelles du board.
3. **Une « Cadrage : » n'est pas un grain de travail parallélisable.** Elle attend un arbitrage
   produit, pas un agent qui code (règle *Plan d'abord* de `CLAUDE.md`). L'écarter des lots, la
   lister à part.
4. **Un blocage ou un lien parent/enfant interdit la répartition sur deux worktrees différents.**
   Deux agents qui avancent en parallèle ne peuvent pas s'attendre : si B est bloquée par A, ou B
   est l'enfant d'une épic dont un autre enfant part dans un autre lot, elles vont dans le **même**
   worktree, dans l'ordre de la dépendance.
5. **Aucune écriture tant que ce n'est pas validé** : ni `git worktree add`, ni changement de
   statut sur le board. Le plan se propose en premier, lecture seule — comme `prioriser`.

## 1. Collecter les candidates

Lire `docs/priorites.md` directement, section par section, dans l'ordre d'écriture du fichier, en
écartant les lignes ✅. Pas de commande : c'est déjà le résultat d'un tri.

Si le compte n'atteint pas N × M une fois les épics et les « Cadrage : » écartés, compléter depuis
le board :

```bash
gh issue list --state open --limit 300 --json number,title,labels,milestone,body > issues.json
gh api graphql -f query='
  query { node(id: "PVT_kwDOEbnh1c4BeUYR") { ... on ProjectV2 {
    items(first: 100) { nodes {
      content { ... on Issue { number title } }
      fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    } } } } }'
```

Exclure de cette liste tout ce qui figure déjà dans `docs/priorites.md` (même fermé) et tout
`epic`. Trier le reste par `prio:` (urgent → low), puis par numéro croissant à égalité.

## 2. Écarter ce qui ne se parallélise pas

- Label `epic`, ou titre commençant par « Cadrage : » → hors lots, listés à part dans le rendu.
- Pour chaque candidate retenue, lire ses liens :
  ```bash
  gh api repos/Cimavia/cimavia/issues/<n>/dependencies/blocked_by
  gh api repos/Cimavia/cimavia/issues/<n> --jq '.body' | grep -i "enfant de\|sous-issue\|bloqu"
  ```
  Une chaîne de dépendance devient un **seul bloc** à placer plus tard (étape 4), jamais deux
  candidates traitées séparément.

## 3. Estimer ce que chaque issue va toucher

Pas besoin d'une analyse exhaustive — assez pour juger qui se gêne :

- le ou les labels `area:` (signal le plus rapide — `api`/`web`/`mobile`/`shared`/`tokens`/`infra`) ;
- un `grep -rn` sur les noms propres du titre et du corps (composant, route, table) pour retrouver
  les fichiers visés, comme la question 8 du skill `feature` ;
- une attention particulière à `area: shared` : deux issues qui y touchent partagent presque
  toujours un schéma Zod ou un DTO, même sans rien en commun côté app.

Noter, par issue : aire(s), fichiers probables, et le bloc de dépendance de l'étape 2 s'il y en a
un.

## 4. Répartir en N lots de M

Parcourir les candidates **dans l'ordre de priorité** de l'étape 1 (un bloc de dépendance compte
comme une seule unité, de la taille de ses membres). Pour chacune :

1. Si elle appartient à un bloc déjà commencé, elle va dans le **même** worktree, à la suite.
2. Sinon, parmi les worktrees pas encore à M issues, choisir celui qui **partage le plus** de
   fichiers/aires avec ce qu'il contient déjà.
3. À égalité (aucun recoupement avec personne), prendre le worktree **le moins rempli** — pour que
   les N agents démarrent avec un lot comparable, et que les priorités les plus hautes ne finissent
   pas toutes dans le même worktree pendant que les autres attendent.

Un lot peut rester sous M issues si les candidates s'épuisent avant : le dire, ne pas combler avec
une priorité plus basse que ce que la règle d'or 2 autoriserait.

## 5. Rendre le plan

Pour chaque worktree 1..N :

- la liste des issues, **dans l'ordre où les traiter** (dépendances d'abord) ;
- l'aire dominante du lot, et pourquoi ces issues sont regroupées plutôt qu'ailleurs ;
- le nom de branche de la première issue (motif du skill `feature` : `<prefixe>/<numéro>`) et la
  commande pour créer le worktree :
  ```bash
  git worktree add ../cimavia-<numéro> -b <prefixe>/<numéro> main
  ```
  Les `.env` et les ports/bases e2e suivent automatiquement (`scripts/worktree-env.mjs`, `@cmv/e2e`
  — rien à configurer).

Puis :

- **Conflits résiduels** : toute paire de fichiers/aires qui se recoupe malgré tout entre deux
  worktrees différents (inévitable si moins de N zones distinctes existent) — nommer les deux
  worktrees et le fichier en cause, pour que l'ordre de merge se décide en connaissance de cause.
- **Origine** : combien d'issues viennent de `docs/priorites.md`, combien du board, et lesquelles.
- **Écarté** : épics et « Cadrage : » rencontrées, pour validation séparée.
- Si même le board ne fournit pas N × M : le dire, rendre ce qu'il y a.

## 6. Application, sur demande

Lecture seule jusqu'ici. Si le développeur valide le plan :

- donner les N commandes `git worktree add` (§5) — **je ne les lance pas**, ni aucune commande
  git ;
- proposer de passer les issues sélectionnées à **Status = En cours** sur le board — écriture
  GitHub, donc **sur confirmation explicite**, et seulement celles que le développeur fait
  démarrer réellement ;
- pour chaque worktree, le lot devient l'enquête du skill `feature`, une issue à la fois dans
  l'ordre du §5 — à lancer dans sa propre session/agent, pas dans celle qui a produit le plan.

## Pièges

- **Le fichier s'appelle `docs/priorites.md`**, sans « y » — un `grep -rn "priorities"` resterait
  muet.
- **Une épic n'a pas de ligne dans `docs/priorites.md`** (note en tête du fichier) : elle n'apparaît
  donc jamais comme candidate directe, seuls ses enfants y sont — mais un enfant peut malgré tout
  être bloqué par un autre enfant de la même épic resté dans un autre lot.
- **`gh issue view` et `gh pr edit` sont cassés** sur ce dépôt (dépréciation Projects classic) :
  lecture et écriture passent par `gh api` (voir skill `issue`).
- **Compter les fichiers, pas les aires, pour juger un conflit réel** : deux issues `area: web` sur
  des écrans sans aucun composant commun ne se gênent pas plus que deux issues d'aires différentes.
