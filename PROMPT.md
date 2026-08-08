Tu vas développer la feature dashboard coach (issue 52 sur gh).

Le système de rappels (#38 : #44, #45, #51) vient d'être livré, recetté et mergé sur main. #52
« Dashboard coach : tuiles rappels, notifications, factures en retard » déclarait dépendre de #44 et
#48 : les deux sont fermées, elle est donc débloquée — c'est la seule issue que ce merge a libérée,
et la dernière `prio: high` du board.

Deux enfants de #38 restent ouverts et HORS périmètre : #46 (mobile) est reportée, bloquée par #35
(nav par rôle) ; #47 (scheduler) attend une décision d'hébergement. Ne pas les traiter.

Avant de coder, lis :

- docs/cahier-des-charges-mvp.md — §6 exigences non fonctionnelles, §7 architecture technique,
  §11 internationalisation.
- docs/architecture-choice.md — conventions (§1 règle de promotion + plomberie HTTP partagée
  `create<X>Api`, §4 web, §5 design system, §6 pièges du scope automatique, §7 logique pure
  partagée et règle « nullable, pas de fallback silencieux »).
- docs/CONTEXT.cimavia.md — glossaire métier, dont les entrées `Reminder`, `Notification` et
  `Invoice`.
- docs/dette-technique.md — dettes ouvertes, en particulier R-1→R-5 (rappels) et N-1→N-7
  (notifications).
- docs/maquettes/web-coach/coach_dashboard_athletes.dc.html — la maquette de référence de l'écran
  (les 4 tuiles actuelles en viennent). Dis-moi explicitement si tu t'en écartes et pourquoi.
- README.md (setup, commandes) et CONTRIBUTING.md (git flow, commits signés, observabilité).
- Analyse le projet github Cimavia - Roadmap.

Rappels — acquis P0→P7 + notifications + rappels à respecter :

- Multi-tenant : toute entité métier est dans TENANT_SCOPES et accédée via TENANT_PRISMA. Les
  include imbriqués ne sont PAS scopés ; les FK n'imposent pas le tenant.
- `Reminder` est le SEUL modèle métier scopé à un seul rôle (`coachId`, sans `athleteId`).
  Conséquence apprise en le construisant : un modèle absent de TENANT_SCOPES **pour un rôle** est
  refusé par une ERREUR, pas par un 403 ni par une liste vide — lire les rappels depuis un chemin
  servi aux deux rôles renvoie un 500. Deux gardes obligatoires : `@Roles([Role.COACH])` sur le
  contrôleur, et un branchement par rôle partout où un chemin partagé y touche
  (`NotificationFeedService` en est l'exemple).
- « Dû » n'est PAS un statut stocké : c'est `isReminderDue` (@cmv/shared, borne INCLUSIVE), la même
  règle que l'API applique en SQL (`dueAt: { lte: now }`). Même dispositif que « facture en
  retard », dérivée par `resolveInvoiceState`. Ne pas réécrire ces dérivations dans le JSX.
- Un rappel dû remonte dans le centre de notifications comme entrée CALCULÉE, jamais persistée :
  `REMINDER_DUE` est le seul `NotificationType` absent de l'enum Prisma (le typecheck l'impose via
  `PersistedNotificationType`), et son id porte le préfixe `reminder:`.
- Le libellé n'est JAMAIS stocké — on persiste `type`, la cible et les paramètres (`actorName`,
  `subjectLabel`), et le rendu se fait côté client via `NOTIFICATION_LABEL_KEY` + i18next. Idem pour
  `Reminder.targetLabel`, servi BRUT (titre du cycle, période « YYYY-MM ») : c'est le client qui
  compose et traduit.
- Une notification n'est pas un lien : c'est le signal que l'état serveur a changé. L'ouvrir
  invalide tout le cache client avant de naviguer (web ET mobile, y compris à l'ouverture d'un
  push). Ne pas défaire ça.
- Couplage de caches assumé : toute mutation de rappel invalide AUSSI `notificationKeys.all` (un
  rappel dû compte dans le badge). Les deux racines de cache sont volontairement distinctes pour
  qu'on ait à l'écrire à la main. Si le dashboard introduit d'autres croisements, même règle.
