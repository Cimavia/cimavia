Tu vas terminer l'épic **#38 « [rappels] — Système de rappels génériques »**, c'est-à-dire ses
trois enfants encore ouverts : **#46 (mobile)**, **#47 (scheduler)** et **#105 (report
d'échéance)**. Lis-les par `gh api repos/Cimavia/cimavia/issues/<n>`.

**Ce que ça représente** : `gh api "repos/Cimavia/cimavia/issues?state=open&milestone=1"` ne renvoie
que quatre issues — #38, #46, #47, #105. Autrement dit, **ces trois enfants sont tout ce qui reste
du jalon `v0.9 — MVP`**. Ne l'oublie pas au moment d'arbitrer le périmètre : ce qu'on repousse ici
ne repousse pas une feature, ça repousse la clôture du MVP.

Contexte récent : #130 (les e2e tournent en CI, requis dans les rulesets) et #57 (les e2e sont
instrumentés, `apps/api` mesurée à ~86 %) viennent d'être livrées. **Toute régression d'API est
désormais bloquante en PR** — c'est nouveau, et ça change ce que tu peux te permettre de casser.

⚠️ **Quatre choses à vérifier AVANT de me proposer quoi que ce soit** — je ne veux pas les
découvrir en cours de route :

1. **Le blocage de #46 n'existe plus, et son issue ne le sait pas.** Son corps dit « Reportée —
   l'écran n'a aucun endroit où se poser », bloquée par **#35**. #35 et #20 sont **fermées** : la
   nav mobile est désormais pilotée par capacité (`apps/mobile/shared/lib/tabs.ts`, champ
   `capability: "coach" | "athlete" | null`) et un onglet coach existe déjà (`dashboard`). Vérifie
   l'état réel de cette surface avant de planifier, et dis-moi si l'écran « Mes rappels » devient un
   onglet, un sous-écran du dashboard coach, ou autre chose — **avec** la raison. Les deux
   alternatives écartées en 2026-08-07 le sont pour des motifs qui ne tiennent peut-être plus.
2. **Un écran mobile qui arrive doit brancher sa destination de notification dans la MÊME PR.**
   C'est le corollaire écrit noir sur blanc dans l'encadré « Appris en #20 » de
   `docs/dette-technique.md`, après trois pannes révélées par un simple clic. Regarde
   `apps/mobile/feature/notification/util/route.util.ts` : il route par `entityType`, et `PLAN` rend
   `null` **définitivement** côté coach. Un rappel dû sur un cycle mène donc aujourd'hui nulle part
   sur mobile. Dis-moi si l'écran « Mes rappels » devient la bonne destination pour un
   `REMINDER_DUE`, et ce que ça implique pour le web (`apps/web/src/feature/notification/util/`),
   qui n'a pas non plus d'entrée `REMINDER_DUE`.
3. **#47 n'est pas d'abord un problème de code, c'est une décision d'hébergement — et elle est à
   moi.** Un cron in-process (`@nestjs/schedule`) tournerait très bien sur le NAS de dev
   (`deploy/dev/docker-compose.yml`, conteneur long-lived) et serait **silencieusement mort** sur la
   cible MVP Scaleway Serverless Containers, en scale-to-zero : aucun process ne tire le tick. Le
   pire des deux mondes, puisque tout test manuel passerait. Présente-moi les options (déclencheur
   externe appelant une route protégée, versus conteneur always-on) avec leurs conséquences —
   secret de dépôt, authentification de la route, coût — et **attends mon arbitrage**. Ne code pas
   le socle avant.
4. **Vérifie que les 168 e2e passent, avant de toucher à quoi que ce soit.** Deux composes requis :
   `docker compose -f apps/api/docker-compose.test.yml up -d` et
   `docker compose -f apps/api/docker-compose.yml run --rm minio-setup`. Si tu trouves un test
   cassé, c'est un RÉSULTAT à me signaler, pas quelque chose à corriger en douce dans la même PR.

Avant de coder, lis :

- Les corps de **#38** (le découpage et l'ordre revu le 2026-08-07), **#46**, **#47** et **#105**.
  Chacun porte le raisonnement que le code ne justifie pas seul — notamment les **deux contraintes
  relevées en construisant #44** dans #47, qui sont la moitié du travail de cette issue.
