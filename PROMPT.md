Tu vas développer **#130 « [qa_4] — Exécuter les e2e dans la CI »** (issue 130 sur gh).

La parité multi-plateforme (#20) vient d'être livrée, recettée et mergée sur main : coach sur
mobile, athlète sur web, 7 e2e de plus (**168 au total**), huit modules de plomberie HTTP promus
dans `@cmv/shared`. Elle a laissé cinq dettes tracées (M-1 à M-5 dans `docs/dette-technique.md`),
dont **M-1 est celle que tu traites ici — la seule 🔴 du journal**.

#130 est en `Idée`, milestone **v1.0 — Post-MVP**, Phase `v1.0`, `prio: high`. Elle n'a ni
sub-issues ni relations bloquantes.

⚠️ **Trois choses à vérifier AVANT de me proposer quoi que ce soit** — je ne veux pas les découvrir
en cours de route :

1. **`vitest.config.e2e.ts` appelle `process.loadEnvFile(".env.test")` en tête de fichier**, et
   `.env.test` est **gitignoré** (`.gitignore` ligne 18). `loadEnvFile` **lève** si le fichier
   n'existe pas. En l'état, la suite ne peut donc pas démarrer sur un runner. Dis-moi comment tu
   traites ça — écrire le fichier dans le job, rendre le chargement tolérant, ou passer l'env
   autrement — et pourquoi ton choix ne casse pas l'exécution locale, qui elle dépend du fichier.
2. **Le bucket MinIO n'existe pas tout seul.** En local, c'est le service `minio-setup` de
   `apps/api/docker-compose.yml` qui crée `cimavia-media-e2e` en privé (image `minio/mc`, entrypoint
   idempotent). Un conteneur de service GitHub Actions n'exécute pas cet entrypoint. Dis-moi
   comment le bucket est créé dans le job, et vérifie que le flux médias de P4 (URL signée, upload
   direct, rattachement, purge) est bien couvert — c'est la moitié de ce que ces e2e protègent.
3. **Vérifie que les e2e passent aujourd'hui, avant de toucher au workflow.** Deux d'entre eux
   étaient cassés depuis des jours sans que personne le sache — c'est précisément ce qui a créé
   cette issue. Si tu en trouves d'autres, c'est un RÉSULTAT à me signaler, pas quelque chose à
   corriger en douce dans la même PR.

Avant de coder, lis :

- `docs/dette-technique.md` — **M-1** (le constat et ses conséquences), **Q-1/#56** (couverture non
  mesurée hors `@cmv/shared` — distinct mais adjacent), **Q-3/#126** (les e2e ne sont pas
  typecheckés, 16 erreurs y dorment), et l'encadré « Appris en #20 » sur les portes qui n'existent
  pas.
- `docs/architecture-choice.md` — **§2 `app.setup.ts`** (pourquoi `configureApp` est appelé par
  `main.ts` ET par les e2e : deux bugs réels de P2 viennent de là), **§6 multi-tenant** (ce que ces
  e2e protègent), **§11 qualité & CI**.
- `.github/workflows/ci.yml` — le job `quality` actuel, son `DATABASE_URL` factice **volontairement
  sans identifiants**, et le `--ignore-scripts` de l'installation, dont le commentaire explique
  pourquoi.
- `.github/workflows/sonar.yml` — il lance `pnpm turbo test` puis scanne. Dis-moi si les e2e y ont
  leur place ou non.
- `apps/api/vitest.config.e2e.ts`, `apps/api/test/global-setup.e2e.ts`,
  `apps/api/docker-compose.test.yml`, `apps/api/docker-compose.yml`, `turbo.json`.
- `packages/shared/src/env.schema.ts` — l'API **refuse de démarrer** si une variable manque ou est
  mal typée. Les e2e bootent le vrai `AppModule` : l'env du job doit satisfaire ce schéma, pas
  l'approximer.
- `README.md` (setup, commandes) et `CONTRIBUTING.md` (git flow, commits signés, secrets CI).
- Lis le corps de #130 par `gh api repos/Cimavia/cimavia/issues/130`.

Rappels — l'existant à respecter :

- **Les e2e sont le SEUL filet de la couche API.** Les tests unitaires y sont à 2,6 % de couverture.
  168 cas dans un seul fichier (`apps/api/test/isolation.e2e-spec.ts`), ~13 s en local.
- **Ils TRUNCATE la base au démarrage.** `DATABASE_URL` doit pointer sur une base jetable, jamais
  sur celle de dev ni sur Neon. Si ton workflow rend cette confusion possible, c'est un défaut de
  conception, pas un risque à documenter.
- **Un seul worker, séquentiel** (`fileParallelism: false`, `maxWorkers: 1`) : la base est un état
  partagé. Ne « parallélise » pas pour gagner du temps.
- `global-setup.e2e.ts` joue `prisma migrate deploy` avant la suite — les migrations sont donc déjà
  gérées, ne les rejoue pas ailleurs.
- La suite écoute sur `PORT ?? 3001` et fait de vraies requêtes HTTP sur `localhost` : ce n'est pas
  du supertest en mémoire.
- `turbo.json` ne déclare **aucune tâche `test:e2e`**. Si tu en ajoutes une, dis ce que tu mets dans
  `dependsOn` et `outputs`, et pourquoi le cache Turbo ne rendra pas la porte inopérante.
