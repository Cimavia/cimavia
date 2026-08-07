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
autonomes. Deux dettes n'ont **volontairement pas** d'issue, leur déclencheur étant explicitement
« aucun » : **P2-4** et **N-3**.

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
| Q-1 | **Couverture non mesurée hors `@cmv/shared`** : `sonar.coverage.exclusions` écarte les trois apps. L'API est couverte par les e2e, qui ne produisent aucun lcov. | 🟡 | [#56](https://github.com/Cimavia/cimavia/issues/56) → [#57](https://github.com/Cimavia/cimavia/issues/57) [#58](https://github.com/Cimavia/cimavia/issues/58) [#59](https://github.com/Cimavia/cimavia/issues/59) |
| Q-2 | **nginx tourne en root dans l'image web** (`apps/web/Dockerfile`), signalé par Sonar (`docker:S6471`). | 🟡 | [#83](https://github.com/Cimavia/cimavia/issues/83) |

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
| R-2 | **Pas de pagination** sur `GET /reminders` : deux segments bornés à 100 (à traiter / traités). | 🟢 | *(issue à créer)* |
| R-3 | **Pas de report d'échéance ni d'édition** : reprogrammer un rappel = en créer un autre. | 🟢 | *(issue à créer)* |
| R-4 | **`entityId` sans clé étrangère**, comme N-4. La purge couvre la suppression d'un cycle **et de sa facture** ; les autres chemins de disparition (suppression d'une relation coach↔athlète) restent découverts. | 🟡 | *(issue à créer)* · [#74](https://github.com/Cimavia/cimavia/issues/74) |
| R-5 | **Aucune rétention** des rappels `DONE`/`DISMISSED` : la table grossit indéfiniment (même famille que N-2). | 🟢 | *(issue à créer)* |

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

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
