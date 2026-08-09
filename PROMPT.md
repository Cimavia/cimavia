Tu vas développer la feature « copier/coller une semaine de planification » (issue 4 sur gh).

Le dashboard coach (#110 : #52, #111, #112, #113) vient d'être livré, recetté et mergé sur main, et
le contrôle des clés i18n assemblées (#115) avec. Le board n'a plus d'issue `prio: high` ouverte :
#4 est la suivante, en `Prêt` / Phase v1.0, milestone v0.9.

⚠️ #4 porte le label `en attente beta` — elle attendait un retour d'usage réel. Confirme-moi que ce
retour a bien eu lieu avant de partir, ou dis-moi ce qui te fait la déclencher maintenant.

#5 (duplication d'une planification entière) est sa sœur : `Prêt`, v1.0, et son corps annonce
explicitement de « mutualiser la brique de copie profonde côté API ». Elle est HORS périmètre de
cette PR, mais tu dois me dire dans le plan si tu construis cette brique pour deux ou pour une.

Avant de coder, lis :

- docs/cahier-des-charges-mvp.md — §5.4 planifications, §6 exigences non fonctionnelles,
  §7 architecture technique, §11 internationalisation.
- docs/architecture-choice.md — conventions (§1 règle de promotion + plomberie HTTP partagée
  `create<X>Api`, §2 backend, §4 web, §6 pièges du scope automatique, §7 logique pure partagée et
  règle « nullable, pas de fallback silencieux »).
- docs/CONTEXT.cimavia.md — glossaire métier, dont `Plan`, `PlanWeek`, `ScheduledSession`,
  `ScheduledSessionExercise — la copie, pas la référence`, `Session (séance) — modèle vs instance`.
- docs/dette-technique.md — la décision « Tranché en P3 » sur la copie autonome, et les dettes
  P2-1 / P3-2 (objets storage orphelins) et N-6 (aucun groupement des ajustements de cycle).
- docs/maquettes/web-coach/coach_builder_planification.dc.html — l'écran concerné. ⚠️ Il ne prévoit
  AUCUN geste de copie : tu es en terrain neuf sur l'UI, dis-moi ce que tu ajoutes et où.
- README.md (setup, commandes, section « Clés i18n assemblées ») et CONTRIBUTING.md (git flow,
  commits signés, observabilité).
- Analyse le projet github Cimavia - Roadmap.

Rappels — acquis P0→P7 + notifications + rappels + dashboard à respecter :

- Multi-tenant : toute entité métier est dans TENANT_SCOPES et accédée via TENANT_PRISMA. Les
  include imbriqués ne sont PAS scopés ; les FK n'imposent pas le tenant. Toute référence entrante
  (`planWeekId` source ET cible) doit être validée comme POSSÉDÉE avant écriture → 400, jamais un
  404 qui révélerait l'existence d'un id.
- `PlanWeek` et `ScheduledSession` portent `coachId`/`athleteId` DÉNORMALISÉS, parce que l'extension
  filtre par un champ du modèle interrogé et ne sait pas remonter la relation. L'extension les
  injecte à la création — aucun service ne les renseigne. Une copie inter-planification doit donc
  atterrir avec l'`athleteId` de la planification CIBLE, jamais celui de la source.
- La copie est déjà un acquis du modèle : `ScheduledSessionExercise` est une **copie autonome**
  (snapshot titre/description/catégorie/prescription + `sourceExerciseId` nullable en `SetNull`,
  traçabilité seule), et les documents sont **copiés en lignes partageant la clé objet**. La brique
  existe dans `ScheduledSessionService` (`loadSourceDocuments`, `insertExercises`) — ne la réécris
  pas, réutilise-la ou promeus-la.
- Les dates ne sont PAS stockées sur `PlanWeek` : elles se déduisent de `Plan.startDate` (toujours
  un lundi) et de `weekNumber`, via `planWeekRange` / `isDateInPlanWeek` / `planWeekNumber`
  (@cmv/shared, testées). `ScheduledSession.scheduledDate` est une DATE CIVILE contrainte à la plage
  de sa semaine (invariant de service), et `@@unique([planWeekId, scheduledDate, position])`.
- Diffusion : ajouter/retirer/modifier une séance sur un cycle `PUBLISHED` NOTIFIE l'athlète
  (`notifyPlanSessionAdded` / `notifyPlanSessionRemoved` / `notifyPlanUpdated`) — et la dette N-6 dit
  qu'il n'y a AUCUN groupement. Coller une semaine de 5 séances émettrait 5 notifications et 5 push.
- Le libellé d'une notification n'est jamais stocké : on persiste `type`, la cible et les paramètres,
  le rendu se fait côté client via `NOTIFICATION_LABEL_KEY` + i18next.
- Plomberie partagée : `createNotificationApi(api)` puis `createReminderApi(api)` dans @cmv/shared
  sont la règle (architecture-choice §1) pour tout appel que les deux clients font. Le builder est
  web-only aujourd'hui — dis-moi si tu promeus ou non.
- Règle de promotion : 2+ apps → `@cmv/*`, 1 seule app → reste dans l'app. La logique de calendrier
  (`plan.util.ts`) est partagée et testée ; toute dérivation de dates de copie y a sa place.
- Nullable, pas de fallback silencieux : une fonction sur données manquantes rend `null`, jamais une
  valeur de repli. `planWeekNumber` rend `null` hors du cycle — ne le contourne pas.
- i18n : aucune string en dur. Toute clé ASSEMBLÉE doit être déclarée par une annotation
  `// i18n-values <prefixe>: <Enum|valeurs>` sous les imports de son fichier, sinon `pnpm check:i18n`
  la signale comme non vérifiée.
- Observabilité : Pino → Axiom + Sentry sur les 3 couches.
- Infra mail : le dernier `// MOCKED` (apps/api/src/auth/auth.config.ts) est tracé par l'épic #61 —
  hors périmètre, ne pas le traiter.

Cinq points d'attention — à trancher dans le plan, pas à découvrir en cours de route. Ce sont
exactement les « à préciser plus tard » de l'issue, ne me les renvoie pas en question ouverte :

1. **Ce que la copie emporte, et ce qu'elle laisse.** Séances, exercices, documents, notes, type de
   semaine — mais sûrement pas les débriefs (`SessionFeedback`), ni les messages rattachés, ni
   `ScheduledSessionStatus` (une séance collée est `PLANNED`, pas `DONE`). Justifie chaque exclusion.
   Et dis ce que le partage de clé objet des documents copiés ajoute aux dettes P2-1/P3-2.
2. **Les dates.** Copier la semaine N vers la semaine M décale de (M−N)×7 jours. Dis ce qui se passe
   si la cible n'existe pas encore, et comment tu respectes `@@unique([planWeekId, scheduledDate,
   position])`.
3. **La semaine cible non vide.** Fusion, remplacement, ou refus ? La contrainte d'unicité rend une
   fusion naïve impossible. Tranche, et dis ce que voit le coach.
4. **Le cycle diffusé.** Coller dans un `PUBLISHED` déclenche une notification et un push PAR
   séance (dette N-6). C'est le point le plus visible côté athlète : soit tu groupes, soit tu
   l'assumes explicitement, soit tu refuses le geste sur un cycle diffusé. Pas de quatrième option
   silencieuse.
5. **La brique partagée avec #5.** Tu écris un service de copie profonde réutilisable, ou tu fais le
   minimum pour #4 quitte à le généraliser plus tard ? Les deux se défendent — je veux l'arbitrage
   explicite, pas un choix par défaut.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + les e2e (149 actuellement) doivent passer avant de conclure une
  étape. Les e2e exigent LES DEUX composes :
  `docker compose -f apps/api/docker-compose.test.yml up -d` (base e2e sur 5434) et
  `docker compose -f apps/api/docker-compose.yml up -d minio-setup`.
- `pnpm check:i18n` doit sortir en 0 (branché dans la CI).
- SonarCloud sur la PR : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %.
  La couverture n'est mesurée QUE sur packages/shared — tout code neuf qui y entre doit être testé.
  Une copie profonde est de la logique : si elle reste côté API, elle n'est couverte que par les e2e.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- #4 et #5 portent toutes deux `en attente beta` alors qu'elles sont en `Prêt` : dis-moi si le label
  doit sauter, et sur laquelle.
- Vérifie qu'aucune autre issue n'est débloquée par cette livraison, et signale-le-moi.

Convention d'issues GitHub :

- Pattern de nommage : [feature-name_numero] - titre. S'il faut plusieurs issues (découpage parent
  enfant) : une épic [feature-name] - titre et des enfants [feature-name_X].
- Vérifie la numérotation existante de la famille avant de créer (`[dashboard_6]`, `[profil_2]`…
  se déduisent des issues déjà là, pas d'un compteur mental).
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
  je lance et je rapporte. Tu me feras un plan de test manuel à la fin.
- Pour la dette : tu me proposeras les issues GitHub, je valide, tu les crées.

Commence par me proposer le plan. Ne code pas avant que je valide.