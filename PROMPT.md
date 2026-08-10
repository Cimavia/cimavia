Tu vas développer l'épic **#20 « [multi-plateforme] — Parité multi-plateforme (coach sur mobile,
athlète sur web) »** (issue 20 sur gh).

La copie de semaine (#4) vient d'être livrée, recettée et mergée sur main : brique de copie profonde
côté API, geste copier/coller dans le builder web, 12 e2e de plus (**161 au total**). Elle a laissé
une dette tracée, #126 (`[qa_3]` — les e2e ne sont pas typecheckés), hors périmètre ici.

#20 est en `Prêt`, milestone **v0.9 — MVP**, sans Phase sur le board. Ses 4 maquettes (#21→#24) sont
**Done** ; ses **12 écrans restants (#25→#36) sont tous `Prêt`** et aucun n'est commencé.

⚠️ **Deux choses à vérifier AVANT de me proposer quoi que ce soit** — je ne veux pas les découvrir
en cours de route :

1. **La chaîne de dépendances est cassée en bout.** #35 (nav) déclare dépendre de **#10**
   (`[roles_2]` — guards & tenancy par capacité), qui dépend de **#9** (`[roles_1]` — colonnes
   `isCoach`/`isAthlete` sur `User`). **#9 et #10 sont en `Idée`**, dans une AUTRE épic (#7). Et #36
   (E2E/QA) dépend de #35. Autrement dit : **10 des 12 enfants sont faisables tout de suite, les 2
   derniers sont bloqués par une épic non commencée.** Dis-moi comment tu traites ça — le corps de
   #35 évoque un fallback sur `role`, mais je veux ton arbitrage, pas la reprise de la phrase.
2. **Les maquettes livrées ne correspondent pas au découpage annoncé.** #21→#24 promettaient 3 à 4
   écrans chacune ; le dépôt ne contient qu'**un seul fichier par cible** :
   `docs/maquettes/web-athlete/athlete_web.dc.html` et
   `docs/maquettes/mobile-coach/coach_mobile.dc.html`. Ouvre-les et dis-moi ce qu'ils couvrent
   RÉELLEMENT des 10 écrans à construire, et où tu es en terrain neuf.

Avant de coder, lis :

- `docs/cahier-des-charges-mvp.md` — §5.5 consultation athlète, §5.6 débrief, §6 exigences non
  fonctionnelles, §7 architecture technique, §11 internationalisation.
- `docs/architecture-choice.md` — conventions (**§1 règle de promotion + plomberie HTTP partagée
  `create<X>Api`** — c'est le cœur du sujet ici, §3 mobile dont la règle « pure shells » et les
  content paths NativeWind, §4 web, §5 design system, §6 pièges du scope automatique, §9 routing
  mobile).
- `docs/CONTEXT.cimavia.md` — glossaire métier, dont **Rôles & accès (résumé)** qui est la table de
  vérité de ce qui doit devenir accessible à qui, `Session — modèle vs instance`, `SessionFeedback`,
  `Conversation / Message`, `Invoice`, et le tableau **Multi-tenant**.
- `docs/dette-technique.md` — en particulier **P5-5 / #96** (préparation média dupliquée entre
  `feature/feedback` et `feature/message` côté mobile, ET entre mobile et web), **P5-3** (interop
  note vocale web → iOS), l'**écart de promotion `REMINDER_BADGE`** (la règle 2+ apps appliquée à une
  table de variants), et **Q-1/#56** (couverture non mesurée hors `@cmv/shared`).
- `docs/maquettes/web-athlete/athlete_web.dc.html` et `docs/maquettes/mobile-coach/coach_mobile.dc.html`
  — les deux seules maquettes de cet épic.
- `docs/maquettes/shared/conversation_1_1.dc.html` — #29 et #34 disent explicitement qu'elle couvre
  déjà les deux plateformes, donc aucune maquette à produire pour la messagerie.
- `README.md` (setup, commandes, section « Clés i18n assemblées ») et `CONTRIBUTING.md` (git flow,
  commits signés, observabilité).
- Analyse le projet github **Cimavia — Roadmap**, et lis les corps de #20 et #25→#36 par
  `gh api repos/Cimavia/cimavia/issues/<n>`.

⚠️ Les corps d'issues citent des **numéros de ligne périmés** (#27 pointe `InvoicesScreen.tsx:38`,
la garde est à la 53 ; #29 pointe `MessagesScreen.tsx:52`, elle est à la 64). Vérifie chaque
référence de fichier avant de t'appuyer dessus.

Rappels — acquis P0→P7 + notifications + rappels + dashboard + copie de semaine à respecter :

- **Aucun changement backend n'est attendu** (#20 le dit) : les endpoints sont scopés par rôle, pas
  par plateforme. Si tu découvres qu'un endpoint manque ou qu'une garde bloque à tort, c'est un
  RÉSULTAT à me signaler, pas un feu vert pour élargir le périmètre.
