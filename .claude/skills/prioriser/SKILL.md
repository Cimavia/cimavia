---
name: prioriser
description: Réévaluer la priorité de TOUTES les issues ouvertes de Cimavia/cimavia sur le fond, sans tenir compte des labels prio, des jalons ni de l'origine (retour bêta ou non). Classe par thème, ajoute les priorités qui n'ont pas encore d'issue, rend un tableau par thème ; puis, sur demande, crée les issues manquantes et applique les labels `prio:`. À utiliser dès qu'on demande de reprioriser le backlog, de « réévaluer les priorités », de trier les issues, ou « qu'est-ce qui est vraiment prioritaire ».
---

# Repriorisation du backlog

Deux temps, jamais mêlés :

1. **Analyse**, en lecture seule : un tableau par thème, rendu dans la conversation.
2. **Application**, seulement quand le développeur la demande : issues manquantes créées, labels
   `prio:` mis à jour.

Rejoue la repriorisation du 2026-11-04 (#778 → #784 en sont issues).

## Règles d'or

1. **Juger sur le fond.** Ignorer les labels `prio:`, les jalons, `Feedback user` et
   `en attente beta`, sauf si la demande dit le contraire. Lire le **corps** de chaque issue, pas
   seulement le titre : c'est le corps qui dit si le risque est en service ou théorique.
2. **Une priorité se justifie** par l'exposition réelle (vraies données en preview depuis #260,
   geste quotidien, incident déjà arrivé) et par le coût du correctif. Un risque réel qui se
   corrige en dix lignes monte ; une dette dont le déclencheur n'est pas atteint descend.
3. **Un manque non vérifié n'est pas un manque.** Avant d'annoncer une priorité sans issue,
   chercher dans le code, dans **toutes** les issues (fermées comprises) et dans `docs/dette/`.
4. **Aucune écriture GitHub pendant l'analyse.** L'application suit le skill `issue` pour toute
   création : instruire, rédiger, nommer, relier, poser sur le board.
5. **Fermer ou fusionner ne se fait que sur demande explicite.** Sinon : le signaler.

## Échelle

| Retour | Label | Ce qui la justifie |
|---|---|---|
| 🔴 | `prio: urgent` | risque réel en service (faille, perte de données), ou bloquant légal, store ou prod |
| 🟠 | `prio: high` | geste quotidien cassé, filet de sécurité absent, travail en cours à finir, gros gain produit |
| 🟡 | `prio: med` | vrai défaut sans urgence, dette qui grossit avec l'usage |
| ⚪ | `prio: low` | dette dont le déclencheur n'est pas atteint, refactor sans bug, confort |

Une **épic** prend la priorité de son enfant ouvert le plus prioritaire. Elle n'apparaît pas dans
les tableaux.

## 1. Collecter

Dans le scratchpad, pas dans le dépôt :

```bash
gh issue list --state open --limit 300 --json number,title,labels,milestone,body > issues.json
jq -r 'sort_by(.number)[] | "=== #\(.number) \(.title)\n\(.body[0:700])\n"' issues.json
gh api "repos/Cimavia/cimavia/issues?state=all&per_page=100" --paginate \
  --jq '.[] | select(.pull_request==null) | "\(.number)\t\(.state)\t\(.title)"' | sort -n > all.tsv
```

La sortie dépasse la limite d'affichage : la lire par pages, toute. Ouvrir le corps complet
(`gh api repos/Cimavia/cimavia/issues/<n>`) dès que les 700 premiers caractères ne suffisent pas
à trancher.

## 2. Classer

Chaque issue ouverte apparaît **une seule fois**, dans un seul thème :

