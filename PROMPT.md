Tu vas terminer l'issue **#123 « [dashboard_5] — Recherche, tri et filtres du tableau de suivi »**.
Lis-la par `gh api repos/Cimavia/cimavia/issues/123`.

**Ce que ça représente** : c'est le **dernier enfant ouvert de l'épic #110 (dashboard coach)**, dont
les quatre autres (#52, #111, #112, #113) sont fermés — l'épic elle-même est déjà fermée. Le jalon
`v0.9 — MVP` est clos (47 issues, 0 ouverte). On est donc en `v1.0 — Ready for prod`, sur une issue
`prio: low` étiquetée `type: dette` : rien ne presse, et c'est précisément ce qui autorise à faire
les choses proprement plutôt qu'à livrer une barre d'outils cosmétique.

⚠️ **Quatre choses à vérifier AVANT de me proposer quoi que ce soit** — je ne veux pas les
découvrir en cours de route :

1. **Le journal de dette ment sur cette issue.** `docs/dette-technique.md` porte la dette **D-2**
   (ligne ~379) avec, en colonne « Suivi », `— *(déclencheur : un coach qui scrolle pour se
   retrouver)*` — autrement dit **aucune issue**. Pire : l'en-tête du fichier (ligne ~24) range
   explicitement **D-2** parmi les « quatre dettes qui n'ont volontairement pas d'issue ». Or #123
   **est** cette dette, et elle existe. Deux endroits à corriger, et il faut le faire dans la PR
   qui traite D-2, pas plus tard.

2. **La colonne « Dernière activité » a été SUPPRIMÉE en #113, pour une raison — et #123 la
   réintroduit par la bande.** Le journal (encadré « Tranché en #113 ») dit : *« la colonne
   Dernière activité de la maquette est supprimée, pas reportée […] elle aurait de toute façon été
   partiellement fausse, une séance faite **sans** débrief n'apparaissant dans aucune liste que le
   coach charge »*. Or le tri « activité récente » et le filtre « À relancer » demandent exactement
   cette donnée. **Vérifie ce qui existe réellement avant de conclure** : `ConversationDto` porte
   un `lastMessageAt` (nullable) et `CoachFeedbackSummaryDto` porte `createdAt`/`updatedAt` — les
   deux sont **déjà chargés** par le `DashboardScreen`. Une dérivation « dernière activité » est
   donc calculable côté client dès aujourd'hui, mais elle héritera du même angle mort. Dis-moi si
   tu la construis quand même, ce qu'elle vaut, et comment tu empêches qu'on la lise comme une
   vérité — ou si tu sors le tri du périmètre. Ne fais pas semblant que le problème n'existe pas.

3. **`AthleteRow` est partagé web ↔ mobile, alors que #123 est étiquetée `area: web`.**
   `buildAthleteRows` (`packages/shared/src/util/athlete-row.util.ts`) sert le tableau web (#113)
   **et** l'écran mobile (`apps/mobile/feature/dashboard/screen/CoachDashboardScreen.tsx`). Y
   ajouter un champ d'activité touche donc les deux. Dis-moi si le mobile suit, reste en l'état, ou
   reçoit sa propre issue — et vérifie l'état réel de cet écran avant de trancher.

4. **Le déclencheur écrit dans l'issue est « un coach qui scrolle pour se retrouver ».** Demande-toi
   si des filtres sont bien la réponse à ça. **Il n'existe aucune issue de pagination des
   athlètes** : les quatre enfants de l'épic #68 couvrent les messages (#77), les notifications
   (#78), les exercices/séances (#79) et les rappels (#106) — pas la liste d'athlètes, qui est
   servie entière par `GET /athletes`. Si le vrai problème est le volume, filtrer côté client ne le
   règle pas, ça le déguise. Dis-moi ce que tu en penses ; si une issue manque, propose-la.

Avant de coder, lis :

- Les corps de **#123**, de l'épic **#110** (ses trois « décisions structurantes », qui contraignent
  tout ce qui touche cet écran) et de **#113**, qui a construit le tableau.
- `docs/dette-technique.md` — la section **Dashboard coach** : les dettes **D-1** (sept requêtes au
  chargement, suivie par #114) et **D-2**, et les encadrés **« Tranché en #52 »** (aucune
  information lue deux fois) et **« Tranché en #113 »** (ce que le tableau montre et ce qu'il ne
  montre pas — cinq points, dont la colonne supprimée).
- `docs/architecture-choice.md` — **§4** (web), **§5** (design system), **§7** (logique pure dans
  `@cmv/shared`), **§10** (i18n), **§11** (qualité & CI).
- `docs/CONTEXT.cimavia.md` — les termes canoniques.
- La **maquette** `docs/maquettes/web-coach/coach_dashboard_athletes.dc.html`. Sa barre d'outils est
  au-dessus du tableau : un champ « Rechercher un athlète… », un groupe segmenté
  **Tous / À relancer / Sans plan**, et à droite un sélecteur « Trier : activité récente ». Regarde
  ce qu'elle prévoit vraiment plutôt que de t'en tenir au résumé de l'issue.
- Le code existant, qui est le patron à suivre :
  `apps/web/src/feature/dashboard/` (`DashboardScreen.tsx`, `AthleteTrackingTable.tsx`),
  `packages/shared/src/util/athlete-row.util.ts` (+ son `.test.ts`),
  `apps/web/src/shared/component/CmvSegmented.tsx` (déjà utilisé par l'écran des rappels — le
  groupe Tous/À relancer/Sans plan a son composant),
  et `apps/mobile/feature/dashboard/` pour la question de parité.

L'existant à respecter :

- **Aucune information lue deux fois** (tranché en #52) : c'est la contrainte qui a façonné cet
  écran. Un filtre qui recompterait ce qu'une tuile annonce déjà serait un doublon d'information,
  pas une fonctionnalité.
- **`null` ne veut pas dire zéro.** `AthleteRow` distingue partout « source indisponible » (`null`,
  rendu « — ») de « rien à signaler » (`0`). Un filtre « Sans plan » qui attraperait les `null`
  mélangerait « cet athlète n'a pas de cycle » et « la liste des cycles n'a pas pu être lue » — le
  DTO documente explicitement ce piège sur `AthleteRow.plan`.
- **Logique pure dans `@cmv/shared`** (§7). Le web **n'est pas mesuré en couverture** (§11) : toute
  dérivation laissée dans un composant React n'aura aucun test. Le précédent est `buildAthleteRows`
  lui-même, et `reminderBadgeState`, extraite en #46 pour cette raison exacte.
- **Zéro string en dur** : tout passe par i18next, `pnpm check:i18n` doit sortir en 0 (lance-le
  aussi en `--strict`). Les clés assemblées demandent une annotation `// i18n-values` — le patron
  est en tête d'`AthleteTrackingTable.tsx`.
- **Design system** : composants préfixés `Cmv`, zéro `#xxxxxx` hors `@cmv/tokens`.

Points à trancher **dans le plan**, pas à découvrir en cours de route :

1. **Ce que devient « À relancer ».** L'issue le dit elle-même : ce filtre n'a **pas de définition
   métier** aujourd'hui. Donne-lui une définition défendable, ou sors-le — mais ne livre pas un
   bouton dont personne ne sait ce qu'il sélectionne.
2. **Où vit l'état de la barre d'outils.** Dans le composant, dans l'URL (`search` de TanStack
   Router, comme `/feedbacks?feedback=` et `/messages?athlete=` que le tableau produit déjà), ou
   ailleurs ? Un filtre qui ne survit pas à un rechargement n'est pas le même produit.
3. **Le comportement à vide.** Un filtre qui ne rend aucune ligne doit dire *pourquoi* — « aucun
   athlète ne correspond » n'est pas « vous n'avez aucun athlète ». C'est la même distinction que
   les trois états (chargement / erreur / vide) déjà tenue par cet écran.
4. **Le découpage en PR** et si le mobile est concerné (cf. point ⚠️ 3).

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + **les e2e** (186 aujourd'hui) doivent passer. Les e2e sont un
  check **requis** sur `main`.
- `pnpm check:i18n` **et** `pnpm check:i18n --strict` doivent sortir en 0.
- Le build de production des deux apps : `pnpm --filter @cmv/web exec vite build` et, **si tu
  touches au mobile**, `npx expo export --platform android`.
- SonarCloud : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %. `apps/api` et
  `@cmv/shared` sont mesurés, **le web ne l'est pas** — d'où la règle ci-dessus sur la logique pure.
- Si tu ajoutes une route d'API, elle se couvre par un e2e d'isolation. Si tu ajoutes une garde,
  **montre-la en échec**, pas seulement en succès.

Prérequis pour lancer les e2e (deux composes) :

```bash
docker compose -f apps/api/docker-compose.test.yml up -d
docker compose -f apps/api/docker-compose.yml run --rm minio-setup
pnpm --filter @cmv/api test:e2e
```

Si tu trouves un test cassé, c'est un **résultat à me signaler**, pas quelque chose à corriger en
douce dans la même PR.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- Corriger **D-2** dans `docs/dette-technique.md` : la ligne du tableau **et** l'en-tête qui la
  range parmi les dettes sans issue (cf. ⚠️ 1).
- Vérifier les champs de #123 sur le board « Cimavia — Roadmap » et me dire si quelque chose détonne.
- Vérifier qu'aucune autre issue n'est débloquée ou rendue caduque par cette livraison — regarde en
  particulier **#114** (endpoint d'agrégat, dette D-1) : si ton travail change le nombre de
  requêtes ou la façon dont les lignes sont composées, dis-le.

Convention d'issues GitHub :

- Pattern de nommage : `[feature-name_numero] - titre`. Épic parente `[feature-name] - titre`,
  enfants `[feature-name_X]`. Vérifie la numérotation existante de la famille avant de créer — la
  famille `[dashboard]` va de `_1` (#52) à `_5` (#123), plus `[dashboard_opti]` (#114).
- Relier les issues par des relations GitHub (sub-issues), et les rendre bloquantes entre elles si
  l'ordre d'implémentation compte.
- `gh issue view` est cassé sur ce dépôt (dépréciation Projects classic) : passer par
  `gh api repos/Cimavia/cimavia/issues/<n>`.
- Les issues créées sont à ajouter au board « Cimavia — Roadmap » (Status = Idée, Phase selon le
  jalon).

Façon de travailler :

- **D'abord un plan** → j'attends ma validation avant que tu codes.
- Puis des **commits atomiques que je valide 1 par 1**. Pour chacun, donne-moi la commande
  `git add` **et** la commande `git commit -m "..."` complète, respectant le hook commitlint
  (Conventional Commits, **sujet en minuscule**, header ≤ 100, corps ≤ 100 par ligne, ligne vide
  avant corps et footer). Mets les `Closes #<n>` / `Refs #<n>` **dans le corps**.
- C'est **moi** qui exécute git (add, commit, push) et les actions sur interfaces web (GitHub,
  Scaleway, Neon, Cloudflare, EAS, SonarCloud, secrets, branch protection, DNS) : liste-les
  explicitement, ne tente pas de les exécuter.
- **Je teste moi-même** (migrations, e2e, app) : prépare-moi de quoi tester, je lance et je
  rapporte. Cet écran est **web-only sauf décision contraire** — prévois un scénario de test au
  clavier et à la souris, pas seulement une liste de cas.
- Pour la dette : tu me proposes les issues GitHub, je valide, tu les crées.

Commence par me proposer le plan. Ne code pas avant que je valide.
