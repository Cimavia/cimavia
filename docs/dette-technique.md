# Dette technique — cimavia

**Journal de décisions et index de dette.** Deux choses vivent ici : les **raccourcis assumés** (le
*quoi* et le *statut* — le *pourquoi* et le *quand* vivent dans l'issue liée) et les **décisions
tranchées en cours de route**, que le code ne justifie pas tout seul.

Ce n'est ni un backlog de bugs (→ issues), ni une liste de features (→ `cahier-des-charges-mvp.md` §4).

**Règle de capture** : tout raccourci pris pendant une phase s'ajoute ici **au moment où on le
prend** — une ligne suffit. L'issue peut attendre ; une dette non écrite est une dette oubliée.

**Où lire quoi** : ce fichier dit *ce qui a été court-circuité* et *où en est le suivi*. L'issue
liée porte le raisonnement complet — pourquoi c'était acceptable, et ce qui doit se produire pour
qu'on le traite.

Statuts : 🟢 acceptable durablement · 🟡 à traiter avant v1.0 · 🔴 à traiter avant la mise en prod

**Épics de suivi** :
[#67](https://github.com/Cimavia/cimavia/issues/67) cohérence base ↔ storage ·
[#68](https://github.com/Cimavia/cimavia/issues/68) pagination ·
[#69](https://github.com/Cimavia/cimavia/issues/69) transcodage des médias ·
[#70](https://github.com/Cimavia/cimavia/issues/70) durcissement avant prod — plus dix issues
autonomes. Quatre dettes n'ont **volontairement pas** d'issue : **P2-4** et **N-3** (déclencheur
explicitement « aucun »), **D-2** et **M-5** (déclencheur nommé, mais rien à préparer avant qu'il
survienne).

---

## P2 — Exercices & Séances

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P2-1 | **Objets orphelins en object storage** : upload réussi mais `POST /documents` échoué → fichier dans le bucket sans ligne en base. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |
| P2-2 | **Pas de pagination** sur `GET /exercises` et `GET /sessions` : tout est renvoyé. | 🟢 | [#79](https://github.com/Cimavia/cimavia/issues/79) |
| P2-3 | **Pas de drag & drop** dans le SessionBuilder : réordonnancement par boutons ↑/↓. | 🟢 | [#93](https://github.com/Cimavia/cimavia/issues/93) |
| P2-4 | **`crypto.randomUUID()` pour la clé objet**, alors que les `id` de tables sont des `cuid`. | 🟢 | — *(incohérence assumée, déclencheur : aucun)* |
| P2-5 | **Suppression d'un document : pas de rollback**. L'objet S3 part **avant** la ligne — ordre choisi volontairement. | 🟢 | [#75](https://github.com/Cimavia/cimavia/issues/75) |

---

## P3 — Planifications

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P3-1~~ | ~~**Push non envoyé à la diffusion**~~ : `notifyPlanPublished` journalisait au lieu d'émettre. | ✅ | résolu en **p4-4** — `expo-server-sdk` branché dans `NotificationService`, table `PushToken` |
| P3-2 | **Objets S3 orphelins après suppression d'une planif** : une copie de document partage la clé objet de la bibliothèque. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |
| P3-3 | **Documents non lisibles hors-ligne** : servis par des URLs signées à TTL court (5 min). | 🟢 | [#95](https://github.com/Cimavia/cimavia/issues/95) |
| ~~P3-4~~ | ~~**Écrans coach de P1 jamais construits**~~ (nav, liste d'athlètes, invitation, fiche). | ✅ | résolu en **p3-8** — `CmvAppShell`, `/athletes`, invitation, fiche athlète |
| P3-5 | **Écarts aux maquettes assumés** : pas de durée de séance (« 75 min » en pd-7/pd-9), pas de drag & drop. | 🟢 | [#94](https://github.com/Cimavia/cimavia/issues/94) · [#93](https://github.com/Cimavia/cimavia/issues/93) |
| ~~P3-6~~ | ~~**Tuile « Factures en attente » non branchée**~~ : affichait `—`, marquée `// MOCKED`. | ✅ | résolue en **P6** — branchée sur `pendingCount(invoices)` |

---

> **Tranché en P3** (la question ouverte du modèle) : `ScheduledSessionExercise` est une **copie autonome** — snapshot `title`/`description`/`category`/`prescription` + `sourceExerciseId` **nullable en `SetNull`** (traçabilité seule), et les documents sont **copiés en lignes** partageant la clé objet. Conséquence : le coach peut supprimer un exercice de sa bibliothèque **sans jamais casser ni bloquer** une planification diffusée (pas de `Restrict`, pas de 409 à vie). La bibliothèque (`SessionExercise`) garde, elle, son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## P4 — Débrief & Médias

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P4-1 | **Vidéo non transcodée** : le plafond 720p n'est ni appliqué ni vérifié — une vidéo hors plafonds est **refusée**, pas réencodée. | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) |
| P4-2 | **Durée vidéo déclarative** : `durationSeconds` vient du client, le serveur ne décode pas le fichier. | 🟢 | [#81](https://github.com/Cimavia/cimavia/issues/81) |
| P4-3 | **Vol de token push possible** : `POST /me/push-tokens` réaffecte au compte courant un token déjà enregistré. | 🟡 | [#90](https://github.com/Cimavia/cimavia/issues/90) |
| P4-4 | **Pas de miniature vidéo** dans la galerie mobile : une pastille « Vidéo · 42 s » tient lieu d'aperçu. | 🟢 | [#92](https://github.com/Cimavia/cimavia/issues/92) |
| P4-5 | **Un seul push par débrief** : seule la CRÉATION notifie le coach, pas les compléments. | 🟢 | [#91](https://github.com/Cimavia/cimavia/issues/91) |
| ~~P2-1~~ / ~~P3-2~~ | *(inchangées)* P4 n'ajoute **aucun** nouveau cas : un média de débrief n'est jamais copié ni partagé, sa suppression purge l'objet directement. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |

> **Résolu en P4** : ~~P3-1~~ (push non envoyé) — `expo-server-sdk` est branché dans
> `NotificationService`, sans que les appelants aient bougé. ~~P3-6~~ côté débriefs — la tuile
> « Débriefs à relire » est connectée (la tuile factures a suivi en P6).

> **Rattrapages faits en P4** (hors périmètre annoncé, révélés par le test de bout en bout) :
> **p4-5** l'écran mobile « rejoindre un coach » — `POST /invitations/accept` existait et était
> testé, mais aucun client ne l'appelait : la relation ne pouvait s'établir qu'à la main, donc
> l'athlète n'avait ni planif ni séance à débriefer. **p4-6** le rafraîchissement mobile —
> **rien** ne déclenchait de refetch (`refetchOnWindowFocus` s'appuie sur des événements de
> navigateur, absents en React Native) : avec le cache persisté et `staleTime` à 5 min, l'athlète
> pouvait relire un cycle supprimé sans le moindre signe. Manque hérité de P3, invisible en dev
> (on recharge sans cesse), qui aurait mordu en production.

---

## P5 — Messagerie & débrief vocal

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P5-1 | **Pas de pagination sur les messages** : `GET /conversations/:id/messages` renvoie tout le fil. | 🟢 | [#77](https://github.com/Cimavia/cimavia/issues/77) |
| P5-2 | **Audio non transcodé, durée déclarative** (comme la vidéo, P4-1/P4-2). | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) · [#81](https://github.com/Cimavia/cimavia/issues/81) |
| P5-3 | **Interop note vocale web → iOS** : sur Chrome/Firefox, `MediaRecorder` produit du webm/opus, qu'iOS peut ne pas lire. | 🟡 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| P5-4 | **Throttle push « first-unread » sans reprise temporelle** : une rafale de messages = 1 push, sans rappel. | 🟢 | [#91](https://github.com/Cimavia/cimavia/issues/91) |
| P5-5 | **Préparation média dupliquée** entre `feature/feedback` et `feature/message` (mobile), et entre mobile et web. | 🟢 | [#96](https://github.com/Cimavia/cimavia/issues/96) |
| ~~P2-1~~ / ~~P3-2~~ | **Nouveau cas** : supprimer une relation `CoachAthlete` cascade `Conversation`/`Message` en base mais **laisse les objets S3 orphelins en masse**. | 🟡 | [#74](https://github.com/Cimavia/cimavia/issues/74) · [#72](https://github.com/Cimavia/cimavia/issues/72) |

> **Promu en P5** : l'enregistreur et le lecteur audio (`CmvAudioRecorder`/`CmvAudioPlayer`) sont
> dans `shared/component/` côté mobile, construits pour la messagerie **et** réutilisés tels quels
> par le débrief vocal — l'ajout au débrief a coûté quelques heures, comme anticipé (CDC §4).

> **Correctif réseau (dev) consigné en P5** : sous WSL2 (mode NAT), Metro annonce son IP interne
> `172.x`, injoignable du téléphone. `REACT_NATIVE_PACKAGER_HOSTNAME` = IP LAN Windows, dans
> `apps/mobile/.env.local` (SDK 56 refuse les variables non-`EXPO_PUBLIC_` hors `.env.local`).
> Voir README §WSL2.

---

## P6 — Facturation

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P6-1 | **Astérisques d'obligation partiels** : seul le formulaire de facturation marque ses champs requis (`CmvTextField requiredMark`). | 🟢 | [#97](https://github.com/Cimavia/cimavia/issues/97) |
| P6-2 | **Objet S3 orphelin quand un cycle est supprimé** : un cycle DRAFT cascade sa facture en base **sans** purger le justificatif. | 🟡 | [#73](https://github.com/Cimavia/cimavia/issues/73) · [#72](https://github.com/Cimavia/cimavia/issues/72) |
| P6-3 | **Suppression d'un cycle diffusé bloquée côté UI seulement** : `DELETE /plans/:id` accepterait encore un `PUBLISHED`, et effacerait sa facture émise. | 🟡 | [#85](https://github.com/Cimavia/cimavia/issues/85) |

---

> **Tranché en P6** (le modèle de la facturation) : une facture est **liée 1:1 à un cycle**
> (`Invoice.planId @unique`, `onDelete: Cascade`) plutôt qu'émise isolément — c'est le geste réel du
> coach (« la planif + la facture »). Trois conséquences assumées :
> **(1)** la facturation se saisit **dans le builder**, sous les semaines, et non sur un écran
> dédié ; `/invoices` ne fait plus que du **suivi** (statut payé/impayé).
> **(2)** un statut **`DRAFT`** a été ajouté à `InvoiceStatus` pour que les termes vivent avec le
> cycle en brouillon **sans polluer le modèle `Plan`** de colonnes de facturation — les deux modèles
> restent séparés, reliés par la seule FK. Le brouillon est **toujours complet** (`amountCents` et
> `dueDate` NOT NULL), ce qui rend le verrou de diffusion trivial : *un DRAFT existe ⇒ la
> facturation est remplie*. Corollaire assumé : on saisit les termes **avant** de joindre le PDF.
> **(3)** la facture est **émise dans la transaction du `publish`** (DRAFT → PENDING, `issuedAt`
> posé), donc l'athlète ne voit jamais de facture pour un cycle non diffusé, et diffuser sans
> facturation est refusé (400). Ce verrou a rendu nécessaire l'ajout d'une facturation aux setups
> P4/P5 qui diffusaient un cycle — d'où le helper `billAndPublish` des e2e.

---

## P7 — i18n & Déploiement FR

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P7-1 | **Image API à ~1 Go**, dont ~150 Mo de React Native tirés par les peerDependencies de `@better-auth/expo` — dans une image de **serveur**. | 🟢 | [#86](https://github.com/Cimavia/cimavia/issues/86) |
| P7-2 | **Migrations jouées au démarrage du conteneur** (`prisma migrate deploy` dans l'entrypoint) plutôt qu'en étape de déploiement distincte. | 🟡 | [#84](https://github.com/Cimavia/cimavia/issues/84) |

> **L'anglais n'est PAS de la dette** — c'est du périmètre v1.0 (CDC §4, §11) dont l'infrastructure
> est déjà payée : zéro string en dur depuis P0, formats localisés en fonctions pures de
> `@cmv/shared`, `Locale` et `User.locale` déjà en place. Il ne manque que `en.json`, la détection
> (les deux apps forcent `lng: "fr"`, **délibérément** — sans ressource `en`, un appareil anglais
> afficherait des libellés FR avec des dates EN) et la vérification des formats. Suivi par l'épic
> [#71](https://github.com/Cimavia/cimavia/issues/71), hors de ce registre.

---

## Post-MVP — Qualité & analyse statique

| # | Dette | Statut | Suivi |
|---|---|---|---|
| Q-1 | **Couverture non mesurée sur le web et le mobile** : `sonar.coverage.exclusions` écarte encore `apps/web` et `apps/mobile`, faute de harnais de test d'UI. Le tiers API est levé en **#57** (les e2e sont instrumentés : 2,6 % → ~86 %). | 🟡 | [#56](https://github.com/Cimavia/cimavia/issues/56) → ~~[#57](https://github.com/Cimavia/cimavia/issues/57)~~ [#58](https://github.com/Cimavia/cimavia/issues/58) [#59](https://github.com/Cimavia/cimavia/issues/59) |
| Q-2 | **nginx tourne en root dans l'image web** (`apps/web/Dockerfile`), signalé par Sonar (`docker:S6471`). | 🟡 | [#83](https://github.com/Cimavia/cimavia/issues/83) |
| ~~Q-3~~ | ~~**Les e2e ne sont pas typecheckés**~~ : `apps/api/test/` était hors de l'`include` du tsconfig, donc le seul filet de la couche API (cf. Q-1) tournait sans vérification de types — 16 erreurs y dormaient. | ✅ | résolu en **#130** ([#126](https://github.com/Cimavia/cimavia/issues/126)), complété en **#57** — `tsconfig.test.json` couvre `test/` **et** les deux configs Vitest, branché sur le `typecheck` de l'API |

> **Tranché en #130** (trois réglages qu'une bonne intention suffirait à défaire) — la porte e2e
> tient à des choix qui ressemblent, de loin, à des maladresses à corriger :
>
> - **`test:e2e` porte `cache: false` dans `turbo.json`.** Ce n'est pas un oubli d'optimisation.
>   Les vraies entrées de cette suite sont un Postgres et un MinIO **vivants**, plus l'état de la
>   base — rien de cela n'entre dans le hash de Turbo. Un cache hit rejouerait « 168 passed » sans
>   exécuter une requête : une porte verte qui n'a rien vérifié, soit la panne M-1 en pire, parce
>   qu'invisible.
> - **`vitest.config.e2e.ts` doit continuer de LEVER si `.env.test` manque.** Rendre le
>   `loadEnvFile` tolérant paraît robuste et ne l'est pas : la suite `TRUNCATE` toutes les tables à
>   l'ouverture, et un `DATABASE_URL` traînant dans le shell prendrait alors le relais du fichier
>   absent. Le fichier se fabrique par `cp apps/api/.env.test.example apps/api/.env.test` — et
>   `global-setup.e2e.ts` refuse en plus toute base dont le nom ne finit pas par `_e2e`.
> - **La CI monte les services par `docker compose`, pas par `services:`.** Un conteneur de service
>   GitHub n'exécute pas l'entrypoint de `minio-setup` : le bucket `cimavia-media-e2e` n'existerait
>   pas et la moitié médias de la suite tomberait. Les recréer en YAML donnerait deux copies de la
>   même logique, qui divergeraient.

> **Tranché en #57** (un fichier absent de tous les lcov vaut 0 %, pas « non mesuré ») : c'est la
> règle qui gouverne les deux périmètres de couverture, et elle est contre-intuitive. Conséquences
> à ne pas défaire : `main.ts` et `instrument.ts` sont exclus **des deux côtés** — de l'`exclude`
> de `vitest.config.e2e.ts` *et* de `sonar.coverage.exclusions` — parce que les sortir du seul lcov
> les ferait compter zéro au lieu de les retirer du calcul. Et à l'inverse, la config e2e ne
> s'aligne **pas** sur l'exclusion des `*.module.ts` / `*.dto.ts` de la config unitaire, alors que
> l'écart de chiffre serait négligeable (0,45 pt) : aligner ferait chuter une quinzaine de modules
> à 0 % dans Sonar, puisqu'aucun rapport ne les porterait plus.

> **Appris en #57** (deux commentaires décourageaient une manœuvre pour une raison fausse) :
> `sonar-project.properties` et le docblock de `vitest.config.ts` affirmaient tous deux que les e2e
> tournaient dans « un process Nest à part » et ne pouvaient donc pas être instrumentés. Ils font
> `app.listen()` **dans le process du worker Vitest**, que v8 mesure : la couverture de l'API est
> passée de 2,6 % à ~86 % sans écrire une ligne de test. Un commentaire qui explique pourquoi on
> n'a pas fait quelque chose se relit comme une porte fermée — il vaut donc d'être vérifié quand on
> s'y heurte, pas cru sur parole.

> **Appris en #57** (un typecheck peut être vert sans rien vérifier) : `vitest.config.ts` ne pouvait
> pas rejoindre l'`include` de `tsconfig.json` — sous son `moduleResolution: Node10`, les types de
> `vitest/config` ne se résolvent pas, `defineConfig` vaut `any`, et une propriété **inventée** y
> passe sans erreur. C'est `Bundler` qui a attrapé `coverage.all` et `minWorkers`, deux options
> mortes depuis Vitest 4 qu'on croyait actives. Corollaire : ajouter un fichier à un tsconfig ne
> prouve rien tant qu'on n'a pas vérifié qu'une faute délibérée y échoue.

> **Appris en #130** (un check requis se nomme par le JOB, jamais par le workflow) : le
> `Production ruleset` exigeait les contextes `CI` et `SonarCloud` — les noms des **workflows**.
> Les check runs publiés s'appellent `Lint + Typecheck + Test` et `SonarCloud Analysis`, d'après
> les noms de **jobs**. Ces deux checks n'arrivaient donc jamais : une PR vers `staging` ou
> `production` serait restée bloquée sur « Waiting for status to be reported ». Latent — aucune PR
> n'avait encore visé ces branches. Corollaire : **renommer un job décroche silencieusement la
> porte** qui le référence, dans un sens (elle n'arrive jamais) comme dans l'autre.

---

## Post-MVP — Centre de notifications ([#39](https://github.com/Cimavia/cimavia/issues/39))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| N-1 | **Pas de pagination** : `GET /me/notifications` renvoie les 50 plus récentes, sans moyen de remonter au-delà. | 🟢 | [#78](https://github.com/Cimavia/cimavia/issues/78) |
| N-2 | **Aucune rétention ni purge** : la table `notification` grossit indéfiniment. | 🟢 | [#76](https://github.com/Cimavia/cimavia/issues/76) |
| N-3 | **Une entrée par rafale de messages**, pas une par message : hérite du throttle push de P5-4. | 🟢 | — *(comportement voulu, déclencheur : aucun)* |
| N-4 | **`entityId` sans clé étrangère** : la cible est polymorphe, rien ne garantit qu'elle existe encore. | 🟡 | [#74](https://github.com/Cimavia/cimavia/issues/74) |
| N-5 | **Aucun réglage de notification** : ni opt-out par type, ni choix de canal. | 🟢 | [#65](https://github.com/Cimavia/cimavia/issues/65) [#66](https://github.com/Cimavia/cimavia/issues/66) *(épic mail [#61](https://github.com/Cimavia/cimavia/issues/61))* |
| N-6 | **Aucun groupement des ajustements de cycle** : ajouter trois séances à un cycle diffusé produit trois notifications. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-7 | **Les receipts Expo ne sont pas relus** : un échec de livraison **tardif** n'est jamais remonté. | 🟢 | [#99](https://github.com/Cimavia/cimavia/issues/99) |

> **Tranché en #48** (le modèle) : une `Notification` ne stocke **aucun libellé rendu**, seulement
> son `type`, sa cible et les paramètres d'interpolation (`actorName`, `subjectLabel`). Deux
> conséquences assumées : **(1)** le rendu vit dans les apps (`NOTIFICATION_LABEL_KEY` + i18next),
> donc une notification écrite en juillet s'affichera en anglais le jour où `en.json` arrivera —
> c'était la raison d'être du choix ; **(2)** les paramètres sont des **instantanés**, renommer un
> cycle ne réécrit pas l'historique. Le libellé du **push**, lui, reste rendu côté serveur et en
> français en dur — il n'y a pas de client pour le traduire au moment de la livraison. Son i18n
> suivra le catalogue serveur de [#63](https://github.com/Cimavia/cimavia/issues/63).

> **Appris en test (session de recette #39)** : une notification n'est pas un lien, c'est le
> **signal que l'état serveur a changé**. L'ouvrir invalide donc tout le cache client avant de
> naviguer — sans quoi cliquer « nouveau débrief » depuis l'écran des débriefs ne fait
> littéralement rien (navigation no-op + `staleTime`), et arriver par un push mobile affiche la
> version d'avant l'événement annoncé (cache persisté, frais 5 min). L'invalidation est **globale
> et non ciblée** : une table `entityType → clés de requête` couplerait la feature notification à
> toutes les autres et se périmerait en silence au premier changement de route.

---

## Post-MVP — Rappels ([#38](https://github.com/Cimavia/cimavia/issues/38))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| R-1 | **Aucun push quand un rappel devient dû** : sans scheduler, il n'apparaît qu'au prochain chargement du centre. | 🟢 | [#47](https://github.com/Cimavia/cimavia/issues/47) |
| R-2 | **Pas de pagination** sur `GET /reminders` : deux segments bornés à 100 (à traiter / traités). | 🟢 | [#106](https://github.com/Cimavia/cimavia/issues/106) |
| R-3 | **Pas de report d'échéance ni d'édition** : reprogrammer un rappel = en créer un autre. | 🟢 | [#105](https://github.com/Cimavia/cimavia/issues/105) |
| R-4 | **`entityId` sans clé étrangère**, comme N-4. La purge couvre la suppression d'un cycle **et de sa facture** ; les autres chemins de disparition (suppression d'une relation coach↔athlète) restent découverts. | 🟡 | [#108](https://github.com/Cimavia/cimavia/issues/108) · [#74](https://github.com/Cimavia/cimavia/issues/74) |
| R-5 | **Aucune rétention** des rappels `DONE`/`DISMISSED` : la table grossit indéfiniment (même famille que N-2). | 🟢 | [#107](https://github.com/Cimavia/cimavia/issues/107) |

> **Tranché en #44** (le modèle) : un rappel est l'**outil privé du coach** — la seule entité métier
> scopée `coachId` **seul**, qu'aucun athlète ne voit sous aucune forme. Quatre conséquences
> assumées : **(1)** la `note` est **obligatoire**, parce qu'elle EST le contenu du rappel et le
> libellé de sa ligne ; c'est du texte du coach, pas un libellé système, donc la stocker ne contredit
> pas la règle des notifications. Corollaire pour #47 : un rappel **auto-généré** ne devra pas
> fabriquer de note mais porter un `reason` rendu côté client, sinon on réintroduit le libellé figé
> en français. **(2)** `readAt` (« vu dans le centre ») est **distinct** du statut (« traité ») —
> sans ce dédoublement, un coup d'œil vaudrait « fait », ou le badge ne se viderait jamais.
> **(3)** `DISMISSED` est la suppression douce : pas de `DELETE`, et les trois transitions sont
> réversibles. **(4)** `ReminderEntityType` est **volontairement plus étroit** que
> `NotificationEntityType` (ce qu'on peut *rappeler* ≠ ce vers quoi une notification *pointe*) ; les
> fondre aurait obligé l'API à refuser `CONVERSATION` et `SCHEDULED_SESSION` applicativement — soit
> ce sous-ensemble, réécrit à la main. Le pont est une table `satisfies Record<…>`, donc
> `routeForNotification` n'a rien eu à changer, ni côté web ni côté mobile.

> **Tranché en #51** (le rappel dû dans le centre) : l'entrée est **calculée à chaque lecture**,
> jamais persistée — `REMINDER_DUE` est le seul `NotificationType` **absent de l'enum Prisma**, et
> son absence documente le fait que la base ne peut pas le stocker (le typecheck l'impose via
> `PersistedNotificationType`). Deux conséquences : son `id` porte le préfixe `reminder:`, ce qui
> garde **une seule** route `PATCH /me/notifications/:id/read` et laisse les deux UI ignorer qu'il y
> a deux sources ; et son `createdAt` vaut le `dueAt` du rappel — daté de sa création, un rappel posé
> longtemps à l'avance serait enterré sous des semaines de notifications le jour où il compte.
> **Le jour où #47 poussera un rappel dû, il devra choisir entre persister et calculer**, jamais les
> deux, sinon le même rappel apparaîtra en double.

> **Appris en construisant #44/#51** (le coût réel d'un scope à un seul rôle) : un modèle absent de
> `TENANT_SCOPES` **pour un rôle** est refusé par une *erreur*, pas par un 403 ni par une liste vide.
> Lire la table `reminder` depuis le centre de notifications — écran servi aux **deux** rôles —
> aurait donc renvoyé un **500 à tout athlète**, sur une page qui ne parle même pas de rappels. Toute
> future entité mono-rôle devra porter les deux gardes : `@Roles` sur le contrôleur, et un
> branchement explicite partout où un chemin partagé la touche.

> **Écart de promotion assumé** : `REMINDER_BADGE` (variant + clé i18n par état) reste dans
> `apps/web/src/feature/reminder/`, alors que son équivalent facture `INVOICE_STATE_BADGE` vit dans
> `@cmv/shared`. Raison : un seul client la rend aujourd'hui, #46 étant reportée (règle de promotion
> — 2+ apps → package). La **dérivation** (`isReminderDue`), elle, est bien partagée. La table monte
> avec l'écran mobile.

---

## Post-MVP — Dashboard coach ([#110](https://github.com/Cimavia/cimavia/issues/110))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| D-1 | **Sept requêtes au chargement de `/`** (athlètes, planifs, débriefs, factures, conversations, résumé des rappels, non-lues) : la jointure du tableau est faite côté client, sans endpoint d'agrégat. Le **polling** de deux d'entre elles a été coupé sur cet écran (#113) — il ne reste que celui du badge, qui est sa raison d'être. | 🟢 | [#114](https://github.com/Cimavia/cimavia/issues/114) |
| D-2 | **Pas de recherche, de tri ni de filtre** sur le tableau de suivi, là où la maquette en prévoit (« À relancer », « Sans plan », tri par activité). Acceptable tant qu'un coach compte ses athlètes sur les doigts d'une main. | 🟢 | — *(déclencheur : un coach qui scrolle pour se retrouver)* |

> **Tranché en #52** (aucune information lue deux fois) : c'est la contrainte qui a façonné l'écran,
> parce que sept tuiles offrent sept occasions de recompter la même chose. Trois conséquences.
> **(1)** « Factures en attente » **exclut désormais les factures en retard** : `OVERDUE` étant
> *dérivé* et non stocké, l'ancien filtre `status === PENDING` les comptait des deux côtés — et
> rangeait parmi les factures qui vont bien celles qu'il faut relancer. Les deux compteurs
> **partitionnent** l'impayé (`countPendingInvoices` + `countOverdueInvoices`). Corollaire visible :
> le chiffre de la tuile existante a baissé, ce n'est pas une régression.
> **(2)** « Rappels dus » compte les rappels **non traités**, pas les non lus — sinon dérouler la
> cloche viderait une tuile « à traiter » sans qu'aucun rappel n'ait été traité (`readAt` ≠ `status`,
> cf. #44). D'où `GET /reminders/summary`, distinct du compteur du badge.
> **(3)** « Notifications non lues » affiche **exactement** le nombre de la cloche, donc **recoupe
> volontairement** « Rappels dus », qu'il inclut. Redondance assumée : afficher un nombre voisin mais
> différent de celui montré à 300 px au-dessus serait plus déroutant que la redondance elle-même. La
> cloche est une union par construction ; la tuile en est le panneau indicateur, et son libellé y
> renvoie.

> **Écart de maquette, ~~consigné~~ RÉSOLU en #113** : `coach_dashboard_athletes.dc.html` décrivait
> **un seul écran** — strip de statistiques **au-dessus d'un tableau d'athlètes** — là où
> l'implémentation avait scindé en `/` (tuiles) et `/athletes` (grille de cartes). Le tableau est
> revenu sur `/`, et `/athletes` a été **supprimé** : son invitation et sa fiche athlète ont
> déménagé (en-tête et bouton de ligne), et la route survit en **redirection** vers `/` — un 404 sur
> un chemin qu'on a soi-même publié serait une régression gratuite.

> **Tranché en #113** (ce que le tableau montre, et ce qu'il ne montre pas) :
> **(1)** la colonne **« Dernière activité » de la maquette est supprimée**, pas reportée. Les
> colonnes « Débriefs » et « Messages » la remplacent en disant *quoi* attend une réponse et en y
> **menant** ; elle aurait de toute façon été partiellement fausse, une séance faite **sans** débrief
> n'apparaissant dans aucune liste que le coach charge.
> **(2)** pas de **sous-titre « spécialité »** sous le nom : `AthleteSheetDto` n'a qu'un `content`
> texte libre, il n'y a aucune donnée derrière.
> **(3)** pas de **badge de statut de relation** : `CoachAthleteStatus.PENDING` n'est jamais écrit
> (`@default(ACTIVE)`, et `InvitationService` pose `ACTIVE`), et les services filtrent sur `ACTIVE`.
> Une colonne de badges tous identiques n'informe personne. Les clés i18n correspondantes ont été
> purgées.
> **(4)** la pastille d'identité est en **fond neutre** : colorer par personne demande une palette
> *décorative* que `@cmv/tokens` n'a pas — ses familles sont des **états**, et les détourner ferait
> lire une alerte là où il n'y a qu'un nom (cf. arbitrage #37). La couleur et la photo arrivent avec
> l'épic [#117](https://github.com/Cimavia/cimavia/issues/117) ; `CmvAvatar` sait déjà rendre une
> image, aucun DTO ne la sert encore.
> **(5)** le **chevron de fin de ligne** attend sa destination : il reviendra avec une route
> `/athletes/$athleteId`. En attendant, c'est le bouton « Fiche » qui ouvre le panneau — un chevron
> qui n'ouvre qu'un tiroir mentirait sur ce qui suit.

> **Deux écarts volontaires** à la même maquette : les tuiles sont réparties en **deux rangées**
> nommées (« À traiter » / « Vue d'ensemble ») là où la maquette n'en prévoyait qu'une de quatre —
> à sept, une strip unique redevient une grille indifférenciée où rien ne ressort ; et les tuiles
> « à traiter » sont **cliquables**, alors que la strip de la maquette est décorative — une tuile qui
> annonce du travail sans y mener est un cul-de-sac.

---

## Post-MVP — Copie d'une semaine ([#4](https://github.com/Cimavia/cimavia/issues/4))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P2-1~~ / ~~P3-2~~ | **Nouveau déclencheur** : vider la semaine cible cascade ses `ScheduledSessionExerciseDocument` **sans** passer par `deleteObjectIfUnreferenced`. Si la cible portait la dernière copie d'une clé dont l'exercice de bibliothèque est déjà supprimé, l'objet reste orphelin. Le *collage*, lui, va dans le sens sûr (plus de copies = plus de références = objet retenu, jamais purgé pendant qu'il sert). | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |

> **Tranché en #4** (ce que la copie emporte, et ce qu'elle laisse) : elle reproduit ce que le
> **coach a composé** — type et note de semaine, séances, consignes, exercices, documents — et laisse
> tout ce qui appartient à l'athlète ou à l'exécution. Quatre exclusions, chacune pour sa raison :
> **`ScheduledSessionStatus`** (la copie naît `PLANNED` ; `DONE` est posé par le débrief et la
> transition est sans retour — une séance collée « déjà faite » serait indébriefable et fausserait
> les tuiles du dashboard) ; **`SessionFeedback`** (`@unique` sur la séance, et écrit par l'athlète :
> le copier lui attribuerait un texte qu'il n'a pas écrit, et `coachReadAt: null` ressusciterait une
> ligne « à relire ») ; **`FeedbackMedia`** (seul média jamais partagé du projet — sa clé objet
> n'appartient qu'à lui, donc le copier voudrait dire **dupliquer le binaire**) ; **les messages
> rattachés** (un message est un événement daté et signé ; le repointer ferait mentir l'historique,
> le dupliquer créerait un message que personne n'a envoyé). Le contenu copié est **le même que le
> cycle source soit brouillon ou diffusé**.

> **Tranché en #4** (les dates) : elles ne sont **pas recopiées** mais **recalculées** depuis le
> lundi de la semaine cible (`planWeekCopyShiftDays`, `@cmv/shared`). Le décalage se prend entre les
> deux **lundis**, jamais entre les numéros de semaine : `(M−N)×7` ne vaut qu'à l'intérieur d'un même
> cycle, alors que la copie traverse aussi deux cycles aux `startDate` différents. Les deux étant des
> lundis, le décalage est **toujours un multiple de 7** — le jour de la semaine tient, et
> `@@unique([planWeekId, scheduledDate, position])` reste satisfaite après translation (l'application
> est injective). Corollaire : **le collage ne crée jamais la semaine cible**. `weekNumber` est
> contigu et `addWeek` n'ajoute qu'en `count + 1` ; coller sur « la semaine 9 » d'un cycle de 3
> fabriquerait 4 à 8 vides en silence. Le coach ajoute sa semaine, puis colle.

> **Tranché en #4** (la semaine cible non vide) : **remplacement**, jamais fusion. Ce n'est pas un
> choix de confort — deux semaines portant chacune une séance le mardi en position 0 collisionnent
> sur l'unicité, et renuméroter pour absorber réordonnerait la journée du coach sans qu'aucune règle
> ne dise qui passe devant. L'API remplace sans état d'âme (elle est idempotente) ; c'est **l'UI** qui
> porte la confirmation, armée à la manière d'une suppression et seulement quand il y a quelque chose
> à écraser. Le toast annonce ensuite le nombre de séances qui ont atterri — sans quoi un collage
> remplaçant 4 séances par 2 passerait inaperçu.

> **Tranché en #4** (le cycle diffusé) : coller dans un `PUBLISHED` est **refusé** (409). Chaque
> séance écrite notifierait l'athlète séparément et rien ne groupe ces notifications (dette **N-6**,
> [#98](https://github.com/Cimavia/cimavia/issues/98)) : une semaine de cinq séances lui enverrait
> cinq notifications et cinq push. Le geste n'existe donc pas sur un cycle diffusé plutôt que
> d'exister en harcelant. **Ce n'est PAS de la dette** : c'est un choix de périmètre, et non une
> feature reportée — aucune issue ne la porte. Le jour où on voudrait l'ouvrir, #98 devrait atterrir
> d'abord. En revanche, **copier DEPUIS un cycle diffusé est autorisé** : lire ne mute rien, et
> « reprendre le bloc du mois dernier » est le cas d'usage même de la feature.

> **Tranché en #4** (la brique partagée avec [#5](https://github.com/Cimavia/cimavia/issues/5)) : on
> n'écrit **pas** de service de copie profonde générique, mais on isole l'**atome** que #5 appellera N
> fois. #5 a quatre exigences que #4 n'a pas — réassigner à un autre athlète, créer le plan cible qui
> n'existe pas encore, décaler vers un lundi arbitraire, ne pas copier la facture (1:1 avec le cycle,
> P6) — et son corps dit encore « à préciser plus tard » sur trois d'entre elles : généraliser
> maintenant, ce serait concevoir contre une spec inventée. L'atome extrait est
> `insertScheduledSessionExercises` (`plan/scheduled-session.writer.ts`), qui reçoit les documents
> **déjà résolus par l'appelant** — c'est là tout le seam : une **création** les lit dans la
> bibliothèque, une **copie** les lit sur l'instance source, parce que `sourceExerciseId` passe à
> `null` (`SetNull`) si le coach a supprimé l'exercice entre-temps et que repasser par la bibliothèque
> perdrait alors des documents que l'instance porte pourtant encore. Reste à #5 : la création du plan,
> la réassignation d'athlète, le choix du lundi, la facturation.

> **Tranché en #4** (le presse-papier, côté web) : il vit dans `sessionStorage` derrière
> `useSyncExternalStore`, et non dans un `useState` ni un provider. Il doit survivre au **changement
> de route** (copier dans un cycle pour coller dans un autre est la moitié de la feature, et un état
> local mourrait au démontage du builder), **mourir avec l'onglet**, et être lu par des composants
> **frères** (chaque carte de semaine, plus le bandeau) — le stockage *est* déjà l'état partagé, un
> contexte ne ferait que le recopier. Deux conséquences assumées : aucun partage **entre onglets**
> (déclencheur : aucun — un coach ne construit pas un cycle dans deux onglets), et **coller ne vide
> pas** le presse-papier, parce que reproduire une même semaine sur plusieurs semaines d'affilée est
> le geste courant.

> **Écart de maquette assumé** : `coach_builder_planification.dc.html` ne prévoit **aucun** geste de
> copie — l'en-tête de semaine n'y porte que le type, le compteur de séances et « Déplier ». Les deux
> boutons (« Copier », « Coller ici ») y ont été ajoutés, plus un **bandeau** en tête du builder
> nommant la semaine armée. Le bandeau n'est pas décoratif : le presse-papier survivant à la
> navigation, des boutons « Coller ici » apparaîtraient sinon sur un autre cycle sans que rien ne dise
> ce qui est armé ni d'où il vient.

---

## Post-MVP — Couleurs d'état (#37)

> **Tranché** (le type de semaine) : le design system
> (`docs/maquettes/shared/design_system.dc.html`) réserve délibérément la couleur à l'action
> primaire et rend le **type de semaine** en neutre, par contraste de luminosité ; le builder
> (pd-7) va plus loin et **assombrit** la carte d'une semaine `DELOAD`. L'issue #42 vient du
> retour inverse d'un coach en usage réel — « besoin de plus de couleur sur les éléments
> importants ». Arbitrage : on colore **la seule décharge** (famille `info`, bleu ardoise) et on
> laisse l'entraînement neutre. La couleur marque l'**exception**, pas la règle : l'économie de
> couleur du DS est préservée, le terracotta reste réservé à l'action primaire. Sur ce point
> précis, les maquettes ne font donc plus référence. Les statuts de facture, eux, restent
> conformes — le DS les colore déjà (`success`/`warning`/`error`).

---

## Post-MVP — Parité multi-plateforme ([#20](https://github.com/Cimavia/cimavia/issues/20))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~M-1~~ | ~~**Les e2e ne tournent dans aucune porte**~~ : la CI lançait `pnpm turbo test`, qui exécute le script `test` de chaque paquet — les 168 e2e ont le leur (`test:e2e`) et n'étaient donc jamais exécutés en PR. Découvert en #36 : deux e2e cassés pendant des jours derrière une CI verte. | ✅ | résolu en **#130** — job `E2E (isolation multi-tenant)` sur chaque PR, **requis** dans les rulesets `main` et `staging`/`production` |
| M-2 | **Pas de note vocale de débrief sur Firefox** : `FEEDBACK_AUDIO_MIME_TYPES` n'accepte pas `audio/webm`, seul format que Firefox sache produire. Le bouton disparaît, avec un message. Texte, photos et vidéos restent disponibles. | 🟢 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| M-3 | **Lecture iOS d'une note vocale web non vérifiée** : Chrome produit désormais du `audio/mp4` (le webm ne part plus), mais aucun iPhone réel n'a testé la lecture. Risque faible — mp4/AAC est le format natif d'iOS — mais non mesuré. | 🟡 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| M-4 | **Préparation média toujours dupliquée entre les deux features mobile** (`feedback` ↔ `message`). La moitié web a été résolue en #26 par une promotion **intra-app** ; la moitié mobile reste. | 🟢 | [#96](https://github.com/Cimavia/cimavia/issues/96) |
| M-5 | **Pas de presse-papier sur mobile** : l'invitation se transmet par `Share` (SMS, WhatsApp) et non par « Copier le code » comme la maquette. `expo-clipboard` n'est pas une dépendance du projet. | 🟢 | — *(déclencheur : un coach qui veut coller le code ailleurs)* |

> **Tranché en #20** (la garde vit sur la ROUTE, pas dans l'écran) : les hooks React s'exécutent
> **avant tout `return`**. Une garde en tête d'écran laisse donc partir ses requêtes — `MessagesScreen`
> appelle `useAthletes()` (`GET /athletes`, coach seul) et `ConversationScreen` appelait
> `useMyCoach()` (`GET /me/coach`, athlète seul). Ouvrir ces écrans à l'autre rôle avec une garde
> interne aurait donné **un 403 à chacun sur sa propre page**. D'où `CmvRoleGate` dans le fichier de
> route (web) et `CmvCapabilityGate` dans le `_layout.tsx` (mobile) : l'écran n'est pas monté du
> tout tant que la capacité n'est pas confirmée. Corollaire appliqué partout ensuite : quand deux
> rôles partagent une route, on écrit **deux composants**, jamais un `if` interne.

> **Tranché en #20** (`capabilitiesOf` plutôt que #10) : la nav devait dépendre de #9/#10, qui
> remplacent le rôle exclusif par `isCoach`/`isAthlete` — une migration Prisma et la réécriture de
> `tenantField`, en milestone `v1.0`, dans une épic qui annonce « aucun changement backend ». La
> dépendance a été **supprimée** au profit d'un adaptateur : `capabilitiesOf(user)` dans
> `@cmv/shared` est le **seul** endroit du monorepo qui lise `role` pour en déduire un droit. Gardes,
> navigation et routage des notifications consomment son résultat. Le jour de #10, un corps de
> fonction change, dans un package testé. Le prix assumé : le cas **double capacité** est écrit mais
> inatteignable, et ses sections de nav sont parties dans
> [#129](https://github.com/Cimavia/cimavia/issues/129) — les écrire ici aurait produit des clés
> i18n mortes que `check:i18n --strict` aurait signalées à raison.

> **Tranché en #20** (une ressource = un écran, jamais deux) : `GET /invoices` et
> `GET /conversations` sont scopées par le tenant et servent les deux rôles. Chaque plateforme a
> donc **un** écran, branché sur un booléen (`canManage`) ou séparé en deux composants quand les
> requêtes diffèrent — jamais un second écran qui recopierait la lecture pour n'en changer que les
> boutons. C'est ce qui garde `new_duplicated_lines_density` sous le seuil sans une seule exclusion
> Sonar.

> **Tranché en #20** (rien ne mène nulle part) : `routeForNotification` était **aveugle au rôle**
> des deux côtés, parce que chaque plateforme ne servait qu'un rôle. Ouvrir l'autre transformait
> quatre destinations en culs-de-sac — dont deux en **403** (`/session/:id` et `/messages` mobile
> pour un coach). La table dépend désormais de la capacité, et rend `null` tant que l'écran n'existe
> pas de ce côté : la cloche marque alors lu et invalide le cache **sans naviguer**, ce qui est le
> message exact (« il s'est passé quelque chose »), sans mentir sur l'endroit. Chaque écran a branché
> sa destination en arrivant. `PLAN` reste `null` côté coach **définitivement** — le builder est
> web-only. Corollaire pour toute nouvelle cible : elle se branche dans la PR qui crée son écran,
> jamais avant.

> **Tranché en #20** (les plafonds ne s'écrivent jamais en dur) : onze messages de refus et deux
> e2e citaient les limites média en clair (« dépasse 50 Mo », « 3 notes »). Le jour où elles ont
> bougé, **tout est resté vert** : le typecheck ne lit pas le français, `check:i18n` vérifie
> l'existence des clés et non la véracité de leur contenu, et les e2e ne tournent pas en CI (M-1).
> `MediaRejectedError` porte désormais ses paramètres, et `megabytesOf`/`minutesOf` vivent dans
> `@cmv/shared`. Toute borne affichée ou testée se dérive de sa constante.

> **Appris en #20** (le câblage de navigation n'a aucune porte) : trois pannes n'ont été révélées
> que par un clic. **Web** — un fichier de segment devient une route *layout* dès qu'un enfant
> existe, et sans `<Outlet />` l'enfant ne s'affiche jamais : l'URL changeait, la page non
> (`routeTree.gen.ts` porte `@ts-nocheck`, et la référence morte vivait dans une closure). **Mobile**
> — `href: null` masque un onglet mais ne choisit pas la **route initiale** du navigateur : un coach
> atterrissait sur `/planning` sous une barre d'onglets pourtant correcte. **Mobile** — les routes
> hors onglets (`/athlete/[id]`, `/session/[id]`, `/join`) n'avaient **aucune** garde de capacité.
> Ni `tsc`, ni `biome`, ni `vite build`, ni `expo export` ne voient ces cas. Deux conséquences
> pratiques : toute PR qui ajoute une route se teste **en cliquant**, et les types de routes Expo
> (`.expo/types/router.d.ts`) ne sont régénérés que par le **serveur de dev** — pas par `expo export`.

---

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
