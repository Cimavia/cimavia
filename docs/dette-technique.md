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
[#70](https://github.com/Cimavia/cimavia/issues/70) durcissement avant prod ·
[#7](https://github.com/Cimavia/cimavia/issues/7) capacités coach/athlète — plus dix issues
autonomes. **Vingt-et-une dettes n'ont pas d'issue**, en trois familles : **P2-4**, **N-3** et **C-1**, dont
le déclencheur est explicitement « aucun » (pour **C-1**, l'issue serait même un contresens — le
déclencheur est qu'on la « corrige » à tort) ; **M-5**, **U-3**, **U-4**, **V-1**, **V-2**, **R-2**,
**W-1**, **Q-6**, **MI-1**, **MI-2**, **O-2**, **N-5**, **N-9**, **I-1**, **I-2**, **I-3** et **I-4**,
dont le déclencheur est nommé mais
dont rien n'est à préparer avant qu'il survienne ; et **Q-5** enfin, qui se règle dans une interface SonarCloud,
où une issue n'aurait rien à suivre que le fait de s'en souvenir. Les vingt premières sont
volontaires, la dernière non.
Toutes les lignes de la section [#7](https://github.com/Cimavia/cimavia/issues/7) ci-dessous sont
résolues sauf **C-1** : ce qui y reste est de la décision, pas de la dette en attente.

---

## P2 — Exercices & Séances

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P2-1 | **Objets orphelins en object storage** : upload réussi mais `POST /documents` échoué → fichier dans le bucket sans ligne en base. | 🟡 | [#72](https://github.com/Cimavia/cimavia/issues/72) |
| P2-2 | **Pas de pagination** sur `GET /exercises` et `GET /sessions` : tout est renvoyé. | 🟢 | [#79](https://github.com/Cimavia/cimavia/issues/79) |
| ~~P2-3~~ | ~~**Pas de drag & drop** dans le SessionBuilder~~ : réordonnancement par boutons ↑/↓. | ✅ | jamais vraie pour le `SessionBuilder`, qui a le glisser **depuis son commit de création** — [#165](https://github.com/Cimavia/cimavia/issues/165) l'annonçait (« absorbe #93 ») sans que #93 soit fermée. [#93](https://github.com/Cimavia/cimavia/issues/93), recyclée, a couvert les **deux surfaces qui manquaient** : la séance planifiée et les séances d'une journée |
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
| P3-5 | **Écart aux maquettes assumé** : pas de durée de séance (« 75 min » en pd-7/pd-9). Le glisser-déposer, lui, n'en est plus un — cf. ~~P2-3~~. | 🟢 | [#94](https://github.com/Cimavia/cimavia/issues/94) |
| ~~P3-6~~ | ~~**Tuile « Factures en attente » non branchée**~~ : affichait `—`, marquée `// MOCKED`. | ✅ | résolue en **P6** — branchée sur `pendingCount(invoices)` |

---

> **Tranché en P3** (la question ouverte du modèle) : `ScheduledSessionExercise` est une **copie autonome** — snapshot `title`/`description`/`prescription` + `sourceExerciseId` **nullable en `SetNull`** (traçabilité seule), et les documents sont **copiés en lignes** partageant la clé objet. Conséquence : le coach peut supprimer un exercice de sa bibliothèque **sans jamais casser ni bloquer** une planification diffusée (pas de `Restrict`, pas de 409 à vie). La bibliothèque (`SessionExercise`) garde, elle, son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## P4 — Débrief & Médias

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P4-1 | **Vidéo non transcodée** : le plafond 720p n'est ni appliqué ni vérifié — une vidéo hors plafonds est **refusée**, pas réencodée. | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) |
| P4-2 | **Durée vidéo déclarative** : `durationSeconds` vient du client, le serveur ne décode pas le fichier. | 🟢 | [#81](https://github.com/Cimavia/cimavia/issues/81) |
| P4-3 | **Vol de token push possible** : `POST /me/push-tokens` réaffecte au compte courant un token déjà enregistré. | 🟡 | [#90](https://github.com/Cimavia/cimavia/issues/90) |
| P4-4 | **Pas de miniature vidéo sur mobile** : ni dans la galerie de débrief, ni dans la bulle de messagerie. La pastille ouvre la vidéo dans le lecteur système depuis **#151**, mais reste un libellé — aucun aperçu de l'image. Un seul module natif à payer pour les deux surfaces. | 🟢 | [#92](https://github.com/Cimavia/cimavia/issues/92) · [#155](https://github.com/Cimavia/cimavia/issues/155) |
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

> **Tranché en #190** (répondre à un débrief) : la réponse est un **`Message` rattaché**
> (`Message.sessionFeedbackId`), pas une entité nouvelle — le champ était au schéma et validé
> côté serveur depuis P5, sans aucune UI. Elle hérite ainsi des médias, des non-lus, du push, du
> throttle et de la pagination à venir. Écartés : une entité `FeedbackReply` (il faudrait tout
> reconstruire, et `sessionFeedbackId` deviendrait du code mort) et un `coachComment` unique sur
> `SessionFeedback` (ni aller-retour, ni média). Quatre conséquences que le code ne justifie pas
> seul : **« répondu » est dérivé** (premier message dont `senderId === coachId`), jamais stocké —
> même dispositif que `resolveInvoiceState` et `isReminderDue` ; **`coachReadAt` ne bouge pas**,
> « lu » et « répondu » étant deux axes ; **aucun nouveau `NotificationType`**, l'athlète reçoit
> `MESSAGE_RECEIVED` et la notification ouvre la conversation ; et **lire une réponse depuis le
> débrief ne marque rien lu** — `markRead` est par FIL, l'appeler là éteindrait des non-lus que
> personne n'a vus. Le rattachement est **résolu à la lecture** par une requête scopée à part
> (`MessageAttachmentResolver`), jamais par un `include` imbriqué, qui ferait fuir le libellé
> d'une cible hors relation sans rien signaler.

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
> facturation est refusé (400) — **sauf en auto-coaching**, où #14 a levé ce gating (on ne se
> facture pas soi-même), et le refus est précédé depuis #144 de celui du destinataire manquant. Ce verrou a rendu nécessaire l'ajout d'une facturation aux setups
> P4/P5 qui diffusaient un cycle — d'où le helper `billAndPublish` des e2e.

---

## P7 — i18n & Déploiement FR

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P7-1 | **Image API à ~1 Go**, dont ~150 Mo de React Native tirés par les peerDependencies de `@better-auth/expo` — dans une image de **serveur**. | 🟢 | [#86](https://github.com/Cimavia/cimavia/issues/86) |
| P7-2 | **Migrations jouées au démarrage du conteneur** (`prisma migrate deploy` dans l'entrypoint) plutôt qu'en étape de déploiement distincte. | 🟡 | [#84](https://github.com/Cimavia/cimavia/issues/84) |
| ~~P7-3~~ | ~~**Aucun e-mail de réinitialisation n'était envoyé**~~ : `sendResetPassword` journalisait le lien en `// MOCKED`, dernier du dépôt. Personne n'aurait pu récupérer son mot de passe en production. **Jamais inscrite ici au moment où elle a été prise** — c'est la règle de capture qui a été manquée, pas le raccourci qui était illégitime. | ✅ | résolue en **#63** — `MailService` + catalogue serveur FR/EN ([#62](https://github.com/Cimavia/cimavia/issues/62) · [#63](https://github.com/Cimavia/cimavia/issues/63)) |

> **L'anglais n'est PAS de la dette** — c'est du périmètre v1.0 (CDC §4, §11) dont l'infrastructure
> est déjà payée : zéro string en dur depuis P0, formats localisés en fonctions pures de
> `@cmv/shared`, `Locale` et `User.locale` déjà en place. Il ne manque que `en.json`, la détection
> (les deux apps forcent `lng: "fr"`, **délibérément** — sans ressource `en`, un appareil anglais
> afficherait des libellés FR avec des dates EN) et la vérification des formats. Suivi par l'épic
> [#71](https://github.com/Cimavia/cimavia/issues/71), hors de ce registre.

> **Tranché en #63** (le serveur a son propre catalogue, et c'est l'inverse du choix de #48) : les
> e-mails sont traduits par un objet typé côté API (`infra/mail/locale/{fr,en}.ts`), pas par
> i18next ni par les catalogues des apps. Trois conséquences que le code ne justifie pas seul.
>
> - **Un e-mail est FIGÉ à l'envoi.** Une notification ne stocke aucun libellé rendu (#48)
>   précisément pour s'afficher en anglais le jour où `en.json` arrivera ; un e-mail part une fois
>   et ne se re-rend jamais. Il doit donc être traduit à l'écriture, dans la langue que la base
>   connaît (`User.locale`) — à un instant où personne n'est authentifié et où aucun client
>   n'existe, Better Auth appelant `sendResetPassword` seul.
> - **L'anglais est écrit maintenant, dormant.** Le `satisfies MailStrings` en fait une obligation
>   de compilation : ajouter une valeur à `Locale` sans son catalogue ne compile pas. C'est le
>   premier anglais du dépôt — les catalogues clients n'ont que `fr.json` jusqu'à
>   [#71](https://github.com/Cimavia/cimavia/issues/71).
> - **Aucune couleur dans le rendu.** La règle dure n°3 interdit tout `#xxxxxx` hors `@cmv/tokens`,
>   un client mail ne lit aucune classe Tailwind, et la palette est sombre par construction —
>   `text.hi` serait illisible sur le fond blanc d'un client mail, que Gmail et Outlook
>   réinversent de toute façon. Le jour où l'on voudra une marque dans l'e-mail, c'est
>   `cmvColors` qu'il faudra rendre consommable par l'API, pas un hexadécimal à la main.
>
> Dette restante, et elle n'a pas d'issue : le libellé du **push** est toujours rendu côté serveur
> et en français en dur (`NotificationService`). L'encadré de #48 annonçait qu'il « suivrait le
> catalogue serveur de #63 » — le catalogue est là et l'accueillerait sans rien changer, mais #63
> ne le demandait pas et rien ne l'a fait. Le déclencheur est l'activation de l'anglais
> ([#71](https://github.com/Cimavia/cimavia/issues/71)) : avant elle, traduire un push n'a aucun
> destinataire.

---

## Post-MVP — Qualité & analyse statique

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~Q-1~~ | ~~**Couverture non mesurée sur le web et le mobile**~~ : `sonar.coverage.exclusions` n'écartait la mesure que sur `@cmv/shared`, les trois autres paquets étant hors de vue. Les trois tiers sont levés — API en **#57** (e2e instrumentés, 2,6 % → ~86 %), web en **#58**, mobile en **#59** (Vitest, périmètre total). | ✅ | [#56](https://github.com/Cimavia/cimavia/issues/56) → ~~[#57](https://github.com/Cimavia/cimavia/issues/57)~~ ~~[#58](https://github.com/Cimavia/cimavia/issues/58)~~ ~~[#59](https://github.com/Cimavia/cimavia/issues/59)~~ |
| Q-2 | **nginx tourne en root dans l'image web** (`apps/web/Dockerfile`), signalé par Sonar (`docker:S6471`). | 🟡 | [#83](https://github.com/Cimavia/cimavia/issues/83) |
| ~~Q-3~~ | ~~**Les e2e ne sont pas typecheckés**~~ : `apps/api/test/` était hors de l'`include` du tsconfig, donc le seul filet de la couche API (cf. Q-1) tournait sans vérification de types — 16 erreurs y dormaient. | ✅ | résolu en **#130** ([#126](https://github.com/Cimavia/cimavia/issues/126)), complété en **#57** — `tsconfig.test.json` couvre `test/` **et** les deux configs Vitest, branché sur le `typecheck` de l'API |
| Q-4 | **Les composants et écrans web n'ont pas de filet** : la couverture est mesurée depuis #56, elle affiche ce qu'elle mesure. 169 fichiers `component/` + `screen/` (105 web, 64 mobile), dont **89** portent de la logique — état dérivé, filtres, tris, `switch` ; les 80 autres n'ont rien à affirmer. Le harnais de rendu web et les **8 plus chargés** sont livrés en **#188** ; celui du mobile en **#156**. Le reste est faisable au coup par coup, le jour où on y touche. | 🟡 | [#188](https://github.com/Cimavia/cimavia/issues/188) · volet mobile : **#156** (et non #137, qui ne traite que des adaptateurs de formatage — pointeur corrigé en #156) |
| Q-5 | **La Quality Gate bloque la CI alors que `main` est rouge** : `sonar.qualitygate.wait` est branché, mais la période de code neuf du projet est `days: 30` — `new_lines` (34 349) dépasse `ncloc` (30 247), donc TOUT le dépôt est « du code neuf » et `new_coverage` plafonne à 31,4 % contre un seuil de 80. Les PR passent (Sonar y diffe contre la base) ; c'est le job sur `push: main` qui échouera à chaque merge. Se règle dans l'interface SonarCloud, pas dans le dépôt. | 🔴 | — *(réglage d'interface, à faire avant le prochain merge sur `main`)* |
| Q-6 | **`accessibilityState` est invisible du harnais de rendu mobile** : `react-native-web` ne mappe PAS cette prop React Native héritée sur un attribut ARIA, là où `aria-checked` moderne passe. Le rendu **natif** l'honore — ce n'est donc pas un défaut d'accessibilité de l'app —, mais aucun test ne peut l'affirmer : `TrackingList` s'éprouve sur le « ✓ » que l'athlète voit. Trois autres composants en portent un (`RegisterScreen`, `ProfileScreen`, `CmvCapabilitySwitch`). | 🟢 | — *(déclencheur : un test qui voudrait affirmer sur l'état ARIA d'un composant mobile — la sortie est de passer ces quatre composants aux props modernes)* |

> **Tranché en #130** (trois réglages qu'une bonne intention suffirait à défaire) — la porte e2e
> tient à des choix qui ressemblent, de loin, à des maladresses à corriger :
>
> - **`test:e2e` porte `cache: false` dans `turbo.json`.** Ce n'est pas un oubli d'optimisation.
>   Les vraies entrées de cette suite sont un Postgres et un MinIO **vivants**, plus l'état de la
>   base — rien de cela n'entre dans le hash de Turbo. Un cache hit rejouerait « 268 passed » sans
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

> **Tranché en #59** (le préréglage d'un framework ne se paie que si on le traverse) : le mobile
> reste sur **Vitest**, pas `jest-expo`. L'issue posait ce choix comme le vrai sujet, et deux
> raisons le ferment. `architecture-choice.md` §11 dit « Vitest » pour les trois couches — un
> second runner aurait exigé de contredire ce doc. Surtout, ce que `jest-expo` apporte est le RENDU
> d'un arbre React Native : son transformeur et ses mocks de modules natifs. Or les cibles testées
> n'importent aucun runtime natif — `tabs.ts` et `route.util.ts` ne prennent d'`expo-router` qu'un
> type, `useSegmentRunner` ne dépend que de React —, et `renderHook` monte via `react-dom`, déjà
> présent pour react-native-web. Le seul mock du harnais est `AsyncStorage`, posé en `setupFiles`
> pour qu'aucun test ne PUISSE atteindre un module natif. Corollaire à ne pas défaire : le jour où
> l'on voudra rendre un écran natif, c'est là que la question se rouvrira — pas avant.
>
> **Rouverte en #156, et refermée autrement.** Le raisonnement ci-dessus tenait entièrement ; ce
> qui lui manquait était une TROISIÈME voie, que ni cet encadré ni #188 n'envisageaient :
> `react-native-web`. Ce n'est pas un second runner mais un alias de résolution, donc §11 reste
> tenue et `jest-expo` reste fermé. Voir « Tranché en #156 » ci-dessous.

> **Tranché en #156** (rendre un écran natif sans changer de runner) : le mobile monte désormais
> de VRAIS composants React Native sous Vitest. Cinq choix que le code ne justifie pas seul.
>
> - **`react-native` est aliasé vers `react-native-web`**, et c'est ce qui débloque tout. Le
>   paquet natif n'est pas seulement lourd à charger : il est écrit avec des annotations **Flow**,
>   qu'esbuild — le transformeur de Vite — ne sait pas effacer. Il est donc hors de portée par
>   construction, et aucun réglage ne l'en rapprochera. `react-native-web` est déjà une dépendance
>   de production (Expo web) et rend le même arbre en DOM. L'alias est une LISTE de regex ancrées
>   et non un objet : un alias objet fait du remplacement de préfixe, et réécrirait
>   `react-native-keyboard-controller` en `react-native-webkeyboard-controller`.
> - **Le mur n'était pas celui que #188 décrivait.** L'issue annonçait `SafeAreaProvider`,
>   `KeyboardProvider`, le `ThemeProvider` de react-navigation et le `Stack` d'expo-router. Ils
>   sont bien nécessaires, et coûtent sept lignes de mock chacun. Le vrai point de passage, que
>   l'issue ne nommait pas, est **`expo-modules-core`** : tout module Expo en dérive, et il lit
>   `globalThis.expo`, la poignée JSI que seul le runtime natif pose. Le mocker fait tomber la
>   chaîne entière — c'est le seul mock structurel de `test/native.tsx`, les autres ne font que
>   rendre leur module utilisable.
> - **`fireEvent.click` est le SEUL geste qui presse un `Pressable`** sous react-native-web.
>   `mouseDown`/`mouseUp` et `pointerDown`/`pointerUp` ne déclenchent RIEN, silencieusement — un
>   test qui les emploie affirme sur un geste qui n'a jamais eu lieu. Vérifié à la mise au point,
>   et c'est pourquoi `test/render.tsx` expose `press()` plutôt que de laisser choisir.
> - **`tsconfig.test.json`, comme l'API en #130 — pour la bibliothèque DOM et rien d'autre.** Le
>   `lib: ["ES2023"]` du mobile n'est pas un oubli : c'est lui qui fait échouer un fichier de
>   production appelant `document` au lieu de le laisser planter sur l'appareil. Les tests, eux,
>   manipulent légitimement du DOM (jsdom + react-native-web). Deux passes, donc, plutôt qu'une
>   bibliothèque élargie pour tout le monde — et `include` y répète les déclarations ambiantes,
>   faute de quoi le `className` de NativeWind redevient une propriété inconnue.
> - **Ce que le harnais rend testable ne change pas ce qu'on affirme.** Les tests livrés portent
>   sur des décisions — un bouton fermé quand le quota est pris, un rang de lot tu quand il n'y a
>   pas de rang à dire, un `markRead` qui ne part pas sur ses propres messages, la préséance d'un
>   refus manuel sur une erreur d'upload. L'interdiction de #58 tient sans réserve : un `render()`
>   qui exécute du JSX sans rien affirmer reste du décor, harnais ou pas.
>
> - **Les scripts `lint` des paquets disent `biome check .`, jamais une liste de dossiers.** Les
>   trois apps listaient leurs répertoires de source et rataient donc leur propre harnais de test —
>   `apps/mobile/test/` n'était vu par aucun `pnpm lint` ; `@cmv/shared` et `@cmv/tokens` n'avaient
>   pas de script du tout. Une liste dérive dès qu'un fichier apparaît à la racine du paquet, et
>   elle dérive **en silence**. Le `.` s'entretient seul : Biome remonte au `biome.json` de la
>   racine, donc les exclusions (`.expo`, `metro.config.js`, `tailwind.config.js`…) continuent de
>   s'appliquer — les re-lister par paquet serait le geste à ne pas faire. Conséquence à ne pas
>   sur-lire : `turbo lint` reste insuffisant comme porte, mais pour une raison neuve — il couvre
>   maintenant les cinq paquets et ne voit toujours **pas la racine** (`biome.json`, `turbo.json`,
>   `scripts/check-i18n-keys.mjs`). `pnpm biome ci .` reste ce que lance la CI.
>
> Angle mort assumé : `cimode` PERD les paramètres d'interpolation (même prix qu'au web, #188), et
> `CmvButton` n'ayant pas de `accessibilityRole`, `pressButton()` doit prendre le premier des deux
> nœuds que `getAllByText` remonte. L'index disparaîtra le jour où le rôle sera posé.

> **Tranché en #58** (mesurer une couche à moitié, c'est la remettre hors de vue) : le périmètre de
> couverture du web est **tout `src/`**, et non sa seule couche `util/` + `hook/`. La restriction
> était tentante — 891 statements testables sur 3 047, une Quality Gate qui ne mord que là où l'on
> a décidé d'écrire des tests — mais elle aurait laissé les 12 258 lignes de `component/` et
> `screen/` durablement invisibles, c'est-à-dire reproduit le mécanisme qui a produit Q-1. La
> contrepartie est assumée et connue : sur le code NEUF, un écran ajouté sans test fait rougir la
> gate, et la façon la moins chère de la reverdir est un `render()` qui exécute le JSX sans rien
> affirmer. Cette couverture-là est du décor — si elle apparaît, c'est le test qu'il faut reprendre,
> pas le périmètre.

> **Tranché en #188** (un harnais de rendu décide plus qu'il n'en a l'air) : trois choix que le
> code ne justifie pas seul, et qu'une bonne intention suffirait à défaire.
>
> - **Les tests de composants affirment sur la CLÉ i18n, pas sur le français** — instance de test en
>   `lng: "cimode"` (`apps/web/test/i18n.ts`), même raisonnement que le `fakeT` de #58. Le prix est
>   réel et connu : `cimode` PERD les paramètres d'interpolation, donc un décompte affiché par
>   `t(key, { count })` n'est pas observable dans le texte rendu. Il s'affirme sur ce qui le
>   gouverne — un bouton fermé, un badge absent — jamais sur sa mise en forme.
> - **Deux helpers et non un.** L'issue décrivait un `renderScreen()` unique montant Query + Toast +
>   Router. Vérification faite, six des huit cibles n'importent RIEN de `@tanstack/react-router`, et
>   ce qui leur manquait vraiment était i18next, que l'issue ne nommait pas. D'où
>   `renderWithProviders` (i18n + cache + toasts) et `renderInRoute` par-dessus, pour les deux seuls
>   écrans routés.
> - **`renderInRoute` est ASYNCHRONE, et monte un vrai routeur.** Un vrai, parce que
>   `AthleteFeedbackScreen` appelle `getRouteApi("/sessions/$sessionId/feedback")` au niveau module :
>   mocker le module rendrait le test aveugle au jour où cet id change, c'est-à-dire au seul défaut
>   qu'il aurait pu attraper. Asynchrone, parce que `RouterProvider` résout ses matches en tâche de
>   fond — un montage synchrone laisse le DOM VIDE au premier tour, et le premier jet a produit un
>   test vert qui affirmait une absence sans avoir rien vu.

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
| N-5 | **Réglage limité au canal e-mail** : l'épic [#61](https://github.com/Cimavia/cimavia/issues/61) a livré l'opt-in par type et ses deux écrans, **pour l'e-mail seul**. Le push et le centre restent non réglables — on ne peut ni couper un type en push, ni se taire complètement. Un utilisateur qui coupe tout par e-mail continue donc de recevoir les push. | 🟡 | — *(déclencheur : un retour beta demandant à couper le push ; l'ouvrir demanderait un second axe dans le modèle, `channel` en plus de `type`)* |
| N-6 | **Aucun groupement des ajustements de cycle** : ajouter trois séances à un cycle diffusé produit trois notifications. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-7 | **Les receipts Expo ne sont pas relus** : un échec de livraison **tardif** n'est jamais remonté. | 🟢 | [#99](https://github.com/Cimavia/cimavia/issues/99) |
| N-8 | **L'e-mail hérite du throttle de la messagerie** (P5-4) : une rafale de messages produit UN e-mail, qui annonce « un message » là où il y en a cinq — et aucune relance si le fil reste non lu. | 🟢 | [#91](https://github.com/Cimavia/cimavia/issues/91) · [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-9 | **Aucun lien vers l'entité dans l'e-mail de notification** : seul le pied « gérer mes notifications » est cliquable. Ouvrir le cycle ou la conversation demande de retrouver l'application à la main. | 🟢 | — *(déclencheur : un retour beta disant que l'e-mail ne sert à rien sans lien — voir « Tranché en #65 »)* |

> **Tranché en #66** (les réglages sont une SECTION, pas un écran) : l'issue annonçait, côté
> mobile, de « donner enfin une destination à la ligne Notifications » de la maquette
> `athlete_profile.dc.html` — donc un écran à part, atteint par un lien. Quatre interrupteurs
> tiennent dans la page : ils sont posés **sur place**, dans le profil, comme au web dans l'écran
> Compte. Une navigation vers un écran qui n'aurait contenu qu'eux se serait payée à chaque
> consultation, et la maquette datait d'avant qu'on sache combien de lignes il y aurait.
>
> Deux conséquences que le code ne justifie pas seul. **La bascule enregistre immédiatement**, sans
> bouton — l'API attendant l'ENSEMBLE des types activés, chaque geste envoie un état complet et
> idempotent ; l'écart est assumé avec la section « casquettes » juste au-dessus, qui garde son
> bouton parce qu'elle édite un état cohérent à valider d'un bloc. Et le mobile emploie le
> **`Switch` de React Native** là où les capacités utilisent un `Pressable` habillé : c'est le seul
> contrôle dont l'état soit visible du harnais de rendu, `accessibilityState` étant ignoré par
> `react-native-web` (dette **Q-6**) — un interrupteur maison n'aurait pas été éprouvable.

> **Tranché en #65** (l'e-mail est un canal, pas un déclencheur) : l'envoi part de `emit()`, au
> MÊME point que la persistance et le push, et jamais d'un appelant métier. Cinq conséquences que
> le code ne justifie pas seul.
>
> - **L'opt-in est l'absence de ligne**, pas un booléen. « Jamais réglé » et « explicitement
>   coupé » commandent la même chose ; un troisième état inventerait une distinction que rien ne
>   lit, et aurait exigé une migration de données pour tout le parc. Couper un type SUPPRIME sa
>   ligne — la table ne contient que ce que quelqu'un a demandé. Côté Prisma, « je coupe tout »
>   est un `notIn: []`, que Postgres rend toujours vrai : **ne pas y ajouter de cas particulier**,
>   il serait mort donc jamais éprouvé.
> - **Quatre types seulement** (`EMAILABLE_NOTIFICATION_TYPES`), et c'est une LISTE, pas un
>   `Exclude<>` comme `PersistedNotificationType` : la frontière est un choix produit révisable,
>   pas une conséquence du modèle. Les trois ajustements de cycle en sont exclus tant que **N-6**
>   n'est pas traitée — trois séances ajoutées produiraient trois e-mails. Élargir la liste ne
>   compile plus tant que les gabarits manquent, dans les deux langues.
> - **Canal indépendant du push.** L'e-mail part que le push soit arrivé ou non. Le conditionner à
>   l'absence d'appareil aurait produit un comportement qui change tout seul le jour où
>   l'utilisateur installe l'app — et Expo ne confirme la livraison qu'en différé (**N-7**).
> - **La préférence est lue AVANT le destinataire.** En opt-in, le cas courant est « personne n'a
>   rien activé » : lire l'adresse d'abord coûterait deux requêtes à chaque notification du parc.
> - **Ni contenu de message, ni montant de facture** dans l'e-mail, et des tests le figent. Une
>   conversation est une donnée de santé au sens du CDC, et une somme apparaîtrait dans l'aperçu
>   d'un téléphone posé sur une table. Le gabarit n'a d'ailleurs pas de quoi le faire :
>   `Notification` ne persiste que `actorName` et `subjectLabel` (#48).
>
> **Écart assumé (N-9)** : aucun lien vers l'entité. L'API devrait pour cela porter la table de
> routage des clients, qui diffèrent (le builder est web-only, le planning de l'athlète est
> mobile) et qui changent sans elle. Le seul lien est celui des réglages, et il n'existe que si
> `WEB_URL` est configurée — absente, le pied disparaît et le message part quand même.

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
| ~~R-1~~ | ~~**Aucun push quand un rappel devient dû**~~ : sans scheduler, il n'apparaissait qu'au prochain chargement du centre. | ✅ | résolu en **#47** — tick externe horaire (`POST /internal/reminders/tick`), push idempotent via `pushedAt` |
| R-2 | **Pas de pagination** sur `GET /reminders` : deux segments bornés à 100 (à traiter / traités). | 🟢 | [#106](https://github.com/Cimavia/cimavia/issues/106) |
| ~~R-3~~ | ~~**Pas de report d'échéance ni d'édition**~~ : reprogrammer un rappel demandait de le traiter puis d'en créer un autre — deux gestes, et un historique de doublons. | ✅ | résolu en **#105** — `PATCH /reminders/:id` (échéance et/ou note) + bouton « Repousser » sur l'écran **et** dans le centre de notifications |
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

> **Tranché en #47** (le support d'exécution, et pourquoi ce n'était pas une question de code) : un
> cron in-process ne se déclenche **pas** sur du scale-to-zero — aucun process ne tourne pour tirer
> le tick. Il aurait marché sur le NAS et serait mort en silence en production, le pire des deux
> mondes puisque tout test manuel passait. Retenu : **déclencheur externe** (workflow `schedule`)
> appelant une route à secret partagé, contre un conteneur always-on, pour trois raisons — c'est
> gratuit là où `min-scale=1` sort du palier ; c'est **testable par la porte e2e** devenue requise en
> #130, alors qu'un tick interne ne se déclenche pas sous test ; et sa panne est **bruyante** (job
> rouge) là où le scale-to-zero avale le tick sans un mot.
>
> Deux contreparties écrites dans le workflow : GitHub désactive les `schedule` d'un dépôt public
> après **60 jours sans commit**, et ses crons ont plusieurs minutes de retard. La seconde est sans
> effet — les échéances sont dérivées de la donnée, pas de l'heure du tick. La première ferait
> cesser les rappels en silence sur un projet en pause ; le jour où ça mord, le même appel se
> déplace sur un cron Cloudflare, la route ne bouge pas.

> **Tranché en #47** (le scope tenant hors requête) : un tick n'a ni session ni acteur, là où
> l'extension Prisma refuse tout modèle sans scope. **On ne la contourne pas, on lui donne un
> acteur** : le balayage ouvre un contexte CLS par coach (`cls.run` + `set`, le même contrat que
> `TenancyInterceptor`), si bien que les lectures restent filtrées et que le `coachId` des rappels
> créés est **injecté**, jamais écrit par le service. Une seule lecture reste hors scope et elle est
> nommée — la liste des coachs, `User` n'étant pas dans `TENANT_SCOPES` — via le `PrismaService` de
> base, précédent de `UserDirectoryService`. Un e2e le fige sur le chemin qui n'a aucun acteur : ce
> que le tick génère pour un coach n'atterrit jamais chez un autre.

> **Tranché en #47** (persister ou calculer, la question laissée ouverte par #51) : **calculer**.
> Le tick pousse un rappel dû mais n'écrit **aucune ligne `notification`** — en écrire une le ferait
> apparaître deux fois dans le centre, une fois persistée et une fois calculée depuis la table
> `reminder`. `REMINDER_DUE` reste donc absent de l'enum Prisma, et `PersistedNotificationType`
> l'interdit à la compilation. Ce qui est persisté, c'est **`pushedAt`** : un marqueur de livraison,
> même famille que `readAt`, qui rend le tick idempotent (deux passages rapprochés ne poussent pas
> deux fois, un tick manqué rattrape au suivant). L'estampille est posée **après** l'envoi : un
> arrêt brutal entre les deux repousse au tick suivant, et un doublon vaut mieux qu'un silence.
>
> Corollaire assumé sur l'**idempotence de la génération** : elle vit dans l'index unique
> `(coachId, entityType, entityId, reason)` plus `skipDuplicates`, pas dans le code — une
> vérification préalable en JavaScript laisserait une fenêtre entre la lecture et l'écriture. Les
> rappels **manuels** y échappent sans qu'on l'écrive, PostgreSQL traitant deux `NULL` comme
> distincts. Et un rappel généré puis **traité n'est jamais régénéré**, même si la facture reste
> impayée : le coach a tranché, on ne le relance pas. Un e2e le fige, sans quoi l'index passerait un
> jour pour un oubli.

> **Tranché en #105** (ce que devient `readAt` au report) : il est remis à **`null` dès que `dueAt`
> bouge**, et seulement alors. `readAt` dit « vu à CETTE échéance-là » — une nouvelle échéance est
> une nouvelle occurrence. Le laisser en place produisait le scénario suivant : un rappel dû, vu
> dans le centre, repoussé à la semaine prochaine, en sort (il n'est plus dû) et y revient huit
> jours plus tard **déjà lu** — son badge ne s'allume jamais, le jour même où il devient utile.
> C'est la règle que `markAllDueRead` applique par l'autre bout en épargnant les rappels à venir.
> Trois corollaires : la comparaison porte sur les **valeurs** et non sur la présence du champ
> (réenregistrer un formulaire sans changer la date ne rallume pas un badge éteint) ; corriger la
> **note seule** ne touche pas `readAt` (rectifier une faute de frappe n'est pas une nouvelle
> occurrence) ; et le `PATCH` est **idempotent** comme `updateStatus`, l'historique étant trié par
> `updatedAt`.

> **Conséquence sur #51, assumée** : l'entrée du centre étant datée du `dueAt` du rappel, **reporter
> un rappel le déplace dans le tri du centre**. C'est exactement l'intention de #51 (« il se range au
> moment où il commence à compter »), et l'e2e qui fige cet invariant n'a pas eu à changer — il
> teste la règle, que le report préserve par construction. Le statut, lui, n'est **pas** modifiable
> par cette route (`.strict()` refuse `status`) : il garde la sienne, pour qu'il n'existe qu'un seul
> chemin vers une transition.

> **Appris en construisant #44/#51** (le coût réel d'un scope à un seul rôle) : un modèle absent de
> `TENANT_SCOPES` **pour un rôle** est refusé par une *erreur*, pas par un 403 ni par une liste vide.
> Lire la table `reminder` depuis le centre de notifications — écran servi aux **deux** rôles —
> aurait donc renvoyé un **500 à tout athlète**, sur une page qui ne parle même pas de rappels. Toute
> future entité mono-capacité devra porter les deux gardes : la capacité exigée sur le contrôleur
> (`@RequireCapability` depuis #10), et un branchement explicite partout où un chemin partagé la
> touche — `runAsCapability` qualifiant alors la lecture, pas la route (cf. #14).

> ~~**Écart de promotion assumé**~~ **RÉSOLU en #46** : `REMINDER_BADGE` et
> `REMINDER_TARGET_LABEL_KEY` vivaient dans `apps/web/src/feature/reminder/`, faute d'un second
> client (règle : 2+ apps → package). L'écran mobile est arrivé, elles ont rejoint
> `INVOICE_STATE_BADGE` dans `@cmv/shared`. Une **troisième** chose est montée au passage, qui n'y
> était pas prévue : `reminderBadgeState`, parce que les deux clients allaient écrire
> `isReminderDue(…) ? "OVERDUE" : status` chacun de son côté — c'est la dérivation, pas du rendu.

> **Tranché en #46** (où se pose un écran coach sur mobile) : **ni onglet, ni entrée du Profil** —
> un **sous-écran du tableau de bord** (`app/reminders/`), sur le patron de `/feedbacks` (#33) et
> `/athlete/[id]`. Les deux alternatives examinées quand l'issue a été reportée (2026-08-07) sont
> caduques pour des raisons révisées : l'onglet conditionné par le rôle ne préempte plus rien
> (`tabs.ts` sait le faire depuis #35), mais ferait un **6ᵉ onglet** pour un écran hebdomadaire ; le
> Profil enterrerait toujours un outil de travail dans les réglages de compte. Le dashboard, lui,
> réservait déjà la tuile.
>
> Deux écarts au web en découlent, tous deux issus de la même règle appliquée à une plateforme qui a
> moins d'écrans — pas d'un périmètre rogné : **(1)** la création est contextuelle, donc offerte sur
> la **facture seulement**, un rappel de cycle se posant depuis le builder (web-only) ; **(2)**
> l'échéance se choisit parmi les raccourcis de `snoozedDueAt`, faute d'équivalent mobile à
> `<input type="datetime-local">` — l'heure précise reste réglable depuis le web.

> **Tranché en #46** (le repli de `REMINDER_DUE`, et pourquoi le web n'en a pas) : un rappel dû est
> le **seul** type du centre dont la cible ait une seconde maison — l'écran « Mes rappels », où
> vivent les gestes. Sur mobile, `PLAN` rendant `null` côté coach, un rappel dû sur un cycle ne
> menait **nulle part** ; l'écran devient donc le repli **quand la destination est absente**, sans
> jamais remplacer celle qui existe (`INVOICE` continue de mener à `/invoices`). Côté **web**, aucune
> entrée n'est ajoutée et ce n'est pas un oubli : les deux cibles y résolvent déjà pour un coach, un
> repli y serait du code mort, et brancher le type ferait **perdre l'accès direct au builder** —
> une régression, pas un alignement.

---

## Post-MVP — Dashboard coach ([#110](https://github.com/Cimavia/cimavia/issues/110))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| D-1 | **Sept requêtes au chargement de `/`** (athlètes, planifs, débriefs, factures, conversations, résumé des rappels, non-lues) : la jointure du tableau est faite côté client, sans endpoint d'agrégat. Le **polling** de deux d'entre elles a été coupé sur cet écran (#113) — il ne reste que celui du badge, qui est sa raison d'être. Le tableau rend par ailleurs **toutes** ses lignes, `GET /athletes` n'étant pas borné : même déclencheur, même épic. | 🟢 | [#114](https://github.com/Cimavia/cimavia/issues/114) *(épic : [#139](https://github.com/Cimavia/cimavia/issues/139) agrégat · [#140](https://github.com/Cimavia/cimavia/issues/140) pagination)* |
| ~~D-2~~ | ~~**Pas de recherche, de tri ni de filtre** sur le tableau de suivi, là où la maquette en prévoit.~~ | ✅ | résolue en **#123** — recherche par nom, filtres *Cycle terminé* / *Sans plan*, ordre alphabétique. Le **tri par activité** est resté dehors (cf. encadré ci-dessous) |

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

> **Tranché en #123** (ce que la barre d'outils filtre, et ce qu'elle refuse de trier) :
> **(1)** le sélecteur **« Trier : activité récente » de la maquette n'est pas livré**, et pas par
> paresse : l'activité d'un athlète n'est mesurable par **aucune** donnée que cet écran charge. Les
> deux candidates ont été vérifiées — `ConversationDto.lastMessageAt` ne porte pas l'auteur du
> dernier message, donc un coach qui écrit dans le vide **remet à zéro** le compteur d'inactivité de
> l'athlète qu'il vient de relancer ; `CoachFeedbackSummaryDto.createdAt` est exact mais garde
> l'angle mort de #113, une séance faite **sans** débrief n'apparaissant nulle part. Trier là-dessus
> mettrait **en bas** de liste l'athlète qui s'entraîne sans débriefer — et un *ordre* faux ne se
> voit pas, là où une colonne manquante affiche au moins « — ». La donnée honnête (dernière séance
> `DONE`, dernier débrief, dernier message **de l'athlète**) se calcule côté serveur ; aucune issue
> ne la porte, c'est délibéré.
> **(2)** l'ordre est donc **alphabétique**, ce qui est le pendant d'une recherche par nom. L'ordre
> d'arrivée servi par l'API (`joinedAt desc`) n'était perceptible par personne.
> **(3)** **« À relancer » a été redéfini en « Cycle terminé »** : le libellé de la maquette n'avait
> aucune définition métier, celui-ci en a une, entièrement calculable — *son cycle est terminé et
> rien ne lui succède*. La seconde moitié est **garantie par `selectCurrentPlan`**, qui élit un cycle
> à venir avant un cycle terminé : un athlète déjà replanifié ne peut pas y tomber. Le libellé dit le
> fait, comme « Sans plan » à côté de lui ; c'est l'état vide qui porte l'action.
> **(4)** les deux filtres sont **disjoints par construction** (une ligne a un cycle courant ou n'en
> a pas) et ne recomptent aucune tuile — celles-ci comptent des *cycles*, pas des athlètes qui en
> manquent. C'est la contrainte de #52 appliquée au filtrage.
> **(5)** ils **disparaissent** quand `GET /plans` n'a pas répondu, et un `?filter=` hérité est
> ignoré : `AthleteRow.plan` vaut alors `null` pour tout le monde, et « Sans plan » annoncerait
> **tous** les athlètes. `null` n'est pas zéro, y compris dans un filtre.
> **(6)** l'état de la barre vit dans **l'URL** (`?q=`, `?filter=`), en `replace` : un filtre qui ne
> survit pas à F5 n'est pas le même produit, mais ce n'est pas une étape de navigation — le bouton
> Retour doit quitter l'écran, pas rembobiner la frappe.

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

## Post-MVP — Athlète facultatif sur un cycle ([#143](https://github.com/Cimavia/cimavia/issues/143))

> **Tranché en #144** (le verrou se DÉPLACE, il ne disparaît pas) : `athleteId` devient facultatif à
> la **création** et reste obligatoire à la **diffusion** — même dispositif que la facturation (P6).
> Un cycle se construit avant qu'on sache pour qui ; il ne se diffuse pas sans savoir à qui.
>
> Le contrôle de `publish` passe **avant** celui des semaines et avant la branche auto-coaching.
> L'ordre n'est pas cosmétique : un cycle sans athlète NI facturation échouerait sinon sur le
> message de facturation, qui ne dit pas ce qui manque vraiment — et le coach chercherait un
> montant là où il lui manque quelqu'un à qui parler. Les deux surfaces client suivent le même
> ordre (`publishBlockedKey`, `hintKeyFor`).

> **Tranché en #144** (six tables, pas cinq) : `athleteId` est dénormalisé sur toute la chaîne de
> planification, parce que l'extension tenant filtre par un champ du modèle **interrogé** et ne sait
> pas remonter la relation. L'issue en énumérait cinq ; il y en a **six** —
> `scheduled_session_exercise_tag` porte la colonne elle aussi, et l'oublier laissait composer un
> exercice sans tag dans un brouillon non affecté, puis casser en 500 dès qu'on lui en ajoutait un.
>
> L'invisibilité qui en découle est **structurelle et non applicative** : un `NULL` ne satisfait
> jamais `where: { athleteId }`. Aucune règle ne pense à exclure ces cycles — ils ne peuvent pas
> être trouvés. Un e2e le fige sur **deux** athlètes du même coach, sans quoi la propriété resterait
> un accident heureux.

> **Tranché en #144** (la propagation descend par IDENTIFIANTS, pas par filtre relationnel) :
> `plan_week` et `scheduled_session` se joignent par `planId` ; les trois tables suivantes n'en ont
> pas. Un `where: { scheduledSession: { plan: { … } } }` aurait tenu en une requête, mais son SQL
> n'est vérifiable qu'à l'exécution — sur un invariant de tenant, on prend le chemin qui se lit.
> Le tout dans **une** transaction : un cycle à moitié affecté est un cycle dont la moitié des
> séances reste invisible de son athlète, et c'est la pire panne possible ici, parce qu'elle est
> muette.

> **Tranché en #144** (la facture brouillon SUIT le destinataire) : `issueForPlan` ne réécrit que le
> statut de la facture, jamais son athlète. Sans propagation, « j'affecte à A, je chiffre, je
> réaffecte à B, je diffuse » émettait à **A** une facture pour un cycle que **B** s'entraîne. Ni
> #144 ni #145 ne voyaient ce bug — il naît de la nullabilité elle-même.
>
> **Détacher** un cycle déjà chiffré est en revanche refusé (409) : `Invoice.athleteId` est NOT
> NULL, et un montant qu'on n'adresse à personne n'a pas de sens. Le refus ne bloque rien — affecter
> quelqu'un d'autre reste ouvert, la facture suit. On n'a **pas** choisi de supprimer le brouillon,
> qui aurait fait perdre une saisie en silence ; et un « videz d'abord la facturation » aurait été
> une impasse, aucune route ne permettant d'effacer un brouillon de facture (`PUT` seulement).
>
> **Angle mort assumé** : réaffecter un brouillon chiffré **à soi-même** (compte à double capacité)
> laisse une facture brouillon inerte — `publish` n'émet pas en auto-coaching (#14), et la section
> est masquée. Elle ne part chez personne, elle dort. Déclencheur pour la traiter : la route de
> suppression d'un brouillon de facture, qui manque par ailleurs.

> **Précision sur l'invariant P6** : « un DRAFT existe ⇒ la facturation est remplie » gagne une
> seconde implication — « un DRAFT existe ⇒ le cycle a un destinataire », puisque la saisie est
> fermée sans athlète. Le verrou de `publish` sur `athleteId` n'en devient pas redondant pour
> autant : un cycle sans athlète **ni** facturation échouerait sinon sur le mauvais message. Et
> l'implication inverse reste fausse depuis #14 — un cycle **auto-coaché** se diffuse sans aucune
> facture.

> **Écart de maquette assumé** : `coach_builder_planification.dc.html` ne prévoit **aucun** sélecteur
> d'athlète — son en-tête ne porte que le titre du cycle et « Diffuser le plan », le destinataire
> n'y étant qu'un texte. Le sélecteur y a été ajouté. Sur un cycle diffusé il est **désactivé et
> expliqué**, jamais masqué — #145 disait les deux (« absent une fois diffusé » d'un côté, « trois
> désactivations, une seule grammaire » de l'autre) ; c'est la seconde qui l'emporte, parce qu'elle
> porte son raisonnement et qu'elle aligne le sélecteur sur « Coller ici » et sur « Supprimer ».
>
> **Révisé en [#207](https://github.com/Cimavia/cimavia/issues/207)** (l'emplacement, et lui seul) :
> le sélecteur était posé dans l'en-tête **fixe**, au motif qu'un cycle de douze semaines se
> parcourt longtemps et que l'affectation ne doit pas obliger à remonter. Il descend dans le
> formulaire d'en-tête, avec le titre, la description et le début. Un seul endroit pour tout ce qui
> définit le cycle l'emporte sur l'accès sans défilement : l'affectation se fait une fois par
> cycle, pas en cours de construction. La fermeture après diffusion, elle, ne bouge pas — elle
> s'étend même aux trois autres champs.

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
| ~~M-1~~ | ~~**Les e2e ne tournent dans aucune porte**~~ : la CI lançait `pnpm turbo test`, qui exécute le script `test` de chaque paquet — les 186 e2e ont le leur (`test:e2e`) et n'étaient donc jamais exécutés en PR. Découvert en #36 : deux e2e cassés pendant des jours derrière une CI verte. | ✅ | résolu en **#130** — job `E2E (isolation multi-tenant)` sur chaque PR, **requis** dans les rulesets `main` et `staging`/`production` |
| M-2 | **Pas de note vocale de débrief sur Firefox** : `FEEDBACK_AUDIO_MIME_TYPES` n'accepte pas `audio/webm`, seul format que Firefox sache produire. Le bouton disparaît, avec un message. Texte, photos et vidéos restent disponibles. | 🟢 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| M-3 | **Lecture iOS d'une note vocale web non vérifiée** : Chrome produit désormais du `audio/mp4` (le webm ne part plus), mais aucun iPhone réel n'a testé la lecture. Risque faible — mp4/AAC est le format natif d'iOS — mais non mesuré. | 🟡 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| M-4 | **Préparation média toujours dupliquée entre les deux features mobile** (`feedback` ↔ `message`). La moitié web a été résolue en #26 par une promotion **intra-app** ; la moitié mobile reste. | 🟢 | [#96](https://github.com/Cimavia/cimavia/issues/96) |
| M-5 | **Pas de presse-papier sur mobile** : l'invitation se transmet par `Share` (SMS, WhatsApp) et non par « Copier le code » comme la maquette. `expo-clipboard` n'est pas une dépendance du projet. | 🟢 | — *(déclencheur : un coach qui veut coller le code ailleurs)* |
> **Corrigé en #194, trouvé par accident** : `useUnreadNotificationCount` et `useUnreadByCapability`
> (#176) partageaient une clé de cache — voulu, c'est la même requête — mais avec **deux `queryFn`
> différents**, l'un projetant `.count`, l'autre rendant le DTO entier. TanStack indexe par CLÉ, pas
> par `queryFn` : le premier à répondre écrivait le cache et l'autre lisait sa forme. Quand la
> ventilation gagnait, le badge d'onglet recevait `{count, coach, athlete}` là où son type promet un
> nombre, et l'app plantait au démarrage. Invisible tant que le cache persisté du mobile était
> chaud — il ne l'est plus au premier lancement, ni après un changement de `buster`, ni chez un
> nouvel utilisateur. La projection se fait désormais par `select`, à la lecture, sur les deux apps.

| M-6 | **Le `buster` du cache persisté se bump à la main** (`CACHE_SCHEMA_VERSION`, `shared/lib/query.tsx`). Rien ne force à y penser : oublier de l'incrémenter après un ajout de champ au DTO fait planter l'écran chez l'utilisateur, pendant les sept jours de rétention du cache — et pas chez celui qui développe, dont le cache est neuf. À remplacer par la version du produit. | 🟡 | [#184](https://github.com/Cimavia/cimavia/issues/184) |

> **Tranché en #137** (un formateur ne rend jamais du vide) : les libellés et valeurs de métrique
> vivent désormais dans `@cmv/shared` (`metricLabel`, `metricUnitLabel`, `formatMetricValue`,
> `metricCellText`), en un seul exemplaire pour les deux surfaces. La règle qui en sort vaut
> au-delà de ce module : **une absence se DIT — `—`, jamais `""`.**
>
> Le mobile rendait la chaîne vide, le web un tiret. Une chaîne vide est un fallback silencieux au
> sens de la règle dure n°5 : elle confond « pas de valeur » et « rien à dire », et surtout elle
> **disparaît sans bruit d'un `join(" · ")`**, où elle laisse un séparateur orphelin. C'est
> précisément parce que le formateur rendait du vide que la divergence a pu s'installer sans que
> rien ne devienne rouge.
>
> Corollaire à ne pas défaire : les trois endroits qui veulent vraiment omettre une absence la
> **filtrent explicitement chez l'appelant**, là où on voit qu'ils le font — `unitValues` en amont
> des deux `TrackingList` (une case n'a pas la place d'aligner des tirets), la bannière de segment
> de `RunnerBody` (une ligne centrée, lue entre deux séries), et la carte repliée de
> `dosage-summary`. Partout ailleurs, la colonne vide se dit. Le seul changement visible du lot est
> la phrase de dosage du mobile, qui affiche maintenant « — » là où elle taisait la colonne — et
> faisait donc croire qu'elle n'existait pas.

> **Tranché en #137** (les hooks jumeaux divergent, et c'est voulu) : `useNotifications`,
> `useInvoices` et `useReminders` existent des deux côtés et **ne seront pas factorisés**.
> L'audit de l'issue les décrivait comme ayant « les mêmes exports et la même logique, ~55 lignes
> chacun ». Mesuré, c'est faux : `useInvoices` fait 125 lignes côté web contre 39 côté mobile et
> n'a que **2 exports communs sur 7** (la facturation d'un cycle, le justificatif PDF et son upload
> n'existent pas sur mobile) ; `useReminders` fait 115 contre 68 ; `useNotifications` diverge sur le
> fond — le web tient son badge par `refetchOnWindowFocus`, le mobile par le `focusManager` branché
> sur `AppState`. Le web passe partout par `useMutationToast`, que le mobile n'a pas.
>
> Ce qui restait vraiment commun — les routes, les DTO et les clés de cache — est **déjà** dans
> `@cmv/shared` depuis #45 et #48 (`create<X>Api`). Ce qui reste est la composition TanStack Query,
> qui ferait entrer `@tanstack/react-query` en dépendance du paquet partagé pour économiser une
> dizaine de lignes. Le déclencheur d'une reprise serait que les deux surfaces convergent
> fonctionnellement, pas qu'elles se ressemblent de loin.

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
> `tenantField`, alors hors du jalon en cours, dans une épic qui annonce « aucun changement
> backend ». La
> dépendance a été **supprimée** au profit d'un adaptateur : `capabilitiesOf(user)` dans
> `@cmv/shared` est le **seul** endroit du monorepo qui lise `role` pour en déduire un droit. Gardes,
> navigation et routage des notifications consomment son résultat. Le jour de #10, un corps de
> fonction change, dans un package testé. **Promesse tenue en #9** : la bascule vers `isCoach`/
> `isAthlete` n'a touché aucun écran, aucune garde, aucune table de nav — seulement le corps de
> `capabilitiesOf` et les deux déclarations `inferAdditionalFields` qui font remonter les champs.
> Le prix assumé : le cas **double capacité** est écrit mais
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
>
> **Nuance apportée en #46** : `PLAN` rend toujours `null` pour une notification de cycle, mais une
> entrée `REMINDER_DUE` qui vise un cycle mène désormais à « Mes rappels ». Ce n'est pas un
> revirement — la cible reste sans écran mobile, c'est le **rappel** qui en a un. Le repli
> s'applique donc au type, pas à la cible, et seulement là où la destination manque.

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

## Post-MVP — Envoi découpé des médias (branche `fix/increase-size-video`)

| # | Dette | Statut | Suivi |
|---|---|---|---|
| U-1 | **Aucune reprise d'un envoi interrompu** : toute erreur abandonne l'upload entier, l'utilisateur recommence de zéro. Une coupure à la part 38/40 jette 380 Mo déjà montés. | 🟡 | [#152](https://github.com/Cimavia/cimavia/issues/152) |
| U-2 | **`sendInParts` écrit quatre fois** (débrief ↔ messagerie × web ↔ mobile) : même corps, seuls l'API appelée et les clés i18n diffèrent. | 🟢 | [#96](https://github.com/Cimavia/cimavia/issues/96) |
| U-3 | **Pas de progression sur la messagerie mobile** : le fil n'expose que `mediaBusy` (désactivation), sans indicateur chiffré — contrairement au débrief mobile et aux deux surfaces web. | 🟢 | — *(déclencheur : un envoi de vidéo lourde jugé « figé » dans un fil)* |
| U-4 | **Le seuil de découpage est calé sur un plafond d'hébergeur, non vérifié automatiquement** : `MULTIPART_THRESHOLD_BYTES` (80 Mo) tient sa valeur des 100 Mo mesurés au bord Cloudflare. Aucun test ne le confronte à la réalité. | 🟢 | — *(déclencheur : changement de plan Cloudflare ou d'hébergement)* |

> **Mesuré** (les deux faits qui dictent toute la conception, et qu'aucune lecture du code ne
> donnerait) :
>
> **1. Le bord réseau refuse au-delà de 100 Mo.** Corps PUT de taille croissante poussés sur
> `s3-dev` à travers le tunnel : 40, 60, 95 et 100 Mo atteignent MinIO (403 *avec* `x-amz-request-id`),
> **101 Mo revient en 413 sans `x-amz-request-id`** — bloqué à l'edge, jamais arrivé. C'est la limite
> de corps de requête du plan Cloudflare gratuit. La constante `MAX_FEEDBACK_VIDEO_SIZE_BYTES`
> promettait alors 1 Go, soit **dix fois ce que l'infrastructure autorisait** : entre 100 Mo et 1 Go,
> le fichier mourait à l'edge et le mobile n'affichait qu'un « le serveur a refusé ce fichier ».
>
> **2. `File.slice()` n'est pas paresseux sur Android.** Mesuré sur appareil avec une vidéo de
> 398 Mo : `Call to function 'FileSystemFile.bytesSync' has been rejected. → java.lang.OutOfMemoryError:
> Failed to allocate a 418159312 byte allocation`. L'allocation vaut le **fichier entier**, pas la
> tranche — `slice()` matérialise tout puis découpe, contre un tas plafonné à 256 Mo. D'où la lecture
> par plage (`FileHandle.readBytes`) via un fichier de cache, et non le `Blob` que l'API suggère.
> `UploadOptions` d'`expo-file-system` n'offre par ailleurs **aucune** option de plage d'octets.

> **Tranché** (ce que le code ne justifie pas seul) :
>
> **Le client n'envoie aucun ETag.** S3 en produit un par part, que `CompleteMultipartUpload` doit
> citer — mais les lire côté navigateur exigerait que le storage expose l'en-tête `ETag` en CORS, ce
> que MinIO ne fait pas par défaut (vérifié : le préflight ne renvoie **aucun**
> `access-control-expose-headers`). L'API les relit donc elle-même par `ListParts`. Effet de bord
> heureux : web et mobile sont traités à l'identique, et c'est le **serveur** qui constate ce qui a
> réellement atterri au lieu de croire le client.
>
> **`partCount` est obligatoire à la clôture.** S3 recolle sans broncher ce qu'on lui donne : une
> part perdue produirait une vidéo tronquée que **rien ne distingue** d'une vidéo entière — ni le
> storage, ni le rattachement, ni la lecture par le coach. Le serveur compare donc l'annoncé au réel
> et refuse en 409. Sans cette garde, le mode de défaillance le plus probable était aussi le plus
> silencieux.
>
> **Deux modes plutôt qu'un seul chemin découpé.** Sous 80 Mo, le PUT unique est conservé : imposer
> le détour à une photo de 300 Ko ou à une note vocale n'achèterait rien contre des allers-retours
> supplémentaires. Le mode est décidé par l'API à partir de la seule taille — le client n'a pas voix
> au chapitre, le seuil étant une contrainte d'infrastructure et non une préférence.
>
> **Tout échec abandonne l'upload.** Les parts d'un upload jamais clos restent facturées **sans
> apparaître à l'inventaire du bucket** : personne ne les retrouverait pour les purger. On paie un
> envoi à refaire (U-1) plutôt qu'une fuite invisible.

> **Appris** (le symptôme ne désignait pas sa cause) : le rapport initial était « les vidéos de plus
> de 50 Mo ne passent pas, alors que j'ai augmenté la taille ». Les deux moitiés étaient trompeuses.
> La taille avait bien été relevée (50 Mo → 1 Go), mais `MAX_FEEDBACK_VIDEO_DURATION_SECONDS` était
> **resté à 60 s** — or une vidéo de plus de 50 Mo dure presque toujours plus d'une minute. Le refus
> venait donc de la **durée**, et son message parlait de secondes, ce qui masquait le lien avec la
> modification de taille. Derrière ce premier obstacle en attendait un second, sans rapport : le
> plafond de 100 Mo ci-dessus. Deux causes indépendantes derrière un seul symptôme — d'où la mesure
> systématique avant toute correction.

---

## Post-MVP — Lecture vidéo sur mobile ([#151](https://github.com/Cimavia/cimavia/issues/151))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| V-1 | **Pas de lecture vidéo EN LIGNE sur mobile** : le web lit dans la page (`<video controls>`), le mobile délègue au lecteur système. Lecture hors de l'app, aucun contrôle du rendu. Écart de parité assumé (épic [#20](https://github.com/Cimavia/cimavia/issues/20)). | 🟢 | — *(déclencheur : le coach beta juge la sortie de l'app gênante → voie `expo-video`)* |
| V-2 | **URL signée périmée non vérifiée hors du débrief** : les documents de séance et le justificatif de facture ouvrent l'URL du cache telle quelle. Le débrief la vérifie depuis #151 (`isSignedUrlUsable`), pas eux — l'utilisateur atterrit sur la réponse 403 du storage, en XML brut. | 🟡 | — *(déclencheur : un athlète qui signale un document « qui ne s'ouvre pas »)* |

> **Tranché** (le lecteur système plutôt qu'`expo-video`) : lire la vidéo **dans** l'app demande
> `expo-video`, donc un module natif, donc un nouveau **client de dev** en plus de l'APK preview —
> pour une vidéo plafonnée à 3 min. Ce qui départage les deux voies n'est PAS l'absence d'OTA
> (`expo-updates` n'est pas une dépendance : tout changement mobile impose déjà un rebuild pour
> atteindre le coach beta), c'est le blocage de l'itération locale, avec le piège
> `Cannot find native module` documenté en [#92](https://github.com/Cimavia/cimavia/issues/92).
> Le manque résiduel est **V-1**, et la voie B reste ouverte derrière son déclencheur.
>
> **Un composant partagé, pas une copie** : le rendu vidéo vit dans `CmvVideoLink`
> (`shared/component/`), servi par la messagerie **et** les deux surfaces du débrief. Copier la
> pastille de `MessageBubble` était le geste naturel — et exactement celui qui a coûté un refactor
> sous contrainte de gate en #153 (`new_duplicated_lines_density` ≤ 3 %, et `apps/mobile` **est**
> analysé par Sonar). Précédent suivi : `CmvAudioPlayer`/`CmvAudioRecorder`, promus en P5.
>
> **Découvert en route** (ce qu'aucune lecture du code ne donnait) : le `staleTime` de l'app vaut
> **exactement** le TTL des URLs signées — 5 min des deux côtés — et « périmé » ne veut pas dire
> « redemandé » : TanStack ne refetche que sur un déclencheur (montage, premier plan, retour
> réseau). Un coach immobile six minutes sur un débrief ouvrait donc une URL morte, et l'échec est
> **silencieux** : `Linking.openURL` réussit (le navigateur s'est bien lancé), c'est le storage qui
> répond 403 en XML. Le cache étant persisté sept jours, un démarrage à froid ressortait des URLs
> signées la semaine passée. D'où `SIGNED_URL_TTL_SECONDS` et `isSignedUrlUsable` promus dans
> `@cmv/shared` — la valeur est déjà un élément de contrat (`UploadUrlDto.expiresIn`) — et une
> re-signature **avant** ouverture, avec refus explicite quand elle échoue. Le TTL, lui, ne bouge
> pas : sa brièveté est ce qui rend le bucket privé sûr (P3-3). Le même trou subsiste ailleurs, en
> **V-2**.
>
> **Corrigé au passage** (trouvé en vérifiant sur appareil) : les photos de débrief ne
> s'agrandissaient PAS sur mobile — le visionneur plein écran existait, mais dans
> `feature/message/`, et ne servait que la messagerie. Promu en `CmvImageViewer`
> (`shared/component/`) et branché sur les deux surfaces du débrief. Le geste est le même que pour
> la vidéo, et pour la même raison : un composant que la messagerie possédait déjà valait mieux
> qu'un `<Image>` nu recopié.
>
> **Rectifié en #156** : cette entrée affirmait que « le web ouvre la photo en pleine taille depuis
> toujours ». C'était vrai du **panneau coach** seulement — la galerie de l'athlète
> (`FeedbackMediaGallery`) rendait un `<img>` nu, non cliquable, depuis sa création. L'écart entre
> les deux surfaces web n'avait jamais été relevé, et la formule « le web » l'a masqué en le
> traitant comme une plateforme homogène. Corrigé sur le même geste que le coach (un `<a>` vers
> l'URL signée), signalé par le coach beta.
>
> **Corrigé au passage** : la galerie athlète affichait « Vidéo · 0 s » sur un média sans durée
> déclarée (`durationSeconds ?? 0`) — la règle nullable prise à revers. `formatMediaDuration` rend
> désormais `null` sur une durée inconnue, et le rendu n'affiche rien. La messagerie et le débrief
> parlent en outre le même format (`m:ss`), au lieu de secondes brutes d'un côté.

---

## Post-MVP — Refonte du modèle d'exercice ([#157](https://github.com/Cimavia/cimavia/issues/157))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| R-1 | **`description` survit à côté d'`instructions`** : phase *expand* d'un expand/migrate/contract. Deux sources pour la même consigne tant que le constructeur n'écrit pas la version structurée — l'API alimente les deux, et rien n'empêche qu'elles divergent. La moitié `category` → `tags` est **close** (#163, migration `20260824120000_retrait_categorie_exercice`). | 🟡 | [#163](https://github.com/Cimavia/cimavia/issues/163) *(le contract est sa dernière étape)* |
| R-2 | **`customMetricId` n'est pas une clé étrangère** : les blocs vivent en JSON, la référence y est un simple identifiant. Supprimer une métrique maison laisse une colonne orpheline dans les exercices qui l'employaient. | 🟢 | — *(`validateBlockValues` la signale au coach ; le nettoyage en masse attend un besoin réel)* |

> **Tranché — les blocs en JSON, pas en tables.** Quatre tables (bloc / métrique / ligne / valeur)
> donnaient l'intégrité référentielle sur `customMetricId` et des cellules interrogeables en SQL.
> Aucune des deux ne sert : rien ne filtre sur une valeur de cellule, et la valeur est polymorphe
> (nombre · durée · texte · échelle), donc finit en colonne typée ou en JSON de toute façon. Ce qui
> départage, c'est le **snapshot de diffusion** (P3) : en JSON c'est la copie d'un champ, en
> relationnel c'est quatre SELECT/INSERT imbriqués avec remapping des identifiants de colonnes
> dans chaque ligne — soit exactement l'endroit où une planif diffusée se dégrade en silence. Le
> contrat est tenu par `exerciseBlocksSchema` à l'entrée. Coût accepté : **R-2**.
>
> **Tranché — aucun rattrapage des descriptions.** `description → instructions` touche tous les
> exercices existants. La base en contient 7, dont 4 avec description, d'une longueur moyenne de
> **10 caractères** (« a », « z »), plus 2 prescriptions (« 1kg », « 2kg ») : ce sont des données
> de test. Chaque `description` non nulle devient **un unique bloc paragraphe**, sans parsing ni
> rapport de reprise. Le `down` restitue le texte brut par concaténation
> (`richDocumentToPlainText`). À reconsidérer **uniquement** si la refonte est livrée après une
> mise en production réelle.
>
> **Écarts assumés avec la maquette du constructeur** (tranchés en recette, #163) :
>
> - **Les raccourcis « Pyramide » et « Intervalles » sont retirés.** Ils ne préremplissaient qu'un
>   bandeau de Séries, et le seul geste qu'ils promettaient vraiment — les paliers en miroir —
>   vit dans le menu de colonne, accessible depuis n'importe quelle Séries. Deux entrées de moins
>   à l'écran pour zéro perte.
> - **L'image de consigne a trois largeurs** (petite · moyenne · pleine), là où la frame 13 disait
>   « pleine largeur, jamais habillée de texte ». Trois paliers et non une valeur libre : un
>   pourcentage dépendrait de l'écran où l'image a été posée, et React Native devrait l'interpréter
>   au pixel près. **#166 doit rendre les trois**, sinon les deux surfaces divergent.
> - **« Dupliquer en variante » (frame 14) n'est pas implémenté.** Absent de la liste « À faire »
>   de l'issue, donc laissé de côté plutôt qu'ajouté d'autorité. ~10 lignes le jour où il est
>   demandé.
> - **`2:75` vaut `3'15` au lieu d'être refusé.** Les secondes au-delà de 59 débordent sur les
>   minutes. Le refus protégeait mieux de la faute de frappe, mais le rendu canonique montre
>   aussitôt ce qui a été compris — ce qui la rattrape sans bloquer la saisie.
> - **Les unités ne s'accordent pas** : « 1 répétitions ». Chaque libellé d'unité devrait passer en
>   clé plurielle dans les deux catalogues ; non fait, non demandé.
>
> **Trois pièges de CSS payés cash** (le même, trois fois) : sur un élément qui porte déjà `border`
> ou `bg-*`, un utilitaire Tailwind de la MÊME propriété a la même spécificité — c'est l'ordre du
> fichier CSS qui tranche, pas l'ordre où on écrit les classes. Un repère de dépôt en `border-t-2`,
> puis en `outline`, s'est fait écraser sans que rien ne le signale. La forme qui tient : le hook
> rend un ÉTAT (`isOver`), et chaque appelant choisit **un seul** fond. Même famille : `uppercase`
> posé sur une ligne d'en-tête remonte dans tout ce qu'elle contient, menu flottant compris.
>
> **Découvert en route** : `pnpm turbo lint` ne voit pas `packages/shared` — seuls `api`, `web` et
> `mobile` ont un script `lint`. Une fonction à complexité cognitive 22 (max 15, niveau `error`)
> est passée sous le radar jusqu'au `biome ci` complet. La porte réelle est
> `pnpm exec biome ci . && pnpm turbo typecheck test && pnpm check:i18n`.

> **Le replace-all d'une séance planifiée efface tout ce que le client n'émet pas.** Découvert en
> recette : le panneau du coach n'envoyait que `sourceExerciseId`, `title`, `description`, `tags`
> et `note` — chaque enregistrement d'une séance diffusée VIDAIT donc consigne, dosage, métriques
> maison et ajustements, sans le moindre signal. Le panneau date d'avant le modèle structuré et
> n'a été mis à jour ni en #162 ni en #164. Deux correctifs, l'un ne suffisant pas : le client
> renvoie l'intégralité du snapshot, et le serveur reporte par `id` ce qui ne transite JAMAIS par
> lui — le **suivi d'exécution**, qui appartient à l'athlète. Verrouillé par deux e2e vérifiés
> rouges avant correctif.

> **Tranché — le repos par ligne passe par une COLONNE, pas par un champ de modèle.** Un exercice
> à deux repos — « 1 min entre les tractions, 8 min entre les séries » — demandait un repos par
> ligne, là où `restBetweenSetsSeconds` vit sur la structure, une seule valeur pour tout le bloc.
> Retenu : la colonne de catalogue `REST_BETWEEN_SETS` / `REST_BETWEEN_ROUNDS` posée dans la
> grille, que `blockSegments` lit ligne à ligne et qui l'emporte alors sur le repos d'ensemble.
> Aucune migration, aucun champ nouveau, et le coach la pose comme n'importe quelle métrique.
> L'alternative — un champ `restSeconds` par ligne — était plus explicite mais coûtait une
> migration, un constructeur retouché et un second endroit où lire un repos.

> **Tranché — une séance À VENIR se coche et se débriefe.** #170 demandait « séance à venir :
> aucune case, le suivi s'ouvre le jour venu ». Livré, puis retiré : l'athlète qui avance sa séance
> du lendemain se retrouvait à ne pouvoir ni cocher ni débriefer ce qu'il venait de faire. La date
> planifiée est une INTENTION du coach, pas une porte. La cohérence se fait dans l'autre sens :
> tout est ouvert, tout le temps.

> **Tranché — une séance débriefée reste cochable.** #170 demandait de FIGER les cases une fois la
> séance débriefée (« cases visibles mais figées »). Livré tel quel, puis retiré : la prémisse est
> fausse. Un débrief se complète et se corrige en plusieurs fois — le bouton dit « Voir / **modifier**
> mon débrief », le `PUT` est idempotent, et le crayon du récapitulatif rouvre le décompte. Figer
> les cases de la séance pendant que l'écran de débrief les rouvre ne décrivait aucun état réel :
> l'athlète qui avait débriefé ne pouvait plus corriger son décompte là où il l'avait saisi. Rien
> dans le modèle ne rend une séance définitive aujourd'hui ; le jour où quelque chose la clôturera
> (cycle archivé, facture émise), la règle se réintroduira sur CE fait-là, pas sur `status = DONE`.

---

## Post-MVP — Sélection multiple de médias ([#156](https://github.com/Cimavia/cimavia/issues/156))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| W-1 | **Pas de reprise d'un fichier écarté** : le récapitulatif nomme ce qui n'est pas passé et pourquoi, mais ne propose pas de le renvoyer — il faut rouvrir la galerie et refaire la sélection. Il s'efface au lot suivant. | 🟢 | — *(déclencheur : un athlète qui signale refaire toute sa sélection pour un seul fichier)* |

> **Tranché** (le lot ne s'annule jamais en bloc) : ni quand la sélection dépasse les places
> restantes, ni quand un fichier échoue en route. Six photos pour cinq places envoient les cinq
> premières ; un fichier trop lourd en troisième position n'emporte pas les deux qui le suivent. Ce
> qui reste dehors est **récapitulé fichier par fichier**, avec sa raison — un « 2 sur 5 n'ont pas
> pu partir » ne dirait pas lesquels, ce qui laisserait la sélection entière à refaire. Ce qui est
> effectivement parti ne figure PAS au récapitulatif : c'est déjà dans la galerie ou dans le fil.
>
> **Tranché** (un seul bouton sur mobile) : « Ajouter une photo » et « Ajouter une vidéo »
> deviennent « Ajouter des photos ou des vidéos », avec une sélection mixte. Deux boutons ouvrant
> chacun un multi-select obligeraient à deux allers-retours pour un lot mixte — le cas courant
> après une séance. La ligne « Encore N photo(s), N vidéo(s)… » porte désormais seule la
> distinction entre les deux quotas.
>
> **Tranché** (l'envoi reste immédiat) : on choisit, ça part — contrairement aux pièces jointes
> d'exercice, qui s'empilent jusqu'au save. Un brouillon de médias aurait ajouté un concept à un
> écran qui en porte déjà trois (décompte, texte, médias), pour un gain nul : un débrief se
> complète de toute façon en plusieurs fois.
>
> **Tranché** (le séquentiel n'est pas de la prudence) : le serveur compte les médias déjà attachés
> à **chaque** rattachement et refuse en 409. Un lot envoyé en parallèle passerait entièrement le
> contrôle client, puis se ferait refuser au milieu sans qu'on sache quels fichiers sont passés. La
> file rend l'ordre, et donc le récapitulatif, prévisible. Aucun changement d'API n'a été
> nécessaire.
>
> **Tranché** (`MAX_MESSAGE_MEDIA_BATCH = 10`) : la messagerie n'a **aucun** quota — chaque média y
> est un message — donc rien ne borne naturellement une sélection, et quarante vidéos partiraient à
> la suite. Ce plafond est une borne d'usage côté client, pas une règle métier : le serveur n'en
> sait rien et n'a pas à en savoir. La valeur est **arbitraire**, posée faute de retour d'usage, et
> se change en une ligne. Corollaire : les « places restantes » d'un fil valent ce plafond pour les
> trois familles, si bien qu'un refus y est toujours un lot trop grand, jamais un quota atteint.
>
> **Tranché** (les clés i18n restent dans les apps) : `sendMediaBatch` reçoit les libellés de ses
> refus au lieu de les nommer. Les remonter dans `@cmv/shared` les rendrait invisibles à
> `check:i18n`, qui lit les sources de chaque app — les catalogues entiers seraient passés pour
> morts sous `--strict`, et la garde serait devenue passante. C'est aussi le seul choix correct sur
> le fond : mobile et web ne nomment pas toujours pareil (`photoTooBig` contre `imageTooBig`).
>
> **Ce qui a été factorisé, et pourquoi ça ne pouvait pas rester copié** : le tri, la file et
> l'assemblage du récapitulatif étaient d'abord écrits **deux fois** (débrief web et mobile), et le
> discriminant d'une raison de refus **quatre fois** — dont une expression inline dans le JSX, qu'un
> `grep` sur le nom de la fonction ne montrait pas. Quatre surfaces qui appliquent « on n'annule
> jamais tout » chacune de leur côté auraient divergé au premier correctif appliqué d'un seul côté.
> Tout vit désormais dans `sendMediaBatch` / `mediaRecapText` (`@cmv/shared`, mesurés en
> couverture) ; chaque app ne garde que sa lecture du type (`attachableMediaKind` sur un mime côté
> web, `assetMediaKind` sur `asset.type` côté mobile — les unifier obligerait à convertir l'un vers
> l'autre, la frontière que [#96](https://github.com/Cimavia/cimavia/issues/96) refuse de franchir).
>
> **La classification par FAMILLE, pas par liste blanche** : `mediaKindOfMime` répond à « sur quel
> quota ce fichier compte-t-il, et par quelle préparation passe-t-il », pas à « est-il accepté ».
> Un `image/heic` occupe donc bien une place de photo, quitte à être refusé au format ensuite.
> Classer avec la liste blanche aurait produit un fichier qui n'occupe aucune place mais se prépare
> comme un type qu'il n'est pas — et `prepareWebMedia` a été rebranché dessus pour que les deux
> lectures ne puissent plus diverger.
>
> **Reste dupliqué, et c'est [#96](https://github.com/Cimavia/cimavia/issues/96)** : les quatre
> `failureReason`/`rejectedReason` ont la même forme mais pas le même contenu — chacune nomme les
> clés de sa feature, et côté mobile chacune teste un `MediaRejectedError` **différent**, les deux
> features en définissant chacune un (dette **M-4**). Les unifier demande de traiter #96 d'abord.
>
> **Tranché en beta** (plafonds relevés à **20 photos / 10 vidéos / 20 notes vocales**, depuis
> 5/3/15) : la sélection multiple a rendu visible ce que l'ajout un par un cachait — le picker
> mobile annonce `photosLeft + videosLeft`, soit « 8 éléments maximum » sur un débrief vide, et
> c'est en le lisant qu'on a vu que le **compte** gênait, pas la taille. Un athlète débriefe une
> séance avec dix photos de ses voies. Ce qui garde le stockage prévisible reste la taille PAR
> FICHIER, inchangée (1 Go vidéo, 100 Mo photo/audio) ; la durée non plus n'a pas bougé.
>
> **Deux tests écrivaient ces plafonds en dur** et seraient devenus rouges sans qu'aucune règle
> n'ait changé : les deux e2e de quota (« plafonne à 3 vidéos », « quota (5) ») et l'assertion de
> places restantes du test d'écran web. Tous trois dérivent désormais des constantes, comme le
> faisait déjà le test des notes vocales. C'est le même mode de panne que les six chaînes i18n qui
> citaient les plafonds en dur (P4).
>
> **Corrigé au passage** : le commentaire d'`assertQuotaLeft` annonçait « 3 vidéos, 5 photos,
> **3 notes vocales** (CDC §6) » alors que `MAX_FEEDBACK_AUDIOS` valait **15** depuis P5. Une doc
> fausse dans le fichier même qui applique le quota — remise à jour avec les nouvelles valeurs.

---
## Post-MVP — Capacités coach/athlète ([#7](https://github.com/Cimavia/cimavia/issues/7))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| C-1 | **`role` et les capacités coexistent sans contrainte qui les lie.** `User` porte `isCoach`/`isAthlete` (le droit) **et** `role` (le persona d'affichage). Les deux chemins d'écriture les tiennent alignés — le `databaseHook` à la création, `CapabilityService` à la modification — mais rien en base ne l'impose. C'est le comportement **voulu**, pas un bug : un persona n'est pas un droit, et le second peut légitimement survivre au premier. | 🟢 | — *(déclencheur : quelqu'un qui prendrait la divergence pour une incohérence et « réparerait » en resynchronisant)* |
| ~~C-2~~ | ~~**L'autorisation API tourne encore sur le rôle exclusif**~~ : `@Roles` et `tenantField` lisaient `actor.role`. | ✅ | résolue en **#10** — `@RequireCapability` maison, `TenantContext` sans `role` |
| ~~C-3~~ | ~~**Les clients n'envoient pas `?as=`**~~ : les routes servant les deux capacités répondaient 400 à un compte cumulant. | ✅ | résolue en **#12** (le paramètre) et **#129** (le choix explicite) |

> **Appris en #10** (l'ordre des gardes globales n'est pas celui qu'on croit) : deux `APP_GUARD`
> s'exécutent dans l'ordre où leurs **providers** sont enregistrés, et ceux du module **racine**
> passent AVANT ceux des modules importés. `CapabilitiesGuard` déclarée dans `AppModule` tournait
> donc avant l'AuthGuard de `@thallesp/nestjs-better-auth` — c'est-à-dire avant que `request.user`
> existe. Rien ne l'a dit tant qu'aucune route ne déclarait de capacité ; les 230 e2e sont tombés
> **en bloc** à la première déclaration. D'où `CapabilityModule`, importé après `BetterAuthModule`,
> dont c'est toute la raison d'être. Ce qui a rendu la panne lisible plutôt que silencieuse : la
> garde **lève** quand l'utilisateur manque alors qu'une capacité est exigée. Un `return false`
> aurait donné des 403 diffus ; un `return true`, une garde inerte que personne n'aurait remarquée.
> Corollaire : toute garde globale ajoutée se pose dans un module, jamais dans `AppModule`.

> **Appris en #10** (la panne de #44/#51, une seconde fois) : le centre de notifications lit les
> `Reminder`, seul modèle métier sans scope athlète. Sa route ne déclarait aucune capacité — le
> scope se dérivait du rôle de l'acteur, ce qui la masquait. Dès que `tenantField` a cessé de lire
> `actor.role`, l'écran entier est passé en **500**. C'est mot pour mot ce que l'encadré plus haut
> annonçait : « toute future entité mono-rôle devra porter les deux gardes ». La règle vaut aussi
> à l'envers — **tout chemin partagé qui touche une entité mono-capacité doit déclarer laquelle**,
> même quand le reste de ce qu'il lit n'en a pas besoin.

> **Tranché en #10** (la route porte la capacité qu'elle exerce) : `@RequireCapability("coach")`
> remplace `@Roles([Role.COACH])` et sert **deux** mécanismes — la garde en fait une exigence,
> l'interceptor en fait le champ de scope. Une déclaration, deux lecteurs, via un helper partagé :
> exigence et scope ne peuvent pas diverger. Ce qui l'a rendu nécessaire, ce sont les trois routes
> servant les deux capacités (`/invoices`, `/conversations`, messages), dont le `@Roles([COACH,
> ATHLETE])` n'exigeait **rien de réel** — tout compte authentifié le satisfaisait. Ce n'était pas
> une exigence, c'était un scope déguisé.
>
> Le cas double s'y résout en trois temps, et le troisième est le seul qui compte : `?as=coach`
> honoré si le compte porte la capacité (403 sinon), capacité unique du compte si elle l'est —
> ce n'est pas un défaut, c'est la seule réponse possible, et c'est ce qui fait qu'aucun client
> n'a eu à changer — et **400** quand le compte cumule sans préciser. Répondre « les émises » par
> convention aurait laissé croire qu'on voit tout : le fallback exact qu'interdit la règle n°5.
>
> Conséquence tenue : le scope tenant reste **une colonne unique**, jamais un `OR` sur les deux. La
> règle dure n°1 ne change pas de forme. Une liste fusionnée l'aurait exigé, en contredisant au
> passage les sections nommées de #129.

> **Tranché en #10** (`role` disparaît du `TenantContext`) : une fois les cinq branchements
> convertis, plus rien ne le lisait côté API. Le retirer transforme la règle en contrainte — un
> service qui voudrait dériver un droit du persona ne compile plus. Même geste que `CapabilitySource`
> côté client en #9 : la règle exécutable vaut mieux que la règle déclarée.

> **Corrigé dans #10** (une route sans titre n'a pas à en réclamer un) : `/me/notifications` avait
> reçu `@RequireCapability("either")` pour une raison purement technique — `tenantField` refusait la
> table `Reminder` sans capacité exercée. C'était un effet de bord pris pour une décision : un
> centre de notifications montre ce qui est **adressé** au compte, sans notion de titre, et
> l'exiger aurait obligé un compte à double capacité à choisir à quel titre il consulte ses
> notifications — pour n'en voir que la moitié. La route ne déclare donc plus rien ; c'est
> `runAsCapability` qui précise le titre **au plus près** de la lecture des rappels. Le repère pour
> la suite : quand une route touche une ressource mono-capacité sans être elle-même d'un seul
> titre, c'est la LECTURE qu'on qualifie, jamais la route. Deux e2e figent le contraste — 400 sur
> les factures, 200 sur les notifications, pour le même compte.

> **Tranché en #129** (un basculeur d'espace, et non des sections) : l'épique #7 prescrivait
> « pas de switch exclusif », et une première version a donc livré une nav SECTIONNÉE — douze
> entrées, deux contextes empilés. Une maquette a fait changer d'avis : le basculeur en montre
> sept et un seul. Ce qui rend le mode exclusif acceptable, c'est la **pastille sur l'espace
> inactif** — l'objection était « on rate ce qui se passe de l'autre côté », elle y répond. Le
> décompte ventilé qu'elle suppose n'existe pas (une notification n'a aucune capacité
> destinataire) : il part en [#176](https://github.com/Cimavia/cimavia/issues/176), et l'intervalle
> est le risque assumé. L'énoncé de #7 a été corrigé le même jour — une épique qui prescrit
> l'inverse de ce qui est livré est pire qu'une épique muette.
>
> **L'espace courant se DÉDUIT de l'URL** côté web, sans état applicatif : le chemin dit déjà à
> quel univers on est (`/library` est coach), et `?as=` tranche pour les deux routes servies aux
> deux — ce qui règle au passage leur double surlignage. Un état séparé aurait pu diverger de la
> page affichée, et montrer le menu coach au-dessus d'un écran d'athlète. Mobile ne peut pas s'en
> remettre à l'URL : il garde un **contexte**, et le sélecteur se pose à droite du titre de l'écran
> — sous lui, il aurait l'air d'un filtre de la liste.
>
> **Ce que l'issue annonçait de travers** : « dix onglets ne tiennent pas dans une barre ». La
> table `TABS` en compte **sept**, dont quatre servis aux deux capacités — le manque n'était pas le
> nombre mais l'absence de bascule. La densité des sept onglets reste un sujet de design ouvert.
>
> **Deux classes de tokens inexistantes** ont été introduites puis corrigées : `text-cmv-text-low`
> (le token est `lo`) et `text-cmv-accent-on` sur un fond `accent` plein (c'est `text-cmv-text-hi`,
> `accent-on` servant sur `accent-soft`). Tailwind ne génère simplement pas une classe inconnue :
> ni `tsc`, ni `biome`, ni le build ne le voient, et le texte sort sans couleur. Un `grep` sur un
> token voisin est le seul contrôle qui existe aujourd'hui.
>
> **Le piège trouvé en chemin** : les écrans partagés branchaient leur titre, leurs listes vides et
> leurs boutons sur `useCapabilities().isCoach` — la capacité **possédée**. Un compte cumulant
> lisant ses factures « en tant qu'athlète » y aurait vu l'en-tête du coach et le bouton « marquer
> payée ». D'où `useActingCapability()`, qui rend le titre EXERCÉ et vaut pour la présentation ;
> `capabilitiesOf` reste pour les gardes. La règle : dès qu'un écran sert les deux capacités, ce
> qu'il MONTRE suit le titre, pas ce que le compte possède.

> **Appris en #14** (deux classes Tailwind concurrentes ne se départagent pas par la chaîne) : le
> fond d'alerte des tuiles du tableau de bord avait disparu côté web. `CmvCard` posait
> `bg-cmv-surface`, `DashboardTile` ajoutait `bg-cmv-error-soft` via `className`, et `cn` ne résout
> pas les conflits — choix assumé, écrit dans `cn.util.ts`. Les deux classes se retrouvaient donc
> sur l'élément, et c'est l'ordre de **génération dans la feuille CSS** qui tranchait, pas celui de
> la chaîne : hors de notre contrôle, et invisible de toute porte. D'où `surfaceClassName`, une
> prop qui REMPLACE le fond par défaut au lieu de s'y ajouter — le survol par défaut la respecte
> aussi, sinon il écrasait la couleur au passage de la souris. Règle générale : tant que `cn` reste
> sans `tailwind-merge`, une surcharge de couleur passe par une prop dédiée, jamais par
> `className`. Mobile n'était pas touché — NativeWind ne compose pas les classes de la même façon.

> **Tranché en #14** (« (moi) » se déduit de la SESSION, pas d'un drapeau porté par chaque DTO) :
> le compte apparaît dans ses propres listes d'athlètes, où son nom ne se distingue de rien. Un
> premier essai avait ajouté `isSelf` à `AthleteRow` — il n'aurait couvert que le tableau de suivi.
> Les onze surfaces concernées (sélecteur et titre du builder, cartes de cycles, tableau, liste et
> détail des débriefs, fiche athlète, dashboard mobile…) n'ont en commun qu'un `athleteId` :
> propager un marqueur aurait demandé de toucher quatre schémas, et d'y penser au cinquième. D'où
> `useAthleteLabel`, qui compare à l'id de session. `isSelf` reste sur `CoachAthleteDto` seul, où
> il décrit une propriété de la DONNÉE — cette relation-là n'existe pas en base.
>
> Deux exclusions volontaires : les **initiales** d'avatar, calculées sur le nom brut (« Dual Curl
> (moi) » donnerait « DC »… ou pire), et la **messagerie**, fermée en auto-coaching — aucun fil
> avec soi-même ne peut exister.

> **Tranché en #14** (l'auto-coach est une entrée SYNTHÉTIQUE de sa propre liste) : un coach qui
> se coache n'a pas de ligne `CoachAthlete`, et ne peut pas en avoir — le CHECK
> `coach_athlete_not_self` l'interdit depuis #11. `GET /athletes` fabrique donc son entrée, marquée
> `isSelf`, en tête. Le prix est une ligne sans réalité en base ; le bénéfice est que **le builder
> web et le tableau de bord ne changent pas**, eux qui lisent déjà cette route. L'alternative
> — un `athleteId` absent valant « pour moi » — a été écartée : elle entre en collision frontale
> avec #144 (`athleteId` nullable = cycle **sans athlète affecté**), qui donne à cette absence un
> sens opposé.
>
> **#17 absorbée** : elle et #14 traitaient le même verrou par les deux bouts. `publish` exige une
> facturation saisie (gating P6) et notifie l'athlète deux fois — en solo, le coach devrait se
> facturer lui-même pour diffuser son propre cycle, et recevrait deux notifications de lui-même.
> Impossible donc de livrer #14 « en gardant la state machine `DRAFT → PUBLISHED` », ce qu'elle
> demandait, sans lever ces trois choses. Ce qui NE change pas : la state machine elle-même, qui
> donne au cycle ses `ScheduledSession` lisibles et débriefables — un cycle solo se vit comme les
> autres.
>
> **Ce que l'issue annonçait de travers** : elle demandait de modifier `ExerciseController` et
> `SessionController`. `Exercise` et `Session` sont scopés sur `coachId` **seul** — un compte
> `isCoach` compose déjà sa bibliothèque, et depuis toujours. Le verrou tenait en une méthode,
> `PlanService.assertAthleteOwned`. La messagerie, elle, était **déjà** fermée en solo
> (`resolvePair` exige une relation des deux côtés) : un e2e fige ce comportement plutôt que de le
> supposer acquis.

> **Tranché en #11** (le premier `CHECK` du projet) : « on ne peut pas être son propre coach » est
> un invariant absolu, pas une règle de service susceptible d'avoir une exception — il vit donc
> dans la table (`coach_athlete_not_self`), conformément à `architecture-choice.md`. Le refus 409
> du service reste, pour le message ; le CHECK est ce qui SURVIT à un second chemin de création qui
> oublierait la garde. Mesuré plutôt que supposé : la garde retirée, l'écriture est bien refusée,
> mais en **500** au lieu de 409 — le filet tient, il ne parle simplement pas français. C'est le
> bon partage. Attention pour la suite : Prisma ne modélise pas les CHECK, ils ne figurent donc pas
> dans `schema.prisma` et ne se lisent QUE dans les migrations.

> **Appris en #11** (la chaîne de coachs est linéaire, et peut déjà boucler) : `athleteId` étant
> `@unique`, chaque compte a au plus un coach — la structure est une **forêt**, et « remonter la
> chaîne » un parcours sans branchement, bien plus simple que ce que l'issue laissait attendre.
> Mais une remontée naïve ne termine pas si la base contient DÉJÀ un cycle, et pend jusqu'au
> timeout. D'où l'ensemble de visités, qui sépare deux choses que rien ne distinguerait autrement :
> l'invité est dans la chaîne (**409**, refus métier) et on repasse sur un nœud tiers (**erreur** —
> données incohérentes, à voir tout de suite plutôt que déguisées en refus).

> **Tranché en #9** (les capacités sont des colonnes Prisma **ET** des `additionalFields`) :
> l'épique annonçait « colonnes Prisma directes, **hors** `additionalFields` Better Auth — qui ne
> gère que des scalaires ». La prémisse est juste, la conclusion non : `FieldType` vaut `"string" |
> "number" | "boolean" | "date" | "json" | …`, et un booléen *est* un scalaire. Surtout, la
> déclaration n'est pas un choix — Better Auth ne renvoie dans `session.user` que les champs
> **déclarés**. Des colonnes seules ne seraient jamais remontées jusqu'à `useSession()` :
> `capabilitiesOf` aurait rendu « aucune capacité » à tout le monde, donc sidebar web vide, onglets
> mobile vides et redirections d'atterrissage cassées — sans qu'aucune porte ne le voie, puisque ni
> `tsc`, ni `biome`, ni `vite build` ne lisent la forme d'une session. C'est le mode de panne déjà
> consigné plus haut (« Appris en #20 »), rencontré une seconde fois : **le câblage d'auth n'a pas
> plus de porte que le câblage de nav**. Corollaire : tout champ de session ajouté se déclare aux
> trois endroits — `auth.config.ts` et les deux `inferAdditionalFields` — dans le même commit.

> **Tranché en #9** (`role` survit, comme persona seul) : le supprimer aurait été plus propre sur le
> papier, mais il répond à une question que les capacités ne savent pas poser — sur quel univers
> atterrit un compte qui en cumule deux. Il reste donc, dépouillé : `CapabilitySource` ne le
> contient **pas**, ce qui rend la règle exécutable plutôt que déclarative — un écran qui voudrait
> en dériver un droit ne compile pas. Un test le fige (`ignore role, qui ne fonde plus aucun droit`).

> **Tranché en #9** (le sens de dérivation s'inverse en #12) : les capacités sont déclarées
> `input: false` et **dérivées** du `role` envoyé au signup, par le `databaseHook` qui validait déjà
> ce rôle. Sans ce hook, un compte créé après #9 naîtrait aux `@default(false)` du schéma — sans
> aucune capacité — là où la migration vient de servir correctement les comptes existants : deux
> chemins de création, deux résultats. #12 inverse le sens (les cases à cocher deviennent l'entrée,
> `role` la déduction) ; d'ici là, aucun compte ne peut cumuler, et c'est ce qui rend #9 sans effet
> observable.

---

## Post-MVP — Observabilité front ([#183](https://github.com/Cimavia/cimavia/issues/183))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~O-1~~ | ~~**Sentry ne couvre que l'API**~~, malgré trois documents qui annonçaient « les 3 couches ». Le web et le mobile n'avaient ni SDK ni Error Boundary : un crash de rendu donnait un écran blanc côté web, fermait l'app côté mobile, sans aucune trace. | ✅ | résolu en **[#181](https://github.com/Cimavia/cimavia/issues/181)** (web) et **[#182](https://github.com/Cimavia/cimavia/issues/182)** (mobile) — les trois documents redeviennent vrais par le code, pas par réécriture |
| O-2 | **`@sentry/cli` déclaré en dépendance du mobile sans être importé** : il n'y sert qu'à exister au chemin `apps/mobile/node_modules/@sentry/cli`, que `sentry.gradle` construit en dur pour téléverser les sourcemaps. Son repli pnpm est inatteignable — il vit dans un `catch` que `execute()` ne déclenche jamais, `node --print require.resolve(…)` rendant une sortie vide plutôt qu'une exception quand la résolution échoue. Sans cette déclaration, le build EAS **release** échoue sur « a problem occurred starting process ». La version est épinglée sur celle qu'exige `@sentry/react-native` (2.58.4) : la laisser flotter installerait deux copies du binaire. | 🟢 | — *(bug amont ; déclencheur : une version de `@sentry/react-native` dont le `sentry.gradle` résout enfin pnpm — la dépendance pourra alors sauter)* |

> **Tranché en #183** (trois projets Sentry, pas un) : `cimavia-api`, `cimavia-web`,
> `cimavia-mobile`. Releases et sourcemaps s'attachent **par projet** — mêler un bundle Vite et un
> bundle Hermes dans un seul projet rendrait l'unminification hasardeuse. Le quota du plan gratuit
> est de toute façon partagé par l'organisation : séparer ne coûte rien et sépare les alertes.

> **Tranché en #183** (`sendDefaultPii: false` côté front, plus `setUser({ id })`) : sans `setUser`,
> une erreur est anonyme et l'on ne distingue pas *un* utilisateur qui boucle deux cents fois de
> *deux cents* utilisateurs touchés — or c'est ce chiffre qui décide si l'on corrige le soir même.
> Avec l'`id` seul, Sentry ne détient qu'un pseudonyme ; c'est en base, chez nous, qu'il redevient
> une personne. L'**API reste en `sendDefaultPii: true`** et envoie IP et en-têtes : l'asymétrie est
> assumée plutôt que corrigée en passant, changer ce réglage modifierait ce qu'on capture sur une
> couche qui marche, sans qu'aucun incident ne le demande.

> **Tranché en #183** (pas de Session Replay, `tracesSampleRate: 0`) : le Replay filmerait l'écran
> d'un coach, donc des données d'athlètes, pour un gain que l'écran de repli et la stack couvrent
> déjà. Le quota de performance, lui, se vide bien plus vite depuis un navigateur ou un téléphone
> que depuis l'API, et aucune question de perf front n'est ouverte — à monter à `0.1` le jour où il
> y en a une.

> **Tranché en #182** (un crash au tout premier rendu n'a pas d'utilisateur) : `setUser` vit dans un
> effet, et React n'exécute pas les effets d'un rendu qui a levé — un crash au démarrage part donc
> anonyme, d'autant que la session Better Auth n'est pas encore résolue à cet instant. Ce n'est pas
> réparable : à ce moment-là, l'identité n'est connue de personne. Un « 0 utilisateur » sur un crash
> de démarrage ne veut donc PAS dire que `setUser` est cassé. Tout crash survenant après le montage,
> lui, porte bien son `id`.

> **Tranché en #183** (le DSN front n'est pas un secret) : il part dans le bundle web et dans le
> binaire mobile, n'importe qui peut le lire. Il se range donc en **variable de dépôt** (`vars.`),
> comme `DEV_PUBLIC_API_URL`. Le réflexe inverse donnerait l'illusion d'une protection qui n'existe
> pas, et ferait passer une fuite du DSN pour un incident. Le seul vrai secret du chantier est le
> `SENTRY_AUTH_TOKEN` d'upload des sourcemaps, qui n'est jamais embarqué.

---

## Post-MVP — Messagerie sans interlocuteur ([#198](https://github.com/Cimavia/cimavia/issues/198))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~MI-1~~ | ~~**Le coach n'apprend pas tout de suite qu'un athlète l'a rejoint**~~ : le `staleTime` par défaut (60 s web, 5 min mobile) retenait `GET /me/counterparts`, et il fallait recharger la page pour voir la messagerie apparaître. | ✅ | déclencheur survenu **le jour même** (retour de bêta) — `staleTime: 0` sur cette seule requête, refetch au montage et au retour sur l'app |
| MI-2 | **`landingTab` a une valeur par défaut pour les contreparties** : `LoginScreen`, `RegisterScreen` et `CmvCapabilityGate` l'appellent avant qu'une requête ait pu partir. Sans conséquence tant qu'aucun onglet conditionnel n'est en tête de table — `dashboard` et `planning` y sont, et ni l'un ni l'autre ne dépend d'un interlocuteur. | 🟢 | — *(déclencheur : un onglet conditionnel passe en tête ; le commentaire de `tabs.ts` le dit)* |

> **Tranché en #198** (« quelqu'un en face » est une question sur le SCOPE, pas une lecture scopée) :
> la nav doit savoir s'il y a un interlocuteur **avant** de savoir à quel titre elle s'affiche. Les
> deux routes qui portent déjà l'information — `GET /athletes` et `GET /me/coach` — sont gardées par
> capacité : les interroger donnerait un 403 à un compte mono-capacité sur chaque écran, exactement
> la dérive que `CmvRoleGate` existe pour éviter. D'où `GET /me/counterparts`, **sans capacité
> exigée**, et un `CounterpartService` sur le client Prisma de BASE, jumeau de `CapabilityService`.
> Ce n'est pas une capacité : `isCoach` dit ce qu'un compte a le droit de faire, `asCoach` s'il a
> quelqu'un à qui le faire — un coach sans athlète porte l'une sans l'autre.

> **Tranché en #198** (« pas encore su » ne vaut jamais « absent ») : `UNKNOWN_COUNTERPARTS`
> — `{ asCoach: true, asAthlete: true }` — est ce que rendent les deux clients tant que la réponse
> n'est pas là. Le pari est délibérément permissif : une entrée qui apparaît après coup se remarque
> à peine, une entrée absente le temps d'un aller-retour envoie ailleurs quiconque visait la
> messagerie. La constante vit dans `@cmv/shared` et non dans chaque client : deux copies
> divergeraient sans que rien ne devienne rouge — l'une se mettrait à cacher au démarrage ce que
> l'autre montre.

> **Tranché en #198** (web par ESPACE, mobile par COMPTE — et c'est voulu) : le web a une entrée de
> nav par espace, chacune conditionnée par son propre côté du signal ; le mobile n'a qu'UN onglet
> Messages, servi aux deux titres, avec le sélecteur d'espace **à l'intérieur** de l'écran. Le
> conditionner par titre exercé le ferait apparaître et disparaître au gré du sélecteur qu'il
> contient. Il reste donc dès qu'il y a quelqu'un d'un côté, et l'écran dessous montre « aucun
> coach » si on bascule. Corollaire assumé : sur mobile, `href: null` rend aussi la route
> **inatteignable**, là où le web laisse `/messages` joignable par son URL. La garde est l'API dans
> les deux cas ; sur mobile il n'y a pas d'URL à taper, et rien à voir au bout.

> **Tranché en #198** (se viser soi-même est un état IMPOSSIBLE, pas un athlète inconnu) :
> `resolvePair` rendait 400 « Athlète inconnu » à un coach qui ouvrait un fil avec lui-même — le
> filtre tenant ajoute `coachId = moi`, donc chercher `athleteId = moi` ne trouve rien et le refus
> retombait sur le cas générique. C'est faux : l'athlète est parfaitement connu, c'est soi, et le
> CHECK `coach_athlete_not_self` (#11) interdit la relation pour toujours. Un test explicite, posé
> **avant** la lecture de la relation, rend donc 409 — le même code que le refus d'auto-relation, et
> pour la même raison. Les deux autres refus gardent leur 400 : viser l'athlète d'un tiers, et
> l'athlète sans coach — une relation **absente**, pas impossible, qui apparaîtra le jour où il
> rejoint quelqu'un.

> **Corrigé en marge de #198** (`runAsCapability` et la paresse des `PrismaPromise`) : trouvé en
> testant #198, antérieur à lui — 105 événements Sentry sur deux jours avant la première ligne
> écrite. `GET /me/notifications/unread-count` rendait **500** à tout compte à double capacité ayant
> au moins un message non lu : `[tenancy] capacité (aucune déclarée) non autorisée sur Conversation`.
>
> La cause n'est pas dans le service mais dans `runAsCapability`, qui faisait `cls.run(() => fn())`
> **sans await**. Une `PrismaPromise` est PARESSEUSE : elle n'émet sa requête qu'au `.then`, pas à
> sa création. Un appelant rendant directement `this.db.conversation.findMany(...)` voyait donc la
> requête partir après la sortie du contexte CLS, sans capacité exercée — et l'extension tenant
> refusait la table, comme elle doit. Le piège est **silencieux** : l'autre forme d'appel du même
> fichier (`() => this.reminders.countDueUnread(now)`, une méthode `async`) marchait, parce que son
> corps s'exécute bien dans le contexte. Deux formes voisines, une seule correcte. Le `await` posé
> dans `runAsCapability` les rend équivalentes, plutôt que de compter sur la vigilance de chaque
> appelant.
>
> **Pourquoi les e2e ne l'ont pas vu** : `unreadMessagesByCapability` sort avant de toucher
> `Conversation` dès qu'il n'y a aucun message non lu — et le seul e2e de la ventilation (#176)
> n'en créait pas. Il fallait le croisement exact « double capacité **et** message non lu ». Un e2e
> couvre désormais ce chemin.

> **Corrigé en marge de #198** (le cache de requêtes survivait au changement de compte) : trouvé en
> testant #198, et sans rapport avec lui — mais c'est lui qui l'a rendu visible. Le cache TanStack
> du mobile est **persisté sept jours** dans AsyncStorage (lecture hors-ligne, p3-5) avec un
> `staleTime` de cinq minutes, et RIEN ne le vidait à la déconnexion : le compte suivant sur
> l'appareil se voyait servir les athlètes, débriefs, messages et factures du précédent, sans
> même qu'un refetch parte les corriger. Une fuite entre comptes, pas un affichage périmé — le
> raisonnement que `revokeCurrentPushToken` applique déjà aux push n'avait jamais été appliqué au
> cache. Jusqu'ici le symptôme restait dans le CONTENU des écrans, la nav dérivant de la session
> Better Auth seule ; #198 a branché la nav sur une requête, et l'onglet Messages du compte quitté
> est resté. `resetQueryCache()` vide mémoire **et** disque, appelée aux deux bouts : à la
> déconnexion pour ne pas laisser ces données dormir, et à la **connexion** — le seul passage
> obligé, puisqu'une session expirée côté serveur ramène au login sans qu'aucune déconnexion soit
> passée. Le web avait le même trou en mémoire, sans persistance : il mourait au rechargement
> complet, pas avant.

> **Tranché en #198** (le volet de débrief EXPLIQUE, là où la nav se contente de disparaître) :
> troisième surface trouvée en test, hors de ce que l'issue nommait. La boîte de réception du coach
> ouvre un fil pour chaque débrief lu — y compris celui qu'il a écrit lui-même en auto-coaching —,
> et affichait « Impossible d'ouvrir la conversation… Réessaie dans un instant ». Un incident
> passager annoncé pour un état **définitif** : le CHECK `coach_athlete_not_self` (#11) interdit ce
> fil pour toujours.
>
> Deux traitements DIFFÉRENTS pour le même invariant, et c'est délibéré. La nav retire l'entrée
> sans un mot : elle liste des destinations, une absence s'y lit toute seule. Le volet, lui, garde
> son titre « Réponses » et met une phrase à la place du composeur — une section qui disparaîtrait
> ferait chercher la barre d'envoi en passant d'un débrief à l'autre, et l'écran ne dirait rien de
> ce qui l'a fait partir.
>
> `useIsSelfAthlete` prolonge la règle de #14 : le « c'est moi » se déduit de la SESSION, pas d'un
> drapeau porté par chaque DTO. Séparé de `useAthleteLabel` volontairement — celui-ci est réservé au
> texte affiché, et brancher un rendu sur la présence de « (moi) » dans une chaîne traduite serait
> un test qui casse au premier reformulage du catalogue.

> **Corrige le journal de #14** (la messagerie n'était fermée qu'à MOITIÉ) : les deux encadrés
> « Tranché en #14 » affirment que la messagerie est « fermée en auto-coaching — aucun fil avec
> soi-même ne peut exister » et qu'elle l'était « **déjà** ». C'était vrai de l'API, et faux de
> l'écran : `GET /athletes` sert son entrée synthétique `isSelf` à la liste de fils, qui l'affichait
> en tête. Le compte se voyait comme son propre interlocuteur, et le toucher menait au refus. #198
> écarte l'entrée dans les deux listes de fils — **là et nulle part ailleurs** : elle reste sur
> `GET /athletes`, dont le tableau de bord et le constructeur de cycle dépendent.

---

## Post-MVP — Édition de l'en-tête d'un cycle ([#207](https://github.com/Cimavia/cimavia/issues/207))

> **Tranché en #207** (le verrou de diffusion s'étend, il ne se dédouble pas) : `title`,
> `description` et `startDate` rejoignent `athleteId` dans ce qu'un cycle **diffusé** ne laisse plus
> réécrire — même 409, message distinct. La grammaire est celle du destinataire, la raison ne l'est
> pas : là où l'athlète « en a déjà été prévenu », ici il s'entraîne dessus, et un cycle qui bouge
> sous ses pieds est pire qu'un cycle qu'on ne peut plus corriger.
>
> Le 409 n'a cassé aucun usage : **aucun client n'envoyait ces trois champs**. Le web n'appelait
> `PATCH /plans/:id` que pour `{ athleteId }`, et `/plans` n'est pas une surface mobile (#20). On a
> fermé une porte que personne n'ouvrait — juste avant d'ouvrir l'interface qui, elle, s'en sert.
>
> La CAPACITÉ de décalage (`shiftSessions`) reste entière : elle sert au brouillon. Décaler un cycle
> **diffusé** (athlète blessé, report d'une semaine) est un besoin réel, mais demande de prévenir
> l'athlète — hors périmètre ici, à ouvrir avec [#172](https://github.com/Cimavia/cimavia/issues/172).

> **Ce que l'avertissement de décalage promet, et ce qu'il ne promet pas** : déplacer le début
> rejoue les dates de **toutes les séances**, et l'interface le dit avant l'enregistrement — sinon
> un report d'un mois se lirait comme un simple champ de formulaire. Il ne parle que d'elles :
> l'échéance de la facture brouillon (`Invoice.dueDate`) est une saisie du coach et **ne suit pas**,
> décaler un cycle n'impliquant pas de décaler le paiement. La `period`, elle, reste juste sans
> qu'on s'en occupe : `periodOf(plan)` la recalcule à l'émission, dans la transaction de `publish`.

> **Écarts assumés** (le prix du constructeur direct) : « Nouvelle planification » crée la ligne en
> base et ouvre le constructeur, donc **des brouillons vides vont s'accumuler** — un clic vaut un
> cycle. Le recours existe déjà et reste ouvert tant qu'il est brouillon (« Supprimer le cycle »).
>
> Le **titre par défaut** écrit en base n'est pas le repli silencieux qu'interdit la règle dure n°5 :
> le champ est à l'écran, vide de sens et immédiatement modifiable — la valeur ne prétend pas être
> une donnée.
>
> Le raccourci **« créer N semaines d'un coup »** (`weekCount`) disparaît avec le panneau, et le
> formulaire d'en-tête ne le reprend pas : retirer une semaine détruit ses séances, ce n'est pas un
> champ qu'on décrémente. Un cycle de douze semaines se construit avec « Ajouter une semaine ». À
> rouvrir si le geste se révèle pénible à l'usage.

> **Écart de maquette rattrapé** : `coach_builder_planification.dc.html` réservait déjà une bande
> « plan meta » en tête de la colonne builder — semaines, séances, **début du cycle**, description.
> Le code les avait posées ailleurs : compteurs et date dans le sous-titre de l'`AppShell`,
> description en paragraphe. Le formulaire reprend l'emplacement de la maquette, et la date **quitte
> le sous-titre** plutôt que de s'y lire une seconde fois dans un autre format. `plan.card.meta` la
> garde pour la LISTE des cycles, qui n'offre aucun formulaire où la corriger.
>
> Reste non implémenté de cette bande : l'indicateur « Enregistré il y a 2 min » de la maquette, qui
> suppose un **auto-save**. Aucune surface du produit ne fonctionne ainsi (séances, facturation,
> exercices : bouton explicite) ; l'en-tête suit la règle commune. Écart antérieur à #207, inchangé.

---

## Post-MVP — Invitations qui attendent, refus et e-mail ([#146](https://github.com/Cimavia/cimavia/issues/146) · [#147](https://github.com/Cimavia/cimavia/issues/147))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| I-1 | **L'e-mail d'invitation part en français**, quelle que soit la langue du destinataire. Il n'y a pas de `User.locale` à lire pour une adresse SANS compte, et `mailStringsFor(null)` replie sur le français. Seule une invitation portant elle-même une langue fermerait l'écart. | 🟢 | — *(déclencheur : un coach qui invite un athlète anglophone — l'anglais est déjà écrit au catalogue, il manque seulement de quoi le choisir)* |
| I-2 | **Les deux mailers nomment une route WEB en clair** — `/account` (`NotificationMailer`) et `/register` (`InvitationMailer`). Aucun test ne peut les garder : l'API ne connaît pas le routeur du client. Renommer `account.tsx` ou `register.tsx` casse le lien **en silence**. Le nom du fichier est cité dans un commentaire à côté de chaque URL — c'est la seule parade, un `grep` le trouve. | 🟢 | — *(déclencheur : le jour où l'on renomme une route web ; rien à préparer avant)* |
| I-3 | **`InvitationStatus.REVOKED` reste une valeur sans chemin** : aucune route ne la pose, et `DELETE /invitations/:id` la refuse comme les autres états non refusés. Un coach ne peut donc pas annuler une invitation encore en attente — il attend son expiration (7 jours). | 🟢 | — *(déclencheur : un coach qui veut retirer une invitation émise par erreur)* |
| I-4 | **Rien ne rattrape un `.env` local en retard sur `.env.example`** (transverse, découvert ici). Les variables `SMTP_*` / `WEB_URL` ajoutées en [#61](https://github.com/Cimavia/cimavia/issues/61) manquaient un mois plus tard sur la machine de dev : l'e-mail d'invitation ne partait pas, et **rien ne le disait à l'écran** — seul un `WARN` dans les logs. Même famille que la migration non appliquée, qui a produit une notification muette le même jour. | 🟡 | — *(déclencheur : c'est arrivé deux fois en une session ; une vérification au démarrage — clés absentes, migrations en attente — reste à ouvrir)* |

> **Tranché en #146** (le canal dépend de l'adresse, et la réponse HTTP ne le trahit jamais) :
> émettre une invitation nominative prend l'une de trois voies, et ce qu'elles ont en commun est le
> cœur de la décision — **le coach reçoit son invitation et son code à l'identique dans les trois
> cas**. Sans cette symétrie, la route deviendrait un oracle d'existence de compte.
>
> - **Adresse absente** (invitation générique) : rien. Personne n'est visé ; son canal est le code
>   transmis de la main à la main.
> - **Adresse rattachée à un compte portant la capacité ATHLÈTE** : notification (centre + push).
>   Il a une application où lire, l'e-mail doublerait un message qu'il verra de toute façon.
> - **Tout le reste** — pas de compte, ou un compte sans capacité athlète : **e-mail**. C'est le cas
>   le plus courant, celui du nouvel athlète qu'on invite, et c'est exactement lui qui ne recevait
>   rien : le déclencheur écrit dans #146 n'était traité qu'à moitié tant que ce canal manquait.
>
> Les trois types `INVITATION_*` restent **hors de `EMAILABLE_NOTIFICATION_TYPES`** : ils ne visent
> que des comptes existants. L'e-mail d'invitation, lui, n'est pas soumis à l'opt-in de #65 — cet
> opt-in est un réglage de compte, et le destinataire n'en a pas.

> **Tranché en #146** (l'adresse se compare NORMALISÉE, et c'était un bug) : `Invitation.email` est
> tapé par le coach, `User.email` par l'athlète. La comparaison était brute, si bien qu'une adresse
> saisie `Lea@Exemple.fr` pour un compte `lea@exemple.fr` produisait une invitation **définitivement
> inutilisable** — refusée à l'acceptation, sans message qui dise pourquoi. Normalisée à l'écriture
> **et** à la comparaison : la première seule ne rattraperait pas les lignes déjà en base, la
> seconde seule laisserait la colonne porter deux formes du même destinataire.

> **Tranché en #146** (`DECLINED` est une valeur à part, et le seul état qui s'efface) : « le coach
> a annulé » (`REVOKED`) et « l'athlète a dit non » (`DECLINED`) ne se remplacent pas — les fondre
> ferait perdre au coach la seule information qui l'intéresse.
>
> `DELETE /invitations/:id` n'accepte donc que `DECLINED`, et le refus des trois autres états n'est
> pas une précaution : chacun perdrait quelque chose de différent. **`PENDING`** — la retirer serait
> une révocation, c'est-à-dire une autre transition ; la déguiser en suppression ferait disparaître
> un code encore utilisable sans le dire à qui l'a reçu (dette **I-3**). **`ACCEPTED`** — la ligne
> est la trace de la façon dont la relation s'est nouée (`acceptedByAthleteId`). **`REVOKED`** —
> aucune route ne la produit, l'autoriser écrirait un chemin que rien n'éprouve.
>
> Le refus exige une **correspondance d'adresse en toutes circonstances**, là où l'acceptation ne la
> vérifie que sur une invitation nominative : sans cela, le premier détenteur d'un code générique le
> brûlerait pour tout le monde.

> **Tranché en #147** (la carte s'affiche dans les DEUX branches — l'issue disait le contraire) :
> son corps rangeait la carte d'invitation dans la seule branche « aucun coach », où un athlète déjà
> lié n'arrive jamais ; #146, lui, exigeait qu'il la voie. Les deux ne pouvaient pas être vrais.
>
> C'est #146 qui l'emporte, et pour une raison qui n'est pas d'arbitrage mais d'usage : **refuser
> est le geste UTILE dans ce cas** — c'est lui qui vide la liste d'attente de l'inviteur. La masquer
> laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien. « Rejoindre » est
> alors désactivé **avec sa raison écrite au-dessus** : un bouton grisé sans explication laisse
> chercher ce qui cloche, alors que la cause est une règle du produit (au plus un coach).
>
> Le libellé ne dit pas « quitte d'abord cette relation » : **aucune route ne supprime une
> `CoachAthlete`**. Envoyer vers un geste inexistant serait pire que de ne rien proposer — c'est
> exactement ce que fait déjà, à tort, `account.capabilities.blocked.ACTIVE_COACH`.

> **Tranché en #147** (`INVITATION_DECLINED` SUPPRIME une destination, il n'en comble pas une) :
> c'est le seul branchement sur le TYPE des deux tables de routage, et l'exact inverse du repli de
> `REMINDER_DUE` (#46) — là-bas le type comble une destination absente, ici il en retire une qui
> existe. La raison n'est pas que l'écran manque : il est là, c'est le panneau d'invitations du
> coach. C'est l'**entité** qui est morte — l'invitation refusée a quitté `PENDING`, elle ne
> s'affiche plus, et l'y envoyer ferait chercher une ligne qui n'y est plus.
>
> Les deux autres se branchent par CAPACITÉ comme le reste de la table, sans une ligne sur le type :
> coach → `/` (web) et `/dashboard` (mobile), où le nouvel athlète apparaît ; athlète → `/my-coach`
> et `/join`, où l'invitation s'accepte. L'entrée `{ to: "/" }` du web porte son `search` — trois
> clés requises mais possiblement `undefined` (#123) —, sans quoi elle ne compile pas.

> **Tranché en #147** (le premier motif de confirmation du mobile est un composant, pas une alerte
> native) : `apps/mobile` n'avait AUCUN geste destructif confirmé, ni le moindre `Alert.alert`. Le
> refus d'invitation en demandait un, et l'alerte native aurait été le réflexe — elle est écartée
> pour deux raisons cumulées : elle ignore NativeWind (donc les tokens, règle dure n°3), et elle est
> invisible du harnais de rendu, qui monte l'arbre en `react-native-web` (dette **Q-6**). Un geste
> protégé par une alerte serait un geste **non éprouvé**. `CmvConfirmButton` est donc le jumeau de
> celui du web, armement en deux temps compris — la parité est le point : un même refus doit
> demander la même chose des deux côtés.

> **Écarts de maquette assumés** : `auth_onboarding.dc.html` § *MOBILE · ACCEPTATION D'INVITATION*
> décrit un **écran plein** — avatar, « Marc Keller t'invite », code **pré-rempli depuis ton lien
> d'invitation**, « Rejoindre Marc ». Trois écarts, tous volontaires. La carte se pose **au-dessus
> du formulaire** plutôt que de remplacer l'écran, parce qu'elle ne doit pas fermer le chemin des
> invitations génériques. Elle porte un **« Refuser »** que la maquette ne prévoit pas, sans quoi
> une invitation non désirée resterait en attente jusqu'à son expiration. Et le **lien profond qui
> pré-remplit le code n'existe pas** : l'e-mail d'invitation porte le code en clair et un lien vers
> l'inscription, ce qui suffit tant qu'aucun schéma d'URL n'est branché sur `cimavia://`.

---

## Post-MVP — Réordonner les séances d'une journée ([#93](https://github.com/Cimavia/cimavia/issues/93) · [#148](https://github.com/Cimavia/cimavia/issues/148))

> **Tranché en #93** (la dette était périmée, l'issue a changé d'objet) : le `SessionBuilder` a le
> glisser-déposer **depuis son commit de création** — #165 disait « absorbe #93, fermer en la
> référençant », et ne l'a pas fait. #93 a donc été **recyclée** plutôt que fermée : son numéro
> porte désormais les deux surfaces qui n'avaient réellement que des flèches, la **séance
> planifiée** (`CompositionEditor`) et les **séances d'une journée** (`PlanDayCell`). Fermer et
> rouvrir aurait perdu la trace de ce qui avait été livré — c'est précisément ce qui a manqué ici.

> **Tranché en #93** (pas de dnd-kit, et l'issue demandait le contraire) : le glisser tourne sur
> `useReorderDrag` + `CmvDragHandle`, faits maison et déjà éprouvés sur cinq surfaces. La
> dépendance que l'issue prescrivait n'a jamais été nécessaire, et le travail d'accessibilité
> qu'elle redoutait est déjà payé : la poignée **est** un bouton focusable qui répond aux flèches.

> **Tranché en #148** (la poignée SANS flèches dans la grille de semaine) : le constructeur de
> séance double le glisser de boutons ↑/↓ ; la case d'un jour, qui fait un septième de la largeur,
> ne le peut pas. L'issue les prescrivait pourtant. Deux boutons de plus par séance y seraient
> illisibles, et la poignée porte déjà le chemin clavier — l'esprit de la règle tient, sa lettre
> non. Le glisser reste **borné à la journée** : changer de jour, c'est écrire `scheduledDate`,
> une autre écriture et une autre issue.

> **Tranché en #148** (le sujet d'une notification peut être une DATE, et reste une donnée) :
> `PLAN_SESSIONS_REORDERED` ne nomme aucune séance — un ORDRE n'appartient à aucune d'elles. Son
> `subjectLabel` porte le **jour en ISO**, jamais mis en forme par l'API : la règle de #48 vaut ici
> comme ailleurs, une ligne écrite aujourd'hui resterait française le jour où `en.json` arrive.
> `notificationSubject` reçoit donc le `formatFullDay` de l'app appelante — et non une `locale`,
> qui rouvrirait le point d'injection que `createFormatters` (#137) a fermé.

> **Tranché en #148** (un trou de position était un bug, pas une dette) : `nextPosition` COMPTE les
> séances du jour, ce qui ne donne un rang libre que si les rangs sont contigus. Rien ne les
> recollait après une suppression ni après un changement de jour : deux séances le lundi, on
> supprime la première, on en ajoute une — **500** sur `@@unique([planWeekId, scheduledDate,
> position])`, pour un geste que rien ne reliait au précédent. Corrigé dans la même PR
> (`compactDay`), avec les deux e2e qui le prouvent. L'issue #148 ne l'avait pas vu : elle
> n'annonçait la contrainte que pour la permutation.

> **Tranché en #148** (le décalage de renumérotation se DÉDUIT, il n'est pas une constante) :
> l'issue prescrivait `position + 1000`. Une journée qui porte déjà des trous — le cas d'avant ce
> correctif — peut occuper un rang supérieur à son propre effectif, et une constante finit par
> retomber dessus. Les deux passes garent donc au-dessus du **maximum observé**, libre par
> construction. Sans elles, l'échange de deux séances casse : `duplicate key value violates unique
> constraint "scheduled_session_planWeekId_scheduledDate_position_key"`, vérifié.

---

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
