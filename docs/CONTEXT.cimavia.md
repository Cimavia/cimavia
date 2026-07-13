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
Cycle d'entraînement créé par le coach pour un athlète. **Nombre de semaines libre**. Statut `DRAFT` → `PUBLISHED` ; à la publication, notification push à l'athlète.

### PlanWeek (semaine)
Une semaine d'un `Plan`. Porte un **type** : `TRAINING` ou `DELOAD` (décharge). Contient un **nombre libre** de séances planifiées.

### ScheduledSession
Instance de séance dans une `PlanWeek` (voir « Session — instance »). Porte ses propres `ScheduledSessionExercise` (exercices + prescription), modifiables par le coach en cours de cycle. **Pas d'historique des modifications** en MVP.

---

## Suivi & échanges

### SessionFeedback (débrief)
Retour de l'athlète sur une `ScheduledSession` : **un champ texte libre** (« retour sur la séance ») + médias. **Pas d'indicateur ni de score** en MVP ; le débrief par exercice est différé (post-MVP).

### Media
Photo / vidéo / audio rattaché à un `SessionFeedback` ou à un `Message`. Stocké en object storage (URL signée), compressé côté client. Limites MVP : vidéo **60 s / 720p / ~50 Mo**, **3 vidéos + 5 photos** par débrief.

### Conversation / Message
Fil **1:1** coach ↔ athlète, scopé par la relation. `Message` = texte / audio / image / vidéo, rattachable à une séance ou un débrief. MVP : **asynchrone** (polling TanStack Query + push). WebSocket temps réel **différé** (post-MVP).

### Invoice (facture)
Émise par le coach pour un athlète (période, montant, échéance, note). Statut `PENDING` / `PAID` (**marquage manuel** en MVP). Paiement réel **externe** (virement) ; PSP intégré (Stripe) en v1.0.

---

## Multi-tenant (frontière de données)

- **Invariant** : 1 `Athlete` = exactement 1 `Coach`. 1 `Coach` = N `Athlete`.
- Presque toute entité (`Plan`, `Session`, `SessionFeedback`, `Conversation`, `Invoice`, `AthleteProfile`…) est **scopée à la relation `CoachAthlete`**.
- La **bibliothèque** (`Exercise`, `ExerciseDocument`, `Session`, `SessionExercise`) est scopée au **coach seul** (`coachId`) : l'athlète n'y a aucun accès direct — il ne voit que ce que la planification lui expose (P3).
- L'isolation est **garantie à la couche données** (tenancy guard + Prisma Client Extension), pas seulement par la logique applicative. Un acteur n'accède jamais aux données d'un autre tenant. Voir `architecture-choice.md` §Multi-tenant (dont les **pièges du scope automatique** : `include` imbriqués non scopés, FK non contraintes par le tenant).

---

## Rôles & accès (résumé)

| Donnée | Coach | Athlete |
|---|---|---|
| Bibliothèque exercices/séances | CRUD (les siens) | — |
| Planification | CRUD (ses athlètes) | lecture (la sienne) |
| Débrief de séance | lecture | écriture (le sien) |
| Fiche athlète | CRUD | — |
| Messagerie | 1:1 avec ses athlètes | 1:1 avec son coach |
| Facture | émission + statut | lecture |

---

## Langue

Termes **produit** en français (UI). Termes **code** (entités, champs, rôles) en anglais, tels que listés ici. Anglais produit prévu — toute string UI passe par i18next dès le départ.