- Plomberie partagée : `createNotificationApi(api)` puis `createReminderApi(api)` dans @cmv/shared
  sont les deux appels HTTP partagés web↔mobile — c'est désormais une règle documentée
  (architecture-choice §1), à appliquer à toute feature qui touchera les deux clients.
- Règle de promotion : 2+ apps → `@cmv/*`, 1 seule app → reste dans l'app. `REMINDER_BADGE` est
  resté côté web pour cette raison (il monte avec #46) ; `isReminderDue` est partagé.
- Nullable, pas de fallback silencieux : un compteur rend `null` → l'UI affiche « — », JAMAIS `0`.
  Les 4 tuiles actuelles le font déjà avec un commentaire explicite — c'est l'invariant central de
  cet écran.
- i18n : aucune string en dur, tout passe par i18next. Formats localisés = fonctions PURES de
  @cmv/shared recevant la locale ; les apps n'ont qu'un adaptateur qui injecte `i18n.language`.
  Piège timeZone "UTC" pour les dates civiles vs heure locale pour les instants — `Invoice.dueDate`
  est une DATE CIVILE, `Reminder.dueAt` est un INSTANT.
- Argent : centimes entiers, jamais de float ; aucun calcul dans le JSX.
- Observabilité : Pino → Axiom + Sentry sur les 3 couches.
- Infra mail : le dernier `// MOCKED` (apps/api/src/auth/auth.config.ts) est tracé par l'épic #61 —
  hors périmètre, ne pas le traiter.

Trois points d'attention — à trancher dans le plan, pas à découvrir en cours de route :

1. **Où vivent les nouveaux compteurs.** Les deux existants (`unreadCount` dans
   `feature/feedback/hook/useFeedbacks.ts` et `pendingCount` dans
   `feature/invoice/hook/useInvoices.ts`) sont des fonctions pures… posées côté web. Or la
   couverture Sonar n'est mesurée QUE sur packages/shared. Dis-moi si tu les laisses côté app
   (cohérence avec l'existant, zéro couverture) ou si tu les promeus dans @cmv/shared (testables,
   mais tu déplaces du code existant). Les deux se défendent — je veux l'arbitrage explicite, pas
   un choix par défaut.
2. **La mise en page à 7 tuiles.** La grille est en `xl:grid-cols-4` : 4 + 3 tombe bancal. Et les
   trois nouvelles ne sont pas de même nature que les existantes (« à traiter maintenant » vs
   « volume »). Propose une organisation, ne te contente pas d'ajouter trois cartes à la suite.
3. **« Factures en retard » ≠ « factures en attente »**, et la tuile « en attente » existe déjà.
   L'état OVERDUE est déjà dérivé dans @cmv/shared. Dis comment tu évites que le coach lise deux
   fois la même information.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + les e2e (146 actuellement) doivent passer avant de conclure une
  étape. Les e2e exigent le MinIO du docker-compose
  (docker compose -f apps/api/docker-compose.yml up -d minio-setup).
- SonarCloud sur la PR : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %.
  La couverture n'est mesurée QUE sur packages/shared — tout code neuf qui y entre doit être testé.
  La duplication web↔mobile fait sauter le seuil : promouvoir la plomberie dans @cmv/shared plutôt
  que d'ajouter des exclusions Sonar.
- Les clés i18n construites dynamiquement (une clé assemblée à partir d'une variable) échappent au
  typecheck : vérifie-les par script contre fr.json avant de conclure.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- #53 `[qa_1]` semble DÉJÀ satisfaite : ses trois puces (isolation Reminder/Notification, refus
  d'annuler une facture PAID ou CANCELLED, compteurs non lus après marquage) sont couvertes par des
  e2e existants. Vérifie-le nommément dans apps/api/test/isolation.e2e-spec.ts et propose-moi de la
  fermer ou de la réduire à une relecture post-#52.
- #47 est encore `Status = En cours` sur le board alors qu'elle est hors périmètre et attend une
  décision d'hébergement : elle devrait passer à `Idée`, comme #46.

Convention d'issues GitHub :

- Pattern de nommage : [feature-name_numero] - titre. S'il faut plusieurs issues (découpage parent
  enfant) : une épic [feature-name] - titre et des enfants [feature-name_X].
- Vérifie la numérotation existante de la famille avant de créer (`[pagination_4]`, `[storage_6]`…
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