- Multi-tenant : toute entité est dans `TENANT_SCOPES` et accédée via `TENANT_PRISMA`. Les `include`
  imbriqués ne sont PAS scopés ; les FK n'imposent pas le tenant. **`Reminder` est scopé `coachId`
  SEUL** — un athlète qui atteint ce modèle prend une *erreur* (fail closed), pas un 403 : deux
  gardes doivent le précéder (`@Roles` + branchement par rôle). Ouvrir des écrans à l'autre rôle,
  c'est exactement le terrain où ce piège se déclenche.
- **`AthletePlanService` est le seul point d'entrée de la lecture athlète** : le scope tenant ne dit
  rien du STATUT, c'est lui qui impose `PUBLISHED`. Ne reconstitue pas ce filtre côté client.
- Le libellé d'une notification n'est jamais stocké : `type` + cible + paramètres, rendu client via
  `NOTIFICATION_LABEL_KEY` + i18next. `routeForNotification` existe des deux côtés — ouvrir des
  écrans change les destinations possibles, vérifie qu'aucune cible ne devient un cul-de-sac.
- **Plomberie partagée : `createNotificationApi(api)` et `createReminderApi(api)` dans `@cmv/shared`
  sont la règle** (architecture-choice §1), et la règle dit « à faire dès le PREMIER client si le
  second est prévu ». Ici le second client arrive vraiment, pour `plan`, `invoice`, `feedback`,
  `message`, `account`. C'est le point d'attention n°2 ci-dessous.
- Règle de promotion : 2+ apps → `@cmv/*`, 1 seule app → reste dans l'app. Les composants restent
  **non partagés** web↔mobile (implémentations distinctes) ; seuls les **tokens**, les **DTO** et la
  **logique pure** montent.
- Design system : composants préfixés `Cmv`, **zéro `#xxxxxx`** hors `@cmv/tokens` / `theme/`. Les
  familles de tokens sont des **ÉTATS** (arbitrage #37) — ne les détourne pas pour décorer.
- Mobile : `app/` = routing ou shell d'1 ligne, aucune logique. **`tailwind.config.js#content[]` à
  mettre à jour à chaque création de dossier**, sinon NativeWind n'extrait pas les classes et les
  bugs visuels sont silencieux (le typecheck ne les voit pas).
- Nullable, pas de fallback silencieux : une fonction sur données manquantes rend `null`, jamais une
  valeur de repli ; le rendu affiche `—`.
- i18n : aucune string en dur, **dans les deux catalogues**. Toute clé ASSEMBLÉE doit porter son
  annotation `// i18n-values <prefixe>: <Enum|valeurs>` sous les imports, sinon `pnpm check:i18n` la
  signale comme non vérifiée. Attention : les catalogues web et mobile sont **distincts** — ouvrir
  un écran à l'autre rôle veut souvent dire recopier des clés d'un catalogue à l'autre. Dis-moi si
  tu factorises ou si tu dupliques, et pourquoi. (#124 `[i18n_1]` trace déjà l'unification du
  tutoiement, hors périmètre.)
- Observabilité : Pino → Axiom + Sentry sur les 3 couches.
- Infra mail : le dernier `// MOCKED` (`apps/api/src/auth/auth.config.ts`) est tracé par l'épic #61 —
  hors périmètre, ne pas le traiter.

Cinq points d'attention — à trancher dans le plan, pas à découvrir en cours de route. Ne me les
renvoie pas en question ouverte :

1. **Le découpage en PR, et l'ordre.** 12 enfants ouverts, ~10 faisables tout de suite. Une PR par
   enfant ? Une par plateforme ? Une par « tranche verticale » (un rôle sur une plateforme, bout en
   bout) ? Dis ce que tu livres, dans quel ordre, et ce qui est relisible en une fois. Je relis des
   commits atomiques un par un : un découpage qui produit une PR de 40 fichiers est un mauvais
   découpage.
2. **La plomberie HTTP.** C'est LE moment de vérité de la règle §1 : `plan`, `invoice`, `feedback`,
   `message` deviennent bi-clients d'un coup. Tu promeus en `create<X>Api(api)` dans `@cmv/shared`
   **en amont** (un gros refactor avant toute UI), **au fil de l'eau** (chaque écran promeut ce qu'il
   touche), ou **pas du tout** ? Rappel : le seuil Sonar `new_duplicated_lines_density` ≤ 3 % fait
   échouer la PR, et la doc dit que la bonne réponse est la promotion, **jamais** une exclusion.