- `docs/dette-technique.md` — les dettes **R-1 à R-5** (R-1 = pas de push à l'échéance → #47 ;
  R-3 = pas de report ni d'édition → #105), l'encadré **« Appris en #20 »** (les portes qui
  n'existent pas), et les encadrés **« Tranché en #130 »** et **« Tranché en #57 »** si tu touches
  aux configs de test ou de couverture.
- `docs/architecture-choice.md` — **§6 multi-tenant** et ses quatre pièges du scope automatique
  (un rappel généré par un scheduler n'a **pas** d'acteur courant : demande-toi ce que devient le
  scope Prisma dans un contexte hors requête), **§2** (`app.setup.ts`, validation Zod),
  **§10 i18n**, **§11 qualité & CI**.
- `docs/CONTEXT.cimavia.md` — les termes canoniques. Un `Reminder` est un outil **privé du coach**,
  jamais partagé avec l'athlète.
- Le code existant des rappels, qui est le patron à suivre :
  `apps/api/src/reminder/` (module, controller, service, mapper, dto),
  `packages/shared/src/api/reminder.api.ts` (+ son `.test.ts`),
  `packages/shared/src/util/reminder.util.ts`,
  `apps/web/src/feature/reminder/` et `apps/web/src/routes/reminders.tsx`.
- `packages/shared/src/dto/notification.schema.ts` — en particulier `NOTIFICATION_LABEL_KEY` et le
  commentaire qui explique pourquoi `REMINDER_DUE` **n'existe pas** dans l'enum Prisma (il est
  calculé à la lecture, pas écrit). C'est exactement le modèle que #47 doit suivre pour son champ
  `reason`.
- `apps/api/test/isolation.e2e-spec.ts`, blocs `describe("Rappels du coach (#44)")` et
  `describe("Rappels dus dans le centre de notifications (#51)")`.
- `apps/mobile/shared/lib/tabs.ts`, `apps/mobile/app/(app)/_layout.tsx`, et une feature mobile coach
  déjà livrée (`apps/mobile/feature/dashboard/`) comme gabarit.
- `README.md`, `CONTRIBUTING.md` (git flow, `main` est protégé : PR obligatoire, trois checks
  requis, commits signés).

Rappels — l'existant à respecter :

- **L'API des rappels n'expose aujourd'hui que quatre routes** : `GET /reminders`,
  `GET /reminders/summary`, `POST /reminders`, `PATCH /reminders/:id/status`. Le contrôleur porte
  `@Roles([Role.COACH])` **au niveau classe**, et ce n'est pas décoratif : sans lui, la requête d'un
  athlète atteindrait l'extension Prisma, qui refuse par une **erreur** — l'athlète recevrait un 500
  au lieu d'un 403. Toute route ajoutée hérite de cette garde ; un e2e doit le figer.
- **L'ordre de déclaration des routes compte** : `@Get("summary")` est placé avant tout paramétré,
  et un futur `@Get(":id")` l'avalerait. Le commentaire est dans le contrôleur, respecte-le.
- **`Reminder.note` est du texte du coach**, saisi à la main, obligatoire aujourd'hui. Un rappel
  **auto-généré ne doit pas fabriquer sa note** : ce serait un libellé rendu puis persisté, ce que
  le modèle de notification interdit explicitement (#48 : on persiste le type et les paramètres, le
  rendu se fait côté client). D'où le champ `reason` (enum) + `note` nullable prévus par #47 — donc
  **une migration Prisma** et un DTO `@cmv/shared` qui change de forme.
- **La plomberie HTTP est déjà promue dans `@cmv/shared`** (`createReminderApi`, `reminderKeys`).
  Ne la redéfinis pas côté app : mobile et web consomment le même module, avec leur propre client.
- **Zéro string en dur** : tout passe par i18next, `check:i18n` doit sortir en 0 (lance-le aussi en
  `--strict`).
- **Pure shells sur mobile** : les fichiers sous `app/` sont du routing ou un shell d'une ligne
  `export { Screen as default } from "@/feature/<x>"`.
- **Une ressource = un écran** (tranché en #20) : si le web et le mobile affichent la même liste de
  rappels, ce n'est pas une raison pour dupliquer la lecture — regarde ce qui est déjà partagé avant
  d'écrire un second composant.
- Les e2e **TRUNCATE la base** au démarrage et `global-setup.e2e.ts` refuse toute base dont le nom
  ne finit pas par `_e2e`. Un seul worker, séquentiel : ne parallélise pas.

Quatre points à trancher **dans le plan**, pas à découvrir en cours de route :

1. **L'ordre et le découpage en PR.** Trois issues de natures très différentes : #105 est petite
   (API + web), #46 est un écran mobile, #47 est de l'infrastructure et attend une décision
   d'hébergement. Une PR par issue, ou un regroupement ? Dis ce que tu choisis et pourquoi — en
   sachant que #47 peut rester bloquée sur mon arbitrage pendant que le reste avance.
2. **#105 : ce que devient `readAt` au report.** L'issue pose la question sans la trancher. Attention
   au couplage avec #51 : le centre de notifications **synthétise** une entrée `reminder:<id>` dont
   le `createdAt` **est** l'échéance du rappel (un e2e le fige : « l'entrée est datée de l'échéance
   du rappel, pas de sa création »). Reporter un rappel déplace donc son entrée dans le tri du
   centre. Dis ce que tu fais de `readAt` **et** ce que ça produit sur cet e2e.
3. **#47 : le scope tenant hors requête.** L'isolation est garantie par un tenancy guard qui résout
   l'acteur courant depuis la session Better Auth, et par une extension Prisma qui **refuse**
   (fail-closed) tout modèle sans scope. Un scheduler n'a ni session ni acteur. Dis comment tu
   génères des rappels pour N coachs sans contourner l'extension — et si ta réponse est « on la
   contourne », dis-le explicitement et propose comment on le teste.
4. **#47 : le push à l'échéance.** C'est la dette R-1, et c'est la moitié de la valeur de l'issue :
   sans scheduler, un rappel qui devient dû n'émet **aucun push**, il n'apparaît qu'au prochain
   chargement du centre. Dis si tu le livres ici ou si tu le sors du périmètre — et dans ce cas,
   R-1 reste ouverte et il faut le dire.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + **les e2e** (168 aujourd'hui) doivent passer. Les e2e sont
  maintenant un check **requis** sur `main` : une régression bloque le merge, elle ne se découvre
  plus trois jours après.
- `pnpm check:i18n` **et** `pnpm check:i18n --strict` doivent sortir en 0.
- Le build de production des deux apps : `pnpm --filter @cmv/web exec vite build` et
  `npx expo export --platform android`.
- SonarCloud : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %. **Nouveau depuis
  #57** : `apps/api` est désormais **mesurée** (~86 %). Du code d'API non couvert par un e2e fera
  donc échouer la Quality Gate — écris les e2e en même temps que le code, pas après.
- Toute nouvelle route d'API se couvre par un e2e d'isolation : un coach ne doit jamais atteindre le
  rappel d'un autre (404, pas 403 — le scope ne le voit pas), un athlète jamais la ressource (403).
- Si tu ajoutes une porte ou une garde, **montre-la en échec**, pas seulement en succès.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- Le corps de **#46** décrit un blocage levé et une issue « reportée » qui ne l'est plus. Propose-moi
  le texte corrigé — je ne veux pas d'une issue qui ment sur son propre état.
- Le corps de **#38** porte une section « Ordre (revu le 2026-08-07) » devenue fausse sur #46, et sa
  liste de découpage ne mentionne pas #105. À reprendre.
- **#46** est déclarée bloquée par #35 dans GitHub : si la relation existe encore, retire-la.
- Vérifie les milestones : #38, #46, #47 et #105 sont sur `v0.9 — MVP`, Phase `v1.0`, Status `Prêt`
  (#38 est `En cours`). Dis-moi si quelque chose détonne.
- **#106, #107, #108** touchent aux rappels mais appartiennent à d'autres épics (#68 pagination,
  #67 storage, #100 notifications-suite) : elles ne bloquent **pas** la clôture de #38. Confirme-le
  plutôt que de le supposer.
- Vérifie qu'aucune autre issue n'est débloquée par cette livraison, et signale-le-moi.

Convention d'issues GitHub :

- Pattern de nommage : `[feature-name_numero] - titre`. S'il faut plusieurs issues (découpage parent
  enfant) : une épic `[feature-name] - titre` et des enfants `[feature-name_X]`.
- Vérifie la numérotation existante de la famille avant de créer — la famille `[rappels]` va
  aujourd'hui de `_1` (#44) à `_5` (#105), donc le prochain libre est `_6`. Ça se déduit des issues
  déjà là, pas d'un compteur mental.
- Les issues doivent être reliées par des relations directement dans GitHub (sub-issues) et être
  bloquantes les unes par rapport aux autres si l'ordre d'implémentation compte.
- `gh issue view` est cassé sur ce dépôt (dépréciation Projects classic) : passer par
  `gh api repos/Cimavia/cimavia/issues/<n>`.
- Les issues créées sont aussi à ajouter au board « Cimavia — Roadmap » (Status = Idée, Phase à
  choisir selon le jalon).

Façon de travailler (inchangée) :

- D'abord un plan → j'attends ta validation avant que tu codes.
- Puis tu me donnes des commits atomiques que je valide 1 par 1 et je fais les commandes moi-même
  (git add, git commit, git push). **Mets les `Closes #<n>` / `Refs #<n>` dans le corps du commit**
  et rappelle-le-moi : sur la livraison précédente les corps sont partis vides, et aucune issue ne
  s'est fermée toute seule.
- Les actions sur interfaces web (Scaleway, Neon, Cloudflare, EAS, SonarCloud, **secrets GitHub**,
  branch protection, DNS) c'est MOI qui les fais : liste-les explicitement, ne tente pas de les
  exécuter. #47 en demandera très probablement une — dis-le noir sur blanc, et dis ce qui ne marche
  pas tant qu'elle n'est pas faite.
- Je teste moi-même (migrations, e2e, app sur téléphone physique) : prépare-moi de quoi tester,
  je lance et je rapporte. Pour #46, prévois un scénario de test **sur téléphone**, pas seulement
  en émulateur.
- Pour la dette : tu me proposeras les issues GitHub, je valide, tu les crées.

Commence par me proposer le plan. Ne code pas avant que je valide.