- **Sécurité** : faille, validation d'entrée, limite de débit, en-têtes, isolation (règle n°1).
- **Conformité et données personnelles** : RGPD, effacement, stores, hébergement (#259).
- **Bugs** : un comportement observable faux.
- **Performance et scalabilité** : volume, pagination, latence.
- **Fiabilité, exploitation et livraison** : sauvegarde, restauration, CI/CD, supervision, builds.
- **Fonctionnalités**.
- **Qualité et outillage** : tests instables, porte qualité, refactors.
- **Accessibilité et lisibilité**.
- **Doublons et fusions** : deux issues pour la même dette, ou un même chantier sous deux angles.

Un thème nouveau se crée s'il regroupe au moins trois issues que les autres rangent mal.

## 3. Chercher ce qui manque

Revérifier chaque angle à chaque passage. Ceux du 2026-11-04 ont tous reçu une issue, et la règle
d'or n°3 vaut pour eux comme pour le reste :

| Angle | Où regarder |
|---|---|
| En-têtes de sécurité du web | `apps/web/nginx.conf`, `apps/web/index.html` (#780) |
| Limite de débit (auth et métier) | `apps/api/src/auth/auth.config.ts`, gardes Nest (#781, #782) |
| IP du client derrière le proxy | `@better-auth/core` `dist/utils/ip.mjs` (#781) |
| Politique de confidentialité, mentions, CGU | `RegisterScreen` web et mobile (#778) |
| Sous-traitants et données envoyées | Sentry, Axiom, TEM, Expo, Cloudflare (#783) |
| Copie hors site et restauration | `deploy/preview/backup.sh`, README (#779, #772) |
| Supervision externe | `.github/workflows/`, `deploy/` (#784) |

Puis chercher au-delà de cette liste : un angle qui revient d'une revue (`/review`), d'un incident
récent du journal de dette, ou d'une règle dure que rien ne mesure plus.

## 4. Rendre l'analyse

- La légende de l'échelle, en une ligne.
- **Un tableau par thème**, trois colonnes `Issue | Nom | Prio`, trié de 🔴 à ⚪. La colonne
  `Issue` reste vide pour une priorité sans issue.
- Sous chaque tableau, une puce par 🔴 ou 🟠 : **pourquoi**, en une phrase.
- À la fin, « Par où je commencerais » (cinq ou six lignes) et les doublons ou fusions repérés.
- Ne rien écrire sur GitHub. Dire ce que l'application ferait.

## 5. Appliquer, sur demande

**Issues manquantes.** Suivre le skill `issue` : corps raisonné, nom `[slug] - titre`, jalon,
board (Status Prêt, Phase selon le jalon). Pour les renvois entre issues neuves, écrire des
repères `{{slug}}`, créer, puis remplacer par les numéros dans un `PATCH` du corps.

**Labels.** Écrire la cible `<numéro> <urgent|high|med|low>` dans un fichier, puis :

```bash
gh issue list --state open --limit 300 --json number,labels \
  --jq '.[] | "\(.number) \([.labels[].name|select(startswith("prio: "))|ltrimstr("prio: ")]|join(","))"' \
  | sort -n > current.txt
join -v1 <(sort current.txt) <(sort target.txt)   # ouvertes sans cible : en oubli
join -v2 <(sort current.txt) <(sort target.txt)   # cibles fermées entre-temps : les écarter
join <(sort current.txt) <(sort target.txt) | awk '$2!=$3' > changes.txt
```

N'écrire **que** `changes.txt`, puis relancer la comparaison. Elle doit être vide, avec exactement
un label `prio:` par issue :

```bash
while read -r n old new; do
  gh api -X DELETE "repos/Cimavia/cimavia/issues/$n/labels/prio:%20$old" --silent
  gh api "repos/Cimavia/cimavia/issues/$n/labels" -f "labels[]=prio: $new" --silent
done < changes.txt
```

## Pièges

- **Compter quelques secondes par issue** : une cinquantaine de changements dépasse le délai
  d'une commande au premier plan. La lancer en arrière-plan.
- **Un 502 de l'API GitHub n'est pas un échec certain.** Avant de relancer une création, lister
  les dernières issues : elle a peut-être été créée.
- **Une issue peut se fermer pendant l'analyse** (une PR mergée entre-temps) : `join -v2` la
  montre, et elle sort de la cible.
- Le hook Biome échoue sur les `.md` du scratchpad (« path is expected to be under the root ») :
  ces fichiers sont hors du dépôt, l'erreur est sans conséquence.