3. **Les gardes de rôle.** Côté web, **8 écrans** portent un `if (authSession?.user.role !==
   Role.COACH) return <Navigate to="/" />` recopié à l'identique ; côté mobile, la symétrie existe
   pour l'athlète. Cet épic doit en ouvrir une partie et en garder d'autres fermées (la bibliothèque
   et le builder restent **web-only**, décision explicite de #20). Tu retires les gardes une par
   une, ou tu introduis un point unique (garde de route TanStack, composant `CmvRoleGate`) ? Et
   comment ce choix survit à #10, qui remplacera `role` par `isCoach`/`isAthlete` ?
4. **Le débrief sur web (#26) et la dette #96.** La préparation média est **déjà** dupliquée entre
   `feature/feedback` et `feature/message` côté mobile, et entre mobile et web (dette P5-5). Porter
   le débrief athlète sur web ajoute un quatrième exemplaire. Tu traites #96 dans cette livraison,
   tu l'aggraves en l'assumant, ou tu refuses de porter #26 tant que #96 n'a pas atterri ? Et dis ce
   que la note vocale web → iOS (P5-3, #82) devient sur un débrief web.
5. **La nav (#35) et le blocage #10/#9.** C'est le dernier écran et le seul qui rend les autres
   atteignables : sans nav, dix écrans existent sans qu'aucun utilisateur ne puisse y arriver. #15
   (nav web sectionnée) et #16 (nav mobile double capacité) sont **closes** — dis-moi ce qu'elles
   ont réellement laissé et ce qu'il reste. Puis tranche : nav sur `role` maintenant quitte à la
   refaire en #10, remontée de #9/#10 dans le périmètre, ou #35/#36 explicitement hors de cette
   livraison. Pas de quatrième option silencieuse.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + les e2e (**161 actuellement**) doivent passer avant de conclure
  une étape. Les e2e exigent LES DEUX composes :
  `docker compose -f apps/api/docker-compose.test.yml up -d` (base e2e sur 5434) et
  `docker compose -f apps/api/docker-compose.yml up -d minio-setup`.
- `pnpm check:i18n` doit sortir en 0 (branché dans la CI). Lance-le aussi en `--strict`.
- Le build de production des deux apps doit passer (`pnpm --filter @cmv/web exec vite build`) — le
  typecheck ne couvre pas tout, notamment les content paths NativeWind côté mobile.
- SonarCloud sur la PR : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %.
  ⚠️ **La couverture n'est mesurée QUE sur `packages/shared`** (dette Q-1) : un épic presque
  entièrement fait d'UI n'a quasiment rien de mesuré, mais **tout ce qui monte dans `@cmv/shared`
  doit être testé**. Le seuil de duplication, lui, mordra pour de bon — c'est le vrai risque ici.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- #20 et ses 12 enfants n'ont **aucune Phase** sur le board alors que la milestone est `v0.9 — MVP`.
  Dis-moi s'il faut la poser, et laquelle.
- Vérifie l'état réel des **sub-issues et des relations bloquantes** de #20 dans GitHub : la case du
  corps de #20 (`- [ ] #25`…) n'est pas la même chose qu'une relation. Dis-moi ce qui manque.
- Dis-moi si des enfants sont devenus **sans objet** ou **redondants** depuis leur écriture (#15/#16
  closes, le dashboard #110 livré, `/athletes` supprimé au profit du dashboard en #113 — #30 parle
  encore de « liste/gestion athlètes » côté mobile).
- Vérifie qu'aucune autre issue n'est débloquée par cette livraison, et signale-le-moi.

Convention d'issues GitHub :

- Pattern de nommage : `[feature-name_numero] - titre`. S'il faut plusieurs issues (découpage parent
  enfant) : une épic `[feature-name] - titre` et des enfants `[feature-name_X]`.
- Vérifie la numérotation existante de la famille avant de créer (`[multi-plateforme_17]`,
  `[qa_4]`… se déduisent des issues déjà là, pas d'un compteur mental).
- Les issues doivent être reliées par des relations directement dans GitHub (sub-issues) et être
  bloquantes les unes par rapport aux autres si l'ordre d'implémentation compte.
- `gh issue view` est cassé sur ce dépôt (dépréciation Projects classic) : passer par
  `gh api repos/Cimavia/cimavia/issues/<n>`.
- Les issues créées sont aussi à ajouter au board « Cimavia — Roadmap » (Status = Idée, Phase = v1.0).

Façon de travailler (inchangée) :

- D'abord un plan → j'attends ta validation avant que tu codes.
- Puis tu me donnes des commits atomiques que je valide 1 par 1 et je fais les commandes moi-même
  (git add, git commit, git push).
- Les actions sur interfaces web (Scaleway, Neon, Cloudflare, EAS, SonarCloud, secrets GitHub,
  branch protection, DNS) c'est MOI qui les fais : liste-les explicitement, ne tente pas de les
  exécuter.
- Je teste moi-même (migrations, e2e, app sur téléphone physique) : prépare-moi de quoi tester,
  je lance et je rapporte. Tu me feras un plan de test manuel à la fin — et il devra couvrir les
  DEUX plateformes, sur un téléphone physique pour le mobile.
- Pour la dette : tu me proposeras les issues GitHub, je valide, tu les crées.

Commence par me proposer le plan. Ne code pas avant que je valide.
