---
name: feature
description: Développer une feature Cimavia de bout en bout, d'une issue GitHub (ou d'une demande) jusqu'à des commits relus un par un. Enquête d'abord, remonte les contradictions, propose un plan, puis livre. À utiliser dès qu'on demande de développer, implémenter, corriger ou terminer une feature, un écran ou une issue sur ce dépôt.
---

# Développer une feature

Pilote une feature de l'issue aux commits. **Ce fichier ne contient aucune règle projet** : il dit
quoi lire, quelles questions poser, et dans quel ordre livrer.

## Règles d'or

1. **Les règles vivent dans les docs, pas ici.** `CLAUDE.md` (règles dures, porte qualité, façon de
   travailler), `docs/architecture-choice.md`, `docs/CONTEXT.cimavia.md` (termes canoniques),
   `docs/dette-technique.md`. **En cas de contradiction avec ce fichier, les docs gagnent** — et
   c'est un résultat à signaler.
2. **Ce qui cloche se signale, ne se répare pas en douce.** Test cassé, doc fausse, dette mal
   suivie : le dire. Le corriger seulement si c'est le sujet de la PR, ou après accord.
3. **Je n'exécute jamais git** (add, commit, push) **ni les interfaces web** (GitHub, Scaleway,
   Neon, SonarCloud, secrets, branch protection). Je les liste, Kylian les fait.

## 1. Situer

- Lire l'issue : `gh api repos/Cimavia/cimavia/issues/<n>`. **`gh issue view` est cassé** sur ce
  dépôt (dépréciation Projects classic).
- Remonter la famille : épic parente, issues sœurs **déjà fermées**, jalon, labels. Les corps des
  sœurs livrées portent les décisions structurantes qui contraignent encore le travail.
- Sans numéro d'issue : demander s'il faut en créer une d'abord (→ skill `issue`).

## 2. Enquêter

Neuf questions, avant toute proposition. Trois d'entre elles sont de simples `grep` et ont déjà
évité des régressions réelles.

| # | Question | Où chercher |
|---|---|---|
| 1 | L'issue correspond-elle à une **ligne du journal de dette** ? La colonne « Suivi » pointe-t-elle bien vers elle ? L'en-tête la range-t-elle parmi les dettes « sans issue » ? | `docs/dette-technique.md` |
| 2 | Quels encadrés **« Tranché en #N »** touchent cette zone ? L'issue en **contredit**-elle un ? | idem, section concernée |
| 3 | Le code visé est-il dans **`@cmv/shared`** ? **Qui d'autre l'appelle** ? Le label `area:` couvre-t-il ce qui est vraiment touché ? | `grep -rn` sur le symbole |
| 4 | L'issue nomme-t-elle un **déclencheur** ? Ce qui est demandé y répond-il, ou le **déguise**-t-il ? Une autre issue couvre-t-elle la vraie cause ? | corps de l'issue + issues ouvertes |
| 5 | Les **données nécessaires existent-elles**, sont-elles déjà chargées, et **que valent-elles** ? (angle mort, auteur inconnu, liste bornée ou non) | schémas `@cmv/shared` + service API |
| 6 | Sur chaque champ **nullable** touché : `null` veut-il dire « indisponible » ou « rien » ? Le traitement prévu **confond-il les deux** ? | règle dure n°5 de `CLAUDE.md` |
| 7 | Y a-t-il une **maquette** ? Que prévoit-elle *vraiment* — l'ouvrir, ne pas se fier au résumé de l'issue. Quels écarts sont déjà consignés ? | `docs/maquettes/` |
| 8 | **Quel code existant fait déjà la même chose ?** Composant, util, patron de test. | `grep` sur les voisins |
| 9 | Une **autre issue ouverte** couvre-t-elle déjà ça ? Si j'en propose une, le slug est-il libre ? | liste complète des issues |

## 3. Rapport de contradictions — AVANT le plan

Ne pas enchaîner sur le plan. Remonter d'abord :

- **ce qui cloche** dans l'existant (doc qui ment, arbitrage contredit, label incohérent) ;
- **ce que je ne peux pas trancher seul** — un arbitrage produit, une priorité, un retour beta que
  je n'ai pas ;
- **les questions dont la réponse change le travail**, et attendre.

Le reste (ce qui ne dépend pas de ces réponses) peut avancer en parallèle.

## 4. Plan, puis validation

Plan d'abord, **attendre la validation** (`CLAUDE.md`). Le plan tranche explicitement :

- le **découpage en commits**, et ce qui va dans `@cmv/shared` (mesuré en couverture) plutôt que
  dans un composant web ou mobile (qui ne l'est pas — §11) ;
- **le mobile suit, reste en l'état, ou reçoit sa propre issue** — vérifier l'état réel de l'écran
  avant de trancher, pas le supposer ;
- les **issues à créer**, les corrections de journal, le comportement à vide et en panne ;
- **ce que Kylian devra lancer** pour tester : un scénario, pas une liste de cas.

## 5. Livrer

Commits atomiques, **relus un par un**. Pour chacun, donner :

- `git add` **chemin par chemin** (jamais `-A` : l'arbre peut contenir des modifs de Kylian) ;
- `git commit -m "..."` complet, conforme commitlint — **sujet en minuscule**, header ≤ 100, corps
  ≤ 100 par ligne, `Closes #n` / `Refs #n` **dans le corps**. Une seule ligne pour le corp du commit.
- ⚠️ **Pas de backtick ni de `!` dans une chaîne en double quotes** : le shell les interprète.

Le corps du commit porte **le pourquoi**, pas le quoi — le diff dit déjà le quoi. Attendre la
relecture avant de produire l'incrément suivant.

## 6. Portes

**La porte qualité de `CLAUDE.md`** (section *Porte qualité*) — je lance ce qui est automatisable,
Kylian lance les e2e, les migrations et l'app. Lui préparer de quoi tester.

## 7. Journal, issues, board

- Une dette traitée ou prise se met à jour dans `docs/dette-technique.md` **dans la PR qui la
  traite**, pas plus tard — ligne du tableau **et** en-tête si elle y est citée.
- Une **décision que le code ne justifie pas seul** se consigne en encadré « Tranché en #N ».
- Les issues à créer se proposent, puis se créent après validation (→ skill `issue`).
- Toute anomalie de board (statut, titre désynchronisé, relation manquante) se signale.

## 8. Ce que je dois demander

Le skill ne sait pas : les retours de la bêta, la priorité réelle, les arbitrages produit, ce que
le développeur a en tête et qui n'est écrit nulle part. **Le demander plutôt que le supposer** — c'est le
seul contenu qu'il devait encore écrire à la main.