- Actions GitHub épinglées par SHA (voir l'existant) — ne pas introduire de tag flottant.
- Observabilité : `SENTRY_DSN` et `AXIOM_*` sont optionnels au schéma ; ne les renseigne pas en CI.

Quatre points d'attention — à trancher dans le plan, pas à découvrir en cours de route. Ne me les
renvoie pas en question ouverte :

1. **Où tourne la porte.** Nouveau job dans `ci.yml`, étape du job `quality` existant, ou workflow
   séparé ? Et sur quels déclencheurs — chaque PR, ou seulement `main` ? La suite prend 13 s ; le
   coût est le démarrage de Postgres et MinIO. Dis ce que tu choisis et ce que ça change au temps
   de retour d'une PR.
2. **Comment les services arrivent.** `services:` GitHub Actions (Postgres et MinIO en conteneurs du
   job) ou `docker compose up` dans une étape ? Les deux marchent ; ils ne se débuguent pas pareil et
   ne partagent pas le même réseau. Tranche, et dis comment le bucket est créé dans ta variante.
3. **Le typecheck des e2e (#126).** `apps/api/test/` est hors de l'`include` du tsconfig, et 16
   erreurs de types y dorment. Faire de ces tests une porte bloquante sans les typechecker, c'est
   accepter qu'ils cassent au runtime pour une raison que `tsc` aurait vue. Tu traites #126 dans
   cette livraison, tu l'assumes explicitement, ou tu refuses de brancher la porte tant qu'il n'a
   pas atterri ? Pas de quatrième option silencieuse.
4. **Le lien avec #57 (`coverage_1`).** Instrumenter les e2e pour couvrir `apps/api` (donc lever
   Q-1) n'a de sens qu'une fois qu'ils tournent en CI. Dis si ta livraison rend #57 faisable,
   difficile, ou indifférente — et **ne le fais pas ici** : je veux savoir, pas que tu élargisses.

Portes de qualité — la PR échoue si l'une saute :

- `pnpm turbo lint typecheck test` + les e2e (**168 actuellement**) doivent passer avant de conclure
  une étape. En local, les e2e exigent LES DEUX composes :
  `docker compose -f apps/api/docker-compose.test.yml up -d` (base e2e sur 5434) et
  `docker compose -f apps/api/docker-compose.yml up -d minio-setup`.
- `pnpm check:i18n` doit sortir en 0. Lance-le aussi en `--strict`.
- Le build de production des deux apps doit passer (`pnpm --filter @cmv/web exec vite build` et
  `npx expo export --platform android` côté mobile).
- **La porte que tu ajoutes doit être vérifiée en échec, pas seulement en succès.** Casse
  volontairement une assertion en local, montre-moi que le job rougit, puis remets-la. Une porte
  qu'on n'a vue que verte n'est pas une porte.
- SonarCloud sur la PR : `new_coverage` ≥ 80 % et `new_duplicated_lines_density` ≤ 3 %.

Ménage de board à faire au passage (je valide avant que tu touches à quoi que ce soit) :

- Vérifie si #130 doit devenir **sub-issue** de #56 (`[couverture]`) ou rester autonome — elle est
  en amont de #57, pas dedans. Dis-moi ce que tu en penses.
- Dis-moi si #126 (`[qa_3]`) doit devenir **bloquante** de #130, selon ton arbitrage du point 3.
- #126 n'a **aucune milestone** ni Phase sur le board : dis-moi s'il faut les poser.
- Vérifie qu'aucune autre issue n'est débloquée par cette livraison, et signale-le-moi.

Convention d'issues GitHub :

- Pattern de nommage : `[feature-name_numero] - titre`. S'il faut plusieurs issues (découpage parent
  enfant) : une épic `[feature-name] - titre` et des enfants `[feature-name_X]`.
- Vérifie la numérotation existante de la famille avant de créer (`[qa_5]`… se déduit des issues
  déjà là, pas d'un compteur mental).
- Les issues doivent être reliées par des relations directement dans GitHub (sub-issues) et être
  bloquantes les unes par rapport aux autres si l'ordre d'implémentation compte.
- `gh issue view` est cassé sur ce dépôt (dépréciation Projects classic) : passer par
  `gh api repos/Cimavia/cimavia/issues/<n>`.
- Les issues créées sont aussi à ajouter au board « Cimavia — Roadmap » (Status = Idée, Phase = v1.0).

Façon de travailler (inchangée) :

- D'abord un plan → j'attends ta validation avant que tu codes.
- Puis tu me donnes des commits atomiques que je valide 1 par 1 et je fais les commandes moi-même
  (git add, git commit, git push).
- Les actions sur interfaces web (Scaleway, Neon, Cloudflare, EAS, SonarCloud, **secrets GitHub**,
  branch protection, DNS) c'est MOI qui les fais : liste-les explicitement, ne tente pas de les
  exécuter. En particulier : si ta solution demande un secret de dépôt, ou si la porte doit devenir
  **requise** pour merger (branch protection), dis-le-moi noir sur blanc — sans ça, le job tournera
  sans jamais bloquer quoi que ce soit, et la dette M-1 restera ouverte en croyant être fermée.
- Je teste moi-même (migrations, e2e, app sur téléphone physique) : prépare-moi de quoi tester,
  je lance et je rapporte.
- Pour la dette : tu me proposeras les issues GitHub, je valide, tu les crées.

Commence par me proposer le plan. Ne code pas avant que je valide.
