# CONTEXT — cimavia (global)

Glossaire métier partagé sur tout le monorepo (api + mobile + web). **Utiliser ces termes tels quels** (noms d'entités en anglais, tels qu'ils apparaissent dans le code) ; ne pas inventer de synonymes.

Pour l'état par phase et les décisions historiques, voir les éventuels `CONTEXT_phase_*.md`.

---

## Intention du projet

cimavia outille la relation **coach ↔ athlète** en escalade. Boucle principale :

1. Le **coach** compose des **exercices** et des **séances** réutilisables.
2. Il les assemble en une **planification** (cycle de plusieurs semaines) qu'il **diffuse** à un **athlète**.
3. L'athlète **consulte** ses séances (y compris hors-ligne en salle) et les **débriefe** (texte libre + photos/vidéos).
4. Coach et athlète **échangent** en messagerie asynchrone ; le coach **facture** ses prestations.

Tout le reste (auth, capacités, notifications) sert cette boucle.

---

## Acteurs & relation

### User
Identité authentifiée (gérée par Better Auth). Porte deux **capacités cumulables** — `isCoach` et `isAthlete` — dont **au moins une** est requise. Les deux utilisent **web et mobile** (on coache surtout depuis le web pour la création, on s'entraîne surtout depuis le mobile au quotidien).

`role` (`COACH` | `ATHLETE` | `ADMIN`) survit sur le modèle, mais **ne fonde plus aucun droit** : c'est le **persona d'affichage**, l'univers dans lequel un compte à double capacité atterrit. Toute autorisation se décide sur les capacités.

### Coach
Un `User` qui porte `isCoach`. Possède N athlètes, sa bibliothèque d'exercices/séances, ses planifications, ses conversations et ses factures.

### Athlete
Un `User` qui porte `isAthlete`, rattaché à **au plus un** coach (unicité en base — voir « Multi-tenant »). Consulte ses planifications, débriefe ses séances, échange avec son coach.

### Auto-coaching
Un `User` qui porte **les deux** capacités peut s'écrire ses propres cycles : `coachId = athleteId`, **sans** ligne `CoachAthlete` — l'auto-relation est d'ailleurs interdite en base (`coach_athlete_not_self`). Il apparaît dans sa propre liste d'athlètes sous une entrée **synthétique** (`isSelf`), ce qui lui permet de se désigner comme destinataire.

Ce qui ne s'applique pas à un cycle solo : la **facturation** (on ne se facture pas soi-même — 409 à la saisie, gating levé à la diffusion) et les **notifications** (on ne s'annonce pas ce qu'on vient de faire). La messagerie reste fermée : un fil suppose deux personnes. La state machine `DRAFT → PUBLISHED`, elle, ne change pas — un cycle solo se vit comme les autres.

### Espace (coach / athlète)
Ce que la navigation montre à un instant donné. Un compte à double capacité en voit **un seul à la fois**, et bascule ; l'espace inactif porte une **pastille** quand quelque chose l'y attend. Sur le web, l'espace se déduit de l'URL (le chemin, ou `?as=` sur les deux routes servies aux deux capacités) ; sur mobile, d'un sélecteur en tête des écrans partagés.

### CoachAthlete (relation)
Le lien coach→athlète, établi par **invitation** (lien/code). Statut `PENDING` → `ACTIVE`. C'est la frontière de tenant : presque toute donnée est scopée par cette relation.

### AthleteProfile (fiche athlète)
Champ **texte libre** décrivant l'athlète, **éditable par le coach uniquement**. Pas de structure imposée en MVP.

---

## Entraînement

### Exercise
Brique de la bibliothèque du coach : `title`, `description` (nullable), `instructions` (consigne structurée, nullable), `blocks` (structure de dosage ordonnée) et des **tags** libres — l'enum `ExerciseCategory` a été retirée en #163, trois cases fermées ne décrivant pas un catalogue réel. Peut porter des **documents** joints. Scopé au coach (`coachId`). Réutilisable dans plusieurs `Session`.

### Document
Pièce jointe d'un `Exercise`. Deux types (`DocumentType`) :
- **`FILE`** — fichier en **object storage** (bucket privé) : PDF / PNG / JPEG / WEBP, **20 Mo max**. Jamais le binaire en BDD ; upload direct client → storage par **URL PUT signée**, lecture par **URL GET signée** courte.
- **`LINK`** — URL externe (ex. vidéo). Aucun fichier stocké.

### Session (séance) — modèle vs instance
- **Modèle** (`Session`) : séance réutilisable = liste **ordonnée** de `SessionExercise` (`position`, `note` nullable, plus son **dosage surchargé** — cf. §  ci-dessous) + `notes` (consignes globales, nullable). Vit dans la bibliothèque du coach. La composition se met à jour en **replace-all** (`PUT`) : l'ordre du tableau **définit** les positions.
- **Instance** (`ScheduledSession`) : **copie éditable** d'un modèle, posée dans une planification (P3). La modifier ne touche **pas** la bibliothèque. C'est le seam qui permet d'ajuster une séance pour un athlète sans casser les modèles.

> ⚠️ **Nommage** : Better Auth possède déjà une table de sessions d'authentification. Son modèle Prisma a été renommé **`AuthSession`** (table `session` conservée via `@@map`, remap par `session.modelName`) pour laisser le nom **`Session`** à l'entité métier séance (table `sessions`). Ne pas confondre les deux dans le code.

### Plan (planification)
Cycle d'entraînement créé par le coach pour un athlète. **Nombre de semaines libre**. `startDate` est **toujours un lundi** (contrainte du schéma partagé) et c'est une **date civile** (`YYYY-MM-DD`, sans heure ni fuseau). Statut `DRAFT` → `PUBLISHED` : la diffusion est **irréversible** en MVP (le cycle s'ajuste en place, cf. CDC §5.7) et refusée si le cycle n'a aucune semaine. Elle **notifie l'athlète** par push (`NotificationService` → `expo-server-sdk`, P4). Ajuster un cycle déjà diffusé le notifie aussi : il a peut-être la version d'avant en cache hors-ligne.

### PlanWeek (semaine)
Une semaine d'un `Plan`. Porte un **type** (`TRAINING` | `DELOAD`), un `weekNumber` 1-based et une note libre. Contient un **nombre libre** de séances planifiées.

⚠️ **Aucune date n'est stockée sur la semaine** : ses bornes se calculent (`planWeekRange` = `plan.startDate + 7×(weekNumber−1)` → dimanche). Une seule source, donc aucune dérive possible. Corollaire : déplacer le `startDate` d'un plan, ou supprimer une semaine du milieu, **décale les séances** des semaines concernées (l'API s'en charge) — sinon une séance sortirait de la plage de sa semaine.

### Copier une semaine (#4)
Le coach reproduit ce qu'il a **composé** dans une autre semaine — du même cycle ou d'un autre, donc éventuellement pour **un autre athlète**. Emporté : type et note de semaine, séances, consignes, exercices, documents copiés. **Laissé** : tout ce qui appartient à l'athlète ou à l'exécution — `ScheduledSessionStatus` (la copie naît `PLANNED`), `SessionFeedback` et ses médias, les messages rattachés.

Trois règles à connaître :
- **Les dates ne sont pas recopiées, elles sont RECALCULÉES** depuis le lundi de la semaine cible (`planWeekCopyShiftDays`, `@cmv/shared`). Le décalage se prend entre les deux **lundis** et non entre les `weekNumber` — `(M−N)×7` ne vaut qu'intra-cycle, alors que la copie traverse aussi deux cycles aux `startDate` différents. Toujours un multiple de 7 : une séance du mardi reste le mardi, et l'unicité `(planWeekId, scheduledDate, position)` tient après translation.
- **La cible est REMPLACÉE, jamais fusionnée** : deux semaines portant chacune une séance le mardi en position 0 collisionnent sur cette même unicité, et renuméroter réordonnerait la journée du coach sans règle pour arbitrer. La copie ne **crée** par ailleurs jamais la semaine cible (les `weekNumber` sont contigus).
- **La cible doit être un brouillon** : coller dans un cycle `PUBLISHED` est refusé (409), parce que chaque séance écrite notifierait l'athlète séparément et que rien ne groupe ces notifications (dette N-6). Copier **depuis** un cycle diffusé, en revanche, est autorisé — lire ne mute rien.

### ScheduledSession
Instance de séance dans une `PlanWeek` (voir « Session — instance »). Porte une `scheduledDate` (dans la plage de sa semaine — invariant vérifié à l'écriture) et une `position` = rang **dans la journée** (plusieurs séances le même jour). Statut `PLANNED` | `DONE` | `SKIPPED` — en P3 tout est créé `PLANNED` ; `DONE` arrive avec le débrief (P4). Se met à jour en **replace-all** (`PUT`), comme la séance modèle. **Pas d'historique des modifications** en MVP.

### Dosage à trois niveaux (#164)

    EXERCICE (bibliothèque)   le défaut, valable partout
    SÉANCE                    ajusté pour cette séance-type
    SÉANCE PLANIFIÉE          ajusté pour UN athlète, une semaine

Chaque niveau stocke trois choses : `blocks` (ce que tout le monde lit), `baseline` (la copie faite
à l'ajout, ou reçue à la diffusion) et `adjustments` — la liste des **chemins** de valeurs touchées
avec leur **niveau** (`SESSION` · `SCHEDULED`). Le marqueur hérité/ajusté est donc porté par la
**donnée**, jamais déduit d'une comparaison à l'affichage : un coach qui retape à la main la même
valeur que le défaut a bien ajusté cette cellule.

**Verrouillé au niveau séance** : type de structure, jeu et ordre des colonnes, nombre de blocs et
libellés. **Modifiable** : valeurs de cellules, paramètres de bandeau, nombre de lignes. Le verrou
est vérifié **côté serveur** (`lockedShapeIssues`), pas seulement grisé dans l'UI.

Deux gestes à ne pas confondre : **« Tout réinitialiser »** revient aux valeurs copiées à l'ajout
et ne touche pas la référence ; **« Recharger depuis la bibliothèque »** relit l'exercice tel qu'il
est aujourd'hui, **déplace la référence** et efface les ajustements. Le second est le seul qui vit
côté serveur (`POST /sessions/:id/exercises/:id/reload`) — partout ailleurs le client n'envoie que
des valeurs, jamais la référence contre laquelle le verrou est vérifié.

**Ni détection de changement, ni empreinte de version** : une séance composée est indépendante,
et le coach qui veut la nouveauté la recharge explicitement.

### ScheduledSessionExercise — la copie, pas la référence
**Décision structurante (P3).** L'instance est un **instantané autonome** : `title`, `description`, `instructions`, `blocks`, `note` et les **tags** sont **copiés** — le dosage vient de la **séance**, pas de la bibliothèque, et ses documents sont **dupliqués en lignes** (`ScheduledSessionExerciseDocument`) partageant la **même clé objet S3** (aucun binaire dupliqué).

Les liens `sourceExerciseId` / `sourceSessionId` sont **nullables (`onDelete: SetNull`)** et ne servent qu'à la traçabilité : **l'affichage n'en dépend jamais**. Conséquences voulues :
- le coach peut supprimer un exercice de sa bibliothèque **sans jamais bloquer** (pas de `Restrict`, pas de 409 à vie) ni dégrader une planif déjà diffusée ;
- l'athlète voit les documents alors qu'il n'a **aucun scope** sur la bibliothèque du coach — c'est la copie qui le lui permet ;
- la contrepartie : un objet S3 n'est purgé que s'il n'est plus référencé par une copie (`DocumentCleanupService`).

La bibliothèque, elle, garde son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## Suivi & échanges

### SessionFeedback (débrief)
Retour de l'athlète sur une `ScheduledSession` : **un champ texte libre** (« retour sur la séance ») + médias. **Un seul débrief par séance** (`scheduledSessionId` unique). **Pas d'indicateur ni de score** en MVP ; le débrief par exercice est différé (post-MVP).

Écrit par l'**athlète**, lu par le **coach** : les deux tables portent donc `coachId` ET `athleteId` en direct. ⚠️ Comme pour la planification, le scope tenant ne dit rien du **statut** : une séance n'est débriefable que si son cycle est `PUBLISHED` — garde portée par `AthletePlanService.getPublishedSessionOrThrow`, seul point d'entrée (P3).

Trois règles à connaître :
- **Le texte est nullable** : un débrief peut n'être que des photos, et l'athlète le complète **en plusieurs fois** (texte puis médias, ou l'inverse). D'où un `PUT` idempotent, et aucune contrainte « texte OU média » — elle interdirait le débrief média-seul, qui commence forcément par un débrief vide. Un débrief vide est un état légitime : « séance faite, rien à signaler ».
- **Débriefer passe la séance en `DONE`**, sous quelque forme que ce soit (texte, ou premier média rattaché). Transition **sans retour** : un débrief complété ne redevient pas `PLANNED`.
- **`coachReadAt`** alimente la tuile « Débriefs à relire ». Il repasse à `null` quand l'athlète complète son débrief — sinon un ajout tardif resterait invisible pour un coach qui l'a déjà ouvert. Seule la **création** notifie le coach (un push par ajout serait du harcèlement).

### Media
Photo / vidéo / **note vocale** rattachée à un `SessionFeedback`. L'**audio** (débrief vocal, CDC §4) a rejoint `MediaType` en P5, avec l'enregistreur/lecteur construits pour la messagerie (promus en `shared/component/` côté mobile) — même flux d'upload que photo/vidéo. Stocké en object storage (URL GET signée), compressé côté client. Limites : vidéo **60 s / 720p / 1 Go**, **3 vidéos + 5 photos (100 Mo) + 15 notes vocales** (m4a, ≤ 5 min / 100 Mo) par débrief. Ces valeurs ont été relevées après les plafonds MVP d'origine (50 Mo / 10 Mo / 3 notes) ; elles vivent dans `@cmv/shared` et sont **interpolées** dans les messages de refus.

Contrairement à un `Document` de la bibliothèque, un média de débrief n'est **jamais copié ni partagé** : sa clé objet n'appartient qu'à lui, donc sa suppression purge l'objet **directement**, sans garde de comptage.

Ce qui est réellement appliqué, et où :
- **mime, taille, durée** → dans le schéma Zod partagé (`@cmv/shared`) : rejet en 400 par le pipe, et le client réutilise les mêmes bornes avant capture ;
- **la taille** est en plus **signée dans l'URL PUT** (`ContentLength`) : le storage rejette tout envoi d'un autre poids — sans quoi le plafond ne serait qu'une politesse ;
- **le quota 3/5** dépend de l'état en base : il ne peut pas vivre dans le schéma. `maxFeedbackMediaCount()` en reste la source unique, partagée par le service (409) et le client (bouton éteint) ;
- **le 720p** n'est ni appliqué ni vérifié (pas de transcodage — dette P4-1), et la **durée est déclarative** (le serveur ne décode pas le fichier — dette P4-2).

### Conversation / Message
Fil **1:1** coach ↔ athlète, scopé par la relation. `Message` = texte / audio / image / vidéo, rattachable à une séance ou un débrief. MVP : **asynchrone** (polling TanStack Query + push). WebSocket temps réel **différé** (post-MVP).

### Invoice (facture)
Émise par le coach pour un athlète (période, montant, échéance, note). Statut `PENDING` / `PAID` (**marquage manuel** en MVP). Paiement réel **externe** (virement) ; PSP intégré (Stripe) en v1.0.

⚠️ **« En retard » n'est PAS un statut** : c'est `InvoiceState.OVERDUE`, *dérivé* par `resolveInvoiceState` d'une facture `PENDING` dont la `dueDate` est dépassée — même dispositif que « rappel dû ». Conséquence pour tout compteur ou filtre : **« en attente » ≠ `status === PENDING`**, puisque ce statut couvre aussi les factures en retard. Le vocabulaire produit distingue les deux (`countPendingInvoices` / `countOverdueInvoices`, qui partitionnent l'impayé) ; le statut brut, non.

`Invoice.dueDate` est une **date civile** (`YYYY-MM-DD`), contrairement à `Reminder.dueAt` qui est un instant : elle se compare avec `todayIsoDate()` et s'affiche via `formatIsoDate` (jamais `formatIsoDateTime`).

### Reminder (rappel)
Aide-mémoire que le coach se pose à lui-même : « proposer le renouvellement avant la dernière semaine », « relancer cette facture ». **Outil privé du coach** — c'est la seule entité métier qu'un athlète ne voit jamais, sous aucune forme (scopée `coachId` **seul**, sans `athleteId`).

Porte une cible **polymorphe** (`entityType` ∈ `PLAN` | `INVOICE`, + `entityId`), un `dueAt`, une `note` et un statut `PENDING` → `DONE` | `DISMISSED`.

Cinq règles à connaître :
- **`dueAt` est un INSTANT**, pas une date civile (contrairement à `Plan.startDate` et `Invoice.dueDate`) : un rappel se déclenche à une heure, et s'affiche dans le fuseau de son lecteur (`formatIsoDateTime`).
- **La `note` est obligatoire** : c'est le contenu entier du rappel et le libellé de sa ligne. C'est du **texte du coach** (comme `Plan.title`), pas un libellé système — le stocker ne contredit pas la règle « le libellé d'une notification n'est jamais stocké ».
- **« Dû » est calculé à la LECTURE** (`dueAt <= now` sur un rappel `PENDING`, cf. `isReminderDue`), comme le « en retard » d'une facture. Il n'y a **pas de scheduler**, donc un rappel qui devient dû n'émet **aucun push** — il apparaît dans le centre de notifications au prochain chargement.
- **`readAt` (« vu dans le centre ») est distinct du statut (« traité »)** : jeter un œil à un rappel dû ne le traite pas. Sans cette distinction, le badge ne se viderait jamais, ou un coup d'œil vaudrait « fait ».
- **`DISMISSED` est la suppression douce** : il n'y a pas de `DELETE` sur un rappel, et les trois transitions sont **réversibles** (simple toggle, comme le statut de facture).

`ReminderEntityType` est **volontairement plus étroit** que `NotificationEntityType` : ici on décrit ce que le produit permet de *rappeler*, là ce vers quoi une notification peut *pointer*. Le pont est la table `REMINDER_TARGET_ENTITY_TYPE` (`@cmv/shared`).

Comme pour `Notification`, `entityId` **n'a pas de clé étrangère**. Différence qui compte : un cycle `DRAFT` se supprime vraiment, donc les rappels qui le visaient (et ceux de sa facture) sont **purgés dans la transaction de suppression** — là où les notifications, elles, restent (dette N-4).

### Notification
Trace **persistée** d'un événement adressé à un `User` : cycle diffusé, séance **modifiée / ajoutée / retirée**, débrief reçu, message reçu, facture émise. Écrite par `NotificationService` **aux mêmes déclencheurs que le push, en plus de lui et jamais à sa place** — le push est éphémère (téléphone éteint, permission refusée, ou compte qui n'a jamais ouvert le mobile : c'est le cas du coach sur web), la `Notification` est ce qui reste à consulter.

Les trois façons d'ajuster un cycle **déjà diffusé** (CDC §5.7) ont chacune leur type, plutôt qu'un « cycle modifié » unique : annoncer « séance modifiée » sur une **suppression** enverrait l'athlète chercher une séance qui n'existe plus. Sur un cycle `DRAFT`, aucun de ces trois événements ne notifie — le cycle n'existe pas encore pour l'athlète.

Porte `type` (`NotificationType`), la cible (`entityType` + `entityId`), `readAt` nullable (`null` = non lue → alimente le badge) et `createdAt`.

⚠️ **Le centre a une SECONDE source, non persistée** : les **rappels dus** du coach (`REMINDER_DUE`). Ce type est le seul de `NotificationType` **absent de l'enum Prisma** — l'entrée est calculée à chaque lecture depuis la table `reminder`, faute de scheduler pour la persister au bon moment. Trois conséquences : son `id` porte le préfixe `reminder:` (ce qui garde **une** route de marquage pour les deux sources), son `createdAt` vaut le `dueAt` du rappel (il « arrive » quand il commence à compter), et la lecture est **branchée sur la capacité coach** — `Reminder` n'ayant aucun scope athlète, l'interroger pour un athlète lèverait au lieu de rendre une liste vide.

Trois règles à connaître :
- **Le libellé n'est PAS stocké.** Une ligne écrite aujourd'hui serait figée en français le jour où `en.json` arrive : on persiste les **paramètres** d'interpolation (`actorName`, `subjectLabel`, nullables) et le rendu se fait à l'affichage, via `NOTIFICATION_LABEL_KEY` (`@cmv/shared`) + i18next. Ces paramètres sont des **instantanés** : renommer un cycle ne réécrit pas les notifications déjà émises.
- **`entityId` n'a pas de clé étrangère** : la cible est polymorphe (`entityType` décide du modèle visé). Contrepartie assumée — une cible supprimée laisse une entrée qui ne mène nulle part.
- **Les déclencheurs sont ceux du push, throttles compris** : une rafale de messages ne produit qu'**une** entrée (passage « tout lu » → « non lu », cf. P5-4), et seule la **création** d'un débrief notifie (P4-5).

---

## Multi-tenant (frontière de données)

- **Invariant** : 1 `Athlete` = exactement 1 `Coach`. 1 `Coach` = N `Athlete`.
- Presque toute entité (`Plan`, `Session`, `SessionFeedback`, `Conversation`, `Invoice`, `AthleteProfile`…) est **scopée à la relation `CoachAthlete`**.
- La **bibliothèque** (`Exercise`, `ExerciseDocument`, `Session`, `SessionExercise`) est scopée au **coach seul** (`coachId`) : l'athlète n'y a aucun accès direct — il ne voit que ce que la planification lui expose (P3), via des copies.
- La **planification** (`Plan`, `PlanWeek`, `ScheduledSession`…) est le premier objet lu par les **deux capacités** : chaque table porte donc `coachId` ET `athleteId` en direct.
- ⚠️ **Le scope tenant ne dit RIEN du statut.** Un athlète scopé par `athleteId` verrait les `DRAFT` de son coach : le filtre `PUBLISHED` est imposé par un service dédié (`AthletePlanService`), seul point d'entrée de la lecture athlète. Couvert par e2e.
- ⚠️ **`CoachAthleteStatus.PENDING` n'est jamais écrit** : la colonne est `@default(ACTIVE)`, `InvitationService` pose `ACTIVE` à l'acceptation, et les services filtrent sur `ACTIVE`. Le palier existe dans le modèle (« réservé si besoin »), pas dans les faits — ne pas construire d'UI qui suppose deux états tant qu'un flux n'en produit pas deux.
- ⚠️ **`Reminder` est scopé `coachId` SEUL** — la seule entité métier sans scope athlète (outil privé du coach). L'absence de clé `athlete` dans `TENANT_SCOPES` n'est pas un oubli, mais elle se manifeste par une **erreur** (fail closed), pas un 403 : deux gardes doivent donc la précéder — le `@RequireCapability("coach")` du contrôleur, et le branchement du centre de notifications sur la capacité POSSÉDÉE (`runAsCapability` y qualifie la seule lecture concernée).
- ⚠️ **`PushToken` est scopé `userId` pour les deux capacités**, et **`Notification` par `recipientId`** : l'un adresse une *installation* de l'app, l'autre une personne — ni l'un ni l'autre n'appartient à la relation coach↔athlète. L'**écriture et la lecture d'envoi** visent le DESTINATAIRE, donc un autre tenant : elles passent par le client Prisma de base (`NotificationService`), comme `UserDirectoryService`. La **consultation**, elle, est scopée normalement (`NotificationFeedService`) — chacun ne lit que ce qui lui est adressé.
- L'isolation est **garantie à la couche données** (tenancy guard + Prisma Client Extension), pas seulement par la logique applicative. Un acteur n'accède jamais aux données d'un autre tenant. Voir `architecture-choice.md` §Multi-tenant (dont les **pièges du scope automatique** : `include` imbriqués non scopés, FK non contraintes par le tenant).

---

## Capacités & accès (résumé)

Une ligne par donnée, une colonne par **capacité** — et non par personne : un compte qui porte les
deux lit chaque colonne, mais toujours **une à la fois**, selon l'espace où il se trouve.

| Donnée | isCoach | isAthlete |
|---|---|---|
| Bibliothèque exercices/séances | CRUD (les siens) | — |
| Planification | CRUD (ses athlètes) | lecture (la sienne) |
| Débrief de séance | lecture + marquage « lu » | écriture (le sien) |
| Fiche athlète | CRUD | — |
| Messagerie | 1:1 avec ses athlètes | 1:1 avec son coach |
| Facture | émission + statut | lecture |
| Rappel | CRUD (les siens) | — *(aucun accès : 403)* |
| Notifications | lecture + marquage lu (les siennes) | lecture + marquage lu (les siennes) |

Le centre de notifications, lui, n'a **pas** de capacité exercée : il montre ce qui est adressé au
compte, tous espaces confondus. Son compteur est en revanche **ventilé** (`{ count, coach, athlete }`),
ce qui permet à l'espace inactif de signaler ce qui l'attend.

---

## Langue

Termes **produit** en français (UI). Termes **code** (entités, champs, capacités) en anglais, tels que listés ici. Anglais produit prévu — toute string UI passe par i18next dès le départ.
