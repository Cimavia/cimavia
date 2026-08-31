---
name: issue
description: Créer et maintenir les issues GitHub du dépôt Cimavia/cimavia — instruire un retour ou une idée, rédiger l'issue, la relier (épic, sous-issue, blocage), l'étiqueter et la poser sur le board « Cimavia — Roadmap ». À utiliser dès qu'on parle de créer, découper, relier ou corriger des issues, ou de traiter des retours de bêta.
---

# Issues GitHub

Transformer un retour ou une idée en issue bien formée. **On ne code pas ici.**

## Règles d'or

1. **Instruire avant de proposer.** Vérifier dans le code ce qui existe, si une issue couvre déjà
   le sujet, si `docs/dette-technique.md` le consigne, ou si un encadré « Tranché en #N » l'a
   **déjà arbitré**. Un doublon ou une contradiction avec une décision passée est un **résultat à
   signaler**, pas à contourner.
2. **Proposer, puis créer.** Le développeur valide avant toute écriture sur GitHub.
3. **Termes canoniques de `docs/CONTEXT.cimavia.md`** (Coach, Athlete, Session, Plan, Feedback…),
   dans les titres comme dans les corps. Pas de synonyme inventé.

## Ce que porte une bonne issue de ce dépôt

Le **raisonnement**, pas seulement la demande. Voir #113, #110, #123, #139 pour le ton.

- une phrase d'attaque : l'état actuel, et ce qui cloche ;
- `## Contexte` — pourquoi c'est comme ça, avec fichiers et symboles nommés ;
- `## À faire` — le travail, pièges connus explicités ;
- `## Écarts assumés` ou `## À trancher` — une décision ouverte se dit, elle ne se choisit pas en
  silence ;
- `## Déclencheur` pour toute dette : ce qui doit se produire pour qu'on la traite. « Aucun » est
  une réponse valide. Jamais un seuil arbitraire.

Une issue ne doit pas contredire les règles dures de `CLAUDE.md` ni `docs/architecture-choice.md`
(logique pure dans `@cmv/shared`, `null` ≠ zéro, aucune information lue deux fois, zéro string en
dur, e2e d'isolation pour toute nouvelle route).

## Nommage et relations

- Pattern : `[feature-name_numero] - titre`. Épic `[feature-name] - titre`, enfants `_1`, `_2`…
- **Vérifier la numérotation avant de nommer** — `[pagination_4]` était déjà pris par #106, et #123
  a été renommée de `_6` en `_5` :
  ```bash
  gh api "repos/Cimavia/cimavia/issues?state=all&per_page=100" --paginate \
    --jq '.[] | "\(.number) \(.state) \(.title)"' | sort -n
  ```
- Relier par **sous-issues**, et poser un **blocage** quand l'ordre d'implémentation compte.
- Ne pas rouvrir une épic fermée pour y accrocher un enfant : issue autonome qui référence.

## Étiquettes, jalons, board

Source de vérité (les listes ci-dessous vieillissent) :
```bash
gh api repos/Cimavia/cimavia/labels --jq '[.[].name] | join(" · ")'
gh api repos/Cimavia/cimavia/milestones --jq '.[] | "\(.number) \(.title)"'
```

- `area: api|infra|mobile|shared|tokens|web` · `type: feat|dette|chore` · `bug` ·
  `prio: high|med|low` · `epic` · **`en attente beta`** pour les retours du coach bêta
  (précédents : #2, #5 ; l'arbitrage couleurs #37 en est issu).
- Jalons : `2` = « v1.0 — Ready for prod », `3` = « Multi rôle ». v0.9 (MVP) est clos.
- Board « Cimavia — Roadmap » : toute issue créée y est ajoutée, **Status = Prêt**, **Phase** selon
  le jalon.

## Mécanique `gh` (pièges rencontrés)

- **`gh issue view` et `gh issue create` sont cassés** ici (dépréciation Projects classic).
  Lecture : `gh api repos/Cimavia/cimavia/issues/<n>`.
  Écriture : `gh api repos/Cimavia/cimavia/issues --input -` avec un JSON sur stdin — les
  étiquettes contiennent des espaces, `-f 'labels[]=area: web'` casse au découpage.
- Sous-issue : `gh api repos/Cimavia/cimavia/issues/<parent>/sub_issues -F sub_issue_id=<id REST>`
  — **`-F`, pas `-f`** : l'API exige un entier.
- Blocage : `gh api repos/Cimavia/cimavia/issues/<n>/dependencies/blocked_by -F issue_id=<id REST>`.
- Board (le scope `project` est présent sur le token) — `addProjectV2ItemById` puis
  `updateProjectV2ItemFieldValue` avec `singleSelectOptionId` :
  - projet `PVT_kwDOEbnh1c4BeUYR`
  - Status `PVTSSF_lADOEbnh1c4BeUYRzhYvhSU` → Idée `729e2ea9` · À affiner `a3816c09` ·
    Prêt `7fb4b83a` · En cours `93c58002` · Done `94fc26ee`
  - Phase `PVTSSF_lADOEbnh1c4BeUYRzhYvi38` → P7 `d39b282a` · v1.0 `153c4b09` ·
    Plus tard `aaca0bc6`
  - Si un ID est refusé, les réinterroger : `projectV2(number: 1) { fields }`.

## Après création

- Si le sujet correspond à une dette de `docs/dette-technique.md`, la colonne « Suivi » doit
  pointer la nouvelle issue — **le dire**, la correction se fait dans la PR qui traite le sujet.
- Un retour qui est en fait un **bug reproductible** n'est pas une demande de fonctionnalité :
  le dire, l'étiquette diffère.
- Les actions d'interface (UI GitHub, secrets, branch protection) sont pour le développeur : les lister.
