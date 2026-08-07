Tu vas développer la feature rappels (issues 38, 44, 45, 46, 47 sur gh — et 51, qui devient
débloquée par 44).

Le centre de notifications (#39 : #48, #49, #50) vient d'être livré et recetté. #51 « rappels dus
intégrés au centre de notifications » était le seul enfant de #39 laissé de côté, faute de modèle
`Reminder` — c'est cette feature qui le débloque. À intégrer au plan.

Avant de coder, lis :

- docs/cahier-des-charges-mvp.md — §6 exigences non fonctionnelles, §7 architecture technique,
  §11 internationalisation, §14 risques.
- docs/architecture-choice.md — conventions (§2 app.setup.ts, §5 design system, §6 pièges du scope
  automatique, §7 types dans @cmv/shared + logique pure partagée).
- docs/CONTEXT.cimavia.md — glossaire métier (termes canoniques), dont l'entrée `Notification`.
- docs/dette-technique.md — dettes ouvertes, en particulier N-1→N-7 (centre de notifications).
- README.md (setup, commandes, WSL2/téléphone) et CONTRIBUTING.md (git flow, commits signés,
  secrets CI, observabilité).
- Analyse le projet github Cimavia - Roadmap.

Rappels — acquis P0→P7 + notifications à respecter :

- Multi-tenant : toute entité métier est dans TENANT_SCOPES et accédée via TENANT_PRISMA. Les
  include imbriqués ne sont PAS scopés ; les FK n'imposent pas le tenant. `Reminder` est scopé
  `coachId`.
- Référence polymorphe : `Reminder.entityType`/`entityId` reprend exactement le motif de
  `Notification` — pas de FK possible, donc risque de cible disparue. Voir dette N-4 et issue #102,
  et raisonner pareil plutôt que d'inventer une seconde convention.
- Notifications : `NotificationService` est le point d'émission unique (persistance + push, mêmes
  déclencheurs, dégradation séparée). Le libellé n'est JAMAIS stocké — on persiste `type`, la cible
  et les paramètres (`actorName`, `subjectLabel`), et le rendu se fait côté client via
  `NOTIFICATION_LABEL_KEY` + i18next. Un rappel dû qui remonte dans le centre (#51) doit suivre la
  même règle.
- Une notification n'est pas un lien : c'est le signal que l'état serveur a changé. L'ouvrir
  invalide tout le cache client avant de naviguer (web ET mobile, y compris à l'ouverture d'un
  push). Ne pas défaire ça.
- Plomberie partagée : `createNotificationApi(api)` dans @cmv/shared est le PREMIER appel HTTP
  partagé web↔mobile (routes + clés de cache injectées du client de chaque app). C'est le précédent
  à suivre pour toute feature qui touche les deux clients — sinon Sonar bloque la PR (voir plus
  bas).
- i18n : aucune string en dur, tout passe par i18next. Les deux apps forcent `lng: "fr"` (en.json
  reste à faire, hors périmètre). Formats localisés = fonctions PURES de @cmv/shared recevant la
  locale (`formatIsoDate`, `formatIsoDateTime`, `formatRelativeOrDateTime`, `formatMoney`…) ; les
  apps n'ont qu'un adaptateur qui injecte `i18n.language`. Piège timeZone "UTC" pour les dates
  civiles vs heure locale pour les instants — `dueAt` d'un rappel est un INSTANT.
- Argent : centimes entiers, jamais de float ; aucun calcul dans le JSX.
- Médias : buckets privés, URLs signées, le binaire ne transite jamais par l'API.
- Observabilité : Pino → Axiom + Sentry sur les 3 couches.
- Infra mail : le dernier `// MOCKED` (apps/api/src/auth/auth.config.ts) est désormais tracé par
  l'épic #61 (#62→#66) — hors périmètre de cette feature, ne pas le traiter.

Point d'attention sur #46 (mobile) — à trancher dans le plan : l'app mobile n'a AUCUN mode coach
aujourd'hui. Les onglets de `apps/mobile/app/(app)/_layout.tsx` sont ceux de l'athlète (planning,
séances, messages, factures, notifs, profil), et la nav par rôle est l'objet de #35, non fait.
Un écran « mes rappels » côté coach n'a donc pas d'endroit où se poser. Dis-moi comment tu comptes
gérer ça plutôt que de le découvrir en cours de route.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + les e2e (124 actuellement) doivent passer avant de conclure une
  étape. Les e2e exigent le MinIO du docker-compose
  (docker compose -f apps/api/docker-compose.yml up -d minio-setup).
- SonarCloud sur la PR : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %.
  La couverture n'est mesurée QUE sur packages/shared — tout code neuf qui y entre doit être testé.
  La duplication web↔mobile fait sauter le seuil : promouvoir la plomberie dans @cmv/shared plutôt
  que d'ajouter des exclusions Sonar.

Convention d'issues GitHub :

- Pattern de nommage : [feature-name_numero] - titre. S'il faut plusieurs issues (découpage parent
  enfant) : une épic [feature-name] - titre et des enfants [feature-name_X].
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