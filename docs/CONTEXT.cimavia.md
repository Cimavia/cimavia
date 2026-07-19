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

Tout le reste (auth, rôles, notifications) sert cette boucle.

---

## Acteurs & relation

### User
Identité authentifiée (gérée par Better Auth). Porte un `role` : `COACH` ou `ATHLETE`. Les deux rôles utilisent **web et mobile** (le coach surtout sur web pour la création, l'athlète surtout sur mobile au quotidien).

### Coach
`User` de rôle `COACH`. Possède N athlètes, sa bibliothèque d'exercices/séances, ses planifications, ses conversations et ses factures.

### Athlete
`User` de rôle `ATHLETE`, rattaché à **exactement un** coach (unicité en base — voir « Multi-tenant »). Consulte ses planifications, débriefe ses séances, échange avec son coach.

### CoachAthlete (relation)
Le lien coach→athlète, établi par **invitation** (lien/code). Statut `PENDING` → `ACTIVE`. C'est la frontière de tenant : presque toute donnée est scopée par cette relation.

### AthleteProfile (fiche athlète)
Champ **texte libre** décrivant l'athlète, **éditable par le coach uniquement**. Pas de structure imposée en MVP.

---

## Entraînement

### Exercise
Brique de la bibliothèque du coach : `title`, `description` (nullable), `category` ∈ **`RENFO` | `GRIMPE` | `TECHNIQUE`**. Peut porter des **documents** joints. Scopé au coach (`coachId`). Réutilisable dans plusieurs `Session`.

### Document
Pièce jointe d'un `Exercise`. Deux types (`DocumentType`) :
- **`FILE`** — fichier en **object storage** (bucket privé) : PDF / PNG / JPEG / WEBP, **20 Mo max**. Jamais le binaire en BDD ; upload direct client → storage par **URL PUT signée**, lecture par **URL GET signée** courte.
- **`LINK`** — URL externe (ex. vidéo). Aucun fichier stocké.

### Session (séance) — modèle vs instance
- **Modèle** (`Session`) : séance réutilisable = liste **ordonnée** de `SessionExercise` (`position`, `prescription` nullable) + `notes` (consignes globales, nullable). Vit dans la bibliothèque du coach. La composition se met à jour en **replace-all** (`PUT`) : l'ordre du tableau **définit** les positions.
- **Instance** (`ScheduledSession`) : **copie éditable** d'un modèle, posée dans une planification (P3). La modifier ne touche **pas** la bibliothèque. C'est le seam qui permet d'ajuster une séance pour un athlète sans casser les modèles.

> ⚠️ **Nommage** : Better Auth possède déjà une table de sessions d'authentification. Son modèle Prisma a été renommé **`AuthSession`** (table `session` conservée via `@@map`, remap par `session.modelName`) pour laisser le nom **`Session`** à l'entité métier séance (table `sessions`). Ne pas confondre les deux dans le code.

### Plan (planification)
Cycle d'entraînement créé par le coach pour un athlète. **Nombre de semaines libre**. `startDate` est **toujours un lundi** (contrainte du schéma partagé) et c'est une **date civile** (`YYYY-MM-DD`, sans heure ni fuseau). Statut `DRAFT` → `PUBLISHED` : la diffusion est **irréversible** en MVP (le cycle s'ajuste en place, cf. CDC §5.7) et refusée si le cycle n'a aucune semaine. Elle **notifie l'athlète** par push (`NotificationService` → `expo-server-sdk`, P4). Ajuster un cycle déjà diffusé le notifie aussi : il a peut-être la version d'avant en cache hors-ligne.

### PlanWeek (semaine)
Une semaine d'un `Plan`. Porte un **type** (`TRAINING` | `DELOAD`), un `weekNumber` 1-based et une note libre. Contient un **nombre libre** de séances planifiées.

⚠️ **Aucune date n'est stockée sur la semaine** : ses bornes se calculent (`planWeekRange` = `plan.startDate + 7×(weekNumber−1)` → dimanche). Une seule source, donc aucune dérive possible. Corollaire : déplacer le `startDate` d'un plan, ou supprimer une semaine du milieu, **décale les séances** des semaines concernées (l'API s'en charge) — sinon une séance sortirait de la plage de sa semaine.

### ScheduledSession
Instance de séance dans une `PlanWeek` (voir « Session — instance »). Porte une `scheduledDate` (dans la plage de sa semaine — invariant vérifié à l'écriture) et une `position` = rang **dans la journée** (plusieurs séances le même jour). Statut `PLANNED` | `DONE` | `SKIPPED` — en P3 tout est créé `PLANNED` ; `DONE` arrive avec le débrief (P4). Se met à jour en **replace-all** (`PUT`), comme la séance modèle. **Pas d'historique des modifications** en MVP.

### ScheduledSessionExercise — la copie, pas la référence
**Décision structurante (P3).** L'instance est un **instantané autonome** : `title`, `description`, `category`, `prescription` sont **copiés** de l'`Exercise`, et ses documents sont **dupliqués en lignes** (`ScheduledSessionExerciseDocument`) partageant la **même clé objet S3** (aucun binaire dupliqué).

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
Photo / vidéo / **note vocale** rattachée à un `SessionFeedback`. L'**audio** (débrief vocal, CDC §4) a rejoint `MediaType` en P5, avec l'enregistreur/lecteur construits pour la messagerie (promus en `shared/component/` côté mobile) — même flux d'upload que photo/vidéo. Stocké en object storage (URL GET signée), compressé côté client. Limites MVP : vidéo **60 s / 720p / ~50 Mo**, **3 vidéos + 5 photos + 3 notes vocales** (m4a, ≤ 5 min / 10 Mo) par débrief.

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

---

## Multi-tenant (frontière de données)

- **Invariant** : 1 `Athlete` = exactement 1 `Coach`. 1 `Coach` = N `Athlete`.
- Presque toute entité (`Plan`, `Session`, `SessionFeedback`, `Conversation`, `Invoice`, `AthleteProfile`…) est **scopée à la relation `CoachAthlete`**.
- La **bibliothèque** (`Exercise`, `ExerciseDocument`, `Session`, `SessionExercise`) est scopée au **coach seul** (`coachId`) : l'athlète n'y a aucun accès direct — il ne voit que ce que la planification lui expose (P3), via des copies.
- La **planification** (`Plan`, `PlanWeek`, `ScheduledSession`…) est le premier objet lu par les **deux rôles** : chaque table porte donc `coachId` ET `athleteId` en direct.
- ⚠️ **Le scope tenant ne dit RIEN du statut.** Un athlète scopé par `athleteId` verrait les `DRAFT` de son coach : le filtre `PUBLISHED` est imposé par un service dédié (`AthletePlanService`), seul point d'entrée de la lecture athlète. Couvert par e2e.
- ⚠️ **`PushToken` est scopé `userId` pour les deux rôles** : un token adresse une *installation* de l'app, il appartient à une personne, pas à la relation coach↔athlète. L'**envoi**, lui, lit les tokens du DESTINATAIRE (donc d'un autre tenant) : il passe par le client Prisma de base, comme `UserDirectoryService`.
- L'isolation est **garantie à la couche données** (tenancy guard + Prisma Client Extension), pas seulement par la logique applicative. Un acteur n'accède jamais aux données d'un autre tenant. Voir `architecture-choice.md` §Multi-tenant (dont les **pièges du scope automatique** : `include` imbriqués non scopés, FK non contraintes par le tenant).

---

## Rôles & accès (résumé)

| Donnée | Coach | Athlete |
|---|---|---|
| Bibliothèque exercices/séances | CRUD (les siens) | — |
| Planification | CRUD (ses athlètes) | lecture (la sienne) |
| Débrief de séance | lecture + marquage « lu » | écriture (le sien) |
| Fiche athlète | CRUD | — |
| Messagerie | 1:1 avec ses athlètes | 1:1 avec son coach |
| Facture | émission + statut | lecture |

---

## Langue

Termes **produit** en français (UI). Termes **code** (entités, champs, rôles) en anglais, tels que listés ici. Anglais produit prévu — toute string UI passe par i18next dès le départ.
