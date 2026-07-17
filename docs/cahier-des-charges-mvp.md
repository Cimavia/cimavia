# Cahier des charges — Cimavia (suivi escalade coach ↔ athlète)

> **Nom du projet :** Cimavia (diminutif `cmv`)
> **Version du document :** v1 (brouillon de travail détaillé)
> **Statut :** à valider
> **Développement :** réalisé en solo, assisté par Claude / Claude Code
> **Langue produit :** FR au lancement, EN rapidement (architecture i18n dès le départ)

---

## 1. Contexte et vision

### 1.1 Contexte
Le suivi coach ↔ athlète repose aujourd'hui sur des outils dispersés : WhatsApp (planification PDF, débriefs texte/audio/photo/vidéo, ajustements), le site de la banque (virement), et un fichier privé côté coach (suivi, points forts/faibles, objectifs, résultats). Cette dispersion nuit à la lisibilité du suivi et à la productivité du coach.

### 1.2 Vision
Centraliser dans une seule application l'ensemble du parcours : planification, exécution, débrief, communication, facturation et suivi de progression.

- **Court terme :** application centrée **escalade**.
- **Long terme :** ouverture multi-sport possible. Le modèle de données reste *raisonnablement générique* pour ne pas bloquer cette évolution, sans la sur-anticiper.
- **Athlète autonome (v1.0) :** un athlète peut aussi utiliser l'application **sans coach**, en mode auto-coaching — il crée et débriefe ses propres séances/planifications. Le MVP reste centré sur la relation coach↔athlète ; le modèle de données est conçu pour ne pas bloquer cet usage (voir §3 et §8).

---

## 2. Objectifs du MVP

- Le coach **crée et diffuse** des planifications (séances + exercices + documents).
- L'athlète **consulte** sa planification et **débriefe** chaque séance (texte libre + médias).
- **Messagerie** intégrée coach ↔ athlète (texte, audio, médias).
- **Facturation** : émission + suivi de statut (paiement réel externe en MVP).
- Le coach dispose d'une **fiche athlète** (champ libre).

### Indicateurs de succès (à affiner)
- Le coach gère tout le cycle sans repasser par WhatsApp.
- L'athlète débriefe ≥ 80 % de ses séances.
- Temps de création d'une planification réduit vs méthode actuelle.

---

## 3. Acteurs et rôles

| Rôle | Usage principal | Accès |
|------|----------------|-------|
| **Coach** | Création (exercices, séances, planifs) — plus confortable sur web | **Web + mobile** |
| **Athlète** | Usage quotidien (consultation, débrief, messages) — surtout mobile | **Web + mobile** |
| **Admin** | Gestion comptes, support (rôle minimal en MVP) | Web |

**Règles de relation :**
- Architecture **multi-tenant** : plusieurs coachs, plusieurs athlètes.
- Un athlète a **au plus un coach** (contrainte d'unicité en base : **0 ou 1**).
  - **MVP :** tout athlète est lié à exactement 1 coach.
  - **v1.0 :** un athlète peut être **autonome** (0 coach, auto-coaching). La liaison est **réversible** : un athlète autonome peut rejoindre un coach plus tard, et redevenir autonome si la relation se termine. Quand un coach existe, il reste **unique**.
- Un coach a **N athlètes**.
- **Les deux rôles accèdent aux deux clients** (web et mobile) — l'usage diffère, pas les droits d'accès aux plateformes.

---

## 4. Roadmap des fonctionnalités (priorisation par version)

Légende : **MVP** = première version livrable · **v1.0** = première version "produit" · **v1.x / v2** = consolidation · **Vision LT** = très long terme.

| Fonctionnalité | Version | Notes |
|----------------|---------|-------|
| Comptes, rôles, connexion | MVP | email + mot de passe, reset par e-mail |
| Liaison coach ↔ athlète (invitation) | MVP | au plus 1 coach par athlète (1 en MVP) |
| **Athlète autonome** (auto-coaching, sans coach) | v1.0 | 0 coach ; liaison réversible ; l'athlète crée/débriefe ses propres séances |
| Création d'exercices + documents joints | MVP | PDF/image/lien |
| Composition de séances | MVP | liste ordonnée d'exercices |
| Planification (nombre de semaines **libre**) | MVP | semaines type entraînement / décharge |
| Nombre de séances par semaine **libre** | MVP | dépend de l'athlète |
| Consultation planif/séances (athlète) | MVP | lecture hors-ligne |
| Modification d'exercice/séance en cours de planif | MVP | sans historique en MVP |
| Débrief de séance : **texte libre + photo/vidéo** | MVP | pas d'indicateur chiffré |
| Messagerie intégrée (texte, audio, médias) | MVP | asynchrone |
| Notifications push | MVP | nouvelle planif, modif, message, facture |
| Fiche athlète (**champ libre**) | MVP | côté coach |
| Facturation : émission + statut (payé/en attente) | MVP | paiement externe (virement) |
| Internationalisation (EN) | v1.0 | i18n techniquement prêt dès le MVP |
| **Paiement intégré** (PSP type Stripe) | v1.0 | + statut auto |
| Débrief **par exercice** | post-MVP | à évaluer ; MVP = débrief séance suffisant |
| **Débrief vocal** (audio joint au débrief) | P5 | Le modèle ne le bloque pas (`MediaType` extensible, flux d'upload identique). Différé à la messagerie, qui impose de toute façon de construire l'enregistreur/lecteur audio (§5.8) : l'ajouter au débrief coûtera alors quelques heures, contre une journée aujourd'hui. |
| Résultats de compétition | v1.0 | saisie + historique |
| Suivi/analyse de progression (tableaux de bord) | v1.x | agrégation des débriefs |
| Versionnement des planifications (historique) | v1.x | non MVP |
| Messagerie temps réel (présence, frappe) | v2 | MVP = asynchrone |
| Bibliothèque d'exercices partagée / templates publics | v2 | |
| **Multi-sport** | Vision LT | généralisation du modèle |
| Marketplace / mise en relation coach-athlète | Vision LT | |

> Ce tableau est la **source de vérité du périmètre**. Toute nouvelle idée s'y ajoute avec une version cible avant d'être développée.

---

## 5. Description fonctionnelle (MVP)

### 5.1 Comptes et rôles
- Inscription / connexion email + mot de passe.
- Réinitialisation du mot de passe (« mot de passe oublié » → lien de reset par e-mail).
- OAuth (Google) en option v1.0.
- Rôle attribué à l'inscription (coach / athlète).
- Liaison : le coach invite (lien ou code), l'athlète rejoint → relation unique.
- **Athlète autonome (v1.0) :** un athlète peut rester **sans coach** et s'auto-coacher (création de ses propres exercices/séances/planifications, débrief). La liaison à un coach reste possible plus tard et **réversible** (voir §3).

### 5.2 Bibliothèque d'exercices (coach)
- Exercice : titre, description, catégorie (ex. *renfo*, *grimpe*, *technique*).
- Documents joints (PDF, image, lien vidéo).
- Réutilisable dans plusieurs séances.

### 5.3 Séances (coach)
- Séance = liste **ordonnée** d'exercices + consignes globales.
- Peut mélanger plusieurs types d'exercices.
- Réutilisable comme modèle.

### 5.4 Planifications (coach)
- Planif = cycle pour un athlète, **nombre de semaines libre**.
- Chaque semaine est de type **entraînement** ou **décharge**.
- **Nombre de séances par semaine libre** (selon l'athlète).
- Description globale du cycle + affectation des séances à des dates.
- Diffusion → notification athlète.
- À l'ajout dans une planif, les exercices d'une séance sont **copiés en instance** : le coach peut les modifier pour cet athlète sans toucher le modèle d'origine.

### 5.5 Consultation athlète (mobile/web)
- Vue calendrier/semaine.
- Détail séance : exercices, consignes, documents consultables.
- **Lecture hors-ligne** des séances de la semaine (utile en salle).

### 5.6 Débrief de séance (athlète)
- **Un champ texte libre** « retour sur la séance ».
- Pièces jointes **photos / vidéos**.
- Pas d'indicateur chiffré ni de statut par exercice en MVP (débrief par exercice → v1.0).
- Visible immédiatement par le coach.

### 5.7 Modification en cours de planif (coach)
- Modifier un/des exercices ou séances d'une planif diffusée.
- Notification à l'athlète.
- **Pas d'historique** des modifications en MVP.

### 5.8 Messagerie intégrée
- Conversation 1:1 coach ↔ athlète.
- Messages **texte, audio, photo, vidéo**.
- **Asynchrone** : pas de temps réel strict ; les nouveaux messages remontent via **notification push + polling** (TanStack Query). WebSocket temps réel (NestJS Gateway + Redis) **différé post-MVP**.

### 5.9 Fiche athlète (coach)
- **Un champ libre** rattaché à l'athlète (objectifs, points forts/faibles, notes).
- Modifiable par le coach uniquement.

### 5.10 Facturation
- Le coach émet une facture : période, montant, échéance.
- Statut **en attente / payé** (marquage manuel en MVP).
- L'athlète consulte ses factures.
- Paiement réel **externe** (virement). PSP intégré → v1.0.

---

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|--------|----------|
| **Sécurité** | Auth robuste (Better Auth), HTTPS, médias en buckets privés (URLs signées), **isolation des données scopée à l'acteur courant** (tenancy guard + Prisma Client Extension). |
| **RGPD / hébergement** | Données perso + médias : consentement, droit à l'effacement. **Hébergement en France** (résidence MVP, souveraineté visée — voir §7.5). Caveat : si les données sont qualifiées de **santé**, hébergeur **HDS** requis. |
| **i18n** | Toutes les chaînes externalisées dès le MVP (FR), EN activable en v1.0. |
| **Médias** | Compression côté client avant upload. Plafonds MVP : vidéo 60 s / 720p / ~50 Mo, **3 vidéos** + **5 photos** (≤1600 px) par débrief. Vidéo = principal poste de coût. |
| **Offline** | Lecture des séances de la semaine sans réseau (cache local). |
| **Notifications** | Push mobile + web. |
| **Performance** | Consultation fluide en réseau faible. |
| **Évolutivité** | Modèle prêt multi-coach ; généricité raisonnable pour le multi-sport. |

---

## 7. Architecture technique

### 7.1 Vue d'ensemble
- **Monorepo** (Turborepo + pnpm) : une **API NestJS** + deux clients (**mobile** Expo, **web** React/Vite) + packages partagés (`@cmv/shared`, `@cmv/tokens`, `@cmv/tsconfig`).
- Le coach travaille surtout sur le **web** (création de contenu), l'athlète surtout sur **mobile** (consultation/débrief en salle) — mais les deux rôles accèdent aux deux clients.
- Toute la logique métier et l'accès aux données passent par l'**API NestJS** : isolation multi-tenant garantie à la couche données (tenancy guard + Prisma Client Extension), pas par la seule logique applicative.

```
┌────────────────────────┐   ┌────────────────────────┐
│  Mobile — Expo SDK 56   │   │  Web — React + Vite     │
│  Expo Router / NativeWind│  │  TanStack Router / Query│
└───────────┬─────────────┘   └────────────┬───────────┘
            │      HTTP (DTO @cmv/shared, validés Zod)  │
            └──────────────┬────────────────────────────┘
                ┌──────────▼─────────────────────────────┐
                │  API — NestJS (modules par feature)     │
                │  Better Auth │ Tenancy guard            │
                │  Prisma 7 + extension (scope tenant)    │
                └──────────┬───────────────┬──────────────┘
                ┌──────────▼──────┐  ┌──────▼──────────────┐
                │  PostgreSQL 18  │  │  Object Storage S3   │
                │  (Neon → Clever)│  │  (Scaleway / Cellar) │
                └─────────────────┘  └──────────────────────┘
```

### 7.2 Stack proposée (et justification)

| Couche | Choix | Pourquoi |
|--------|-------|----------|
| Mobile | **Expo SDK 56 / React Native** (Expo Router, NativeWind — *vérifier la dernière version stable au démarrage, sortie 3×/an*) | Client athlète au quotidien ; New Architecture, Dev Build. |
| Web | **React 19 + Vite** (TanStack Router + Query, Tailwind v3) | Surface principale du coach (création de contenu). Pas de Next.js. |
| Langage | **TypeScript strict** partout | Types métier (DTO) + schémas Zod **partagés** front ↔ back via `@cmv/shared`. |
| Données serveur | **TanStack Query** | Cache, synchro, persistance du cache (lecture offline). |
| API | **NestJS 11** (modules par feature) | Logique métier, validation Zod, observabilité, point d'application du multi-tenant. |
| ORM / DB | **Prisma 7** (adapter-pg) + **PostgreSQL 18** | `prisma migrate` natif. Une instance `PrismaClient` unique, étendue (scope tenant). |
| Auth | **Better Auth** (`@thallesp/nestjs-better-auth`, `@better-auth/expo`) | Email/mot de passe + reset en MVP ; OAuth Google en v1.0. Session résolue par le tenancy guard. |
| Multi-tenant | **Tenancy guard + Prisma Client Extension** | Isolation à la couche données (pas de RLS). Voir §9. |
| Médias | **Object storage S3** (`@aws-sdk/client-s3` → Scaleway) | Buckets privés, URLs signées. Jamais le binaire en BDD. |
| Notifications | **expo-server-sdk** (côté NestJS) + **expo-notifications** (clients) | Push natif déclenché par l'API sur événements métier. |
| Observabilité | **Pino → Axiom** + **Sentry** (3 couches) | Logs JSON structurés ; erreurs centralisées. |
| i18n | **i18next** + `expo-localization` | Chaînes externalisées, FR puis EN. |
| Hébergement | **MVP gratuit** : API → Scaleway Serverless Containers · médias → Scaleway Object Storage · DB → **Neon free** (EU). **v1.0 FR** : Clever Cloud (app + PostgreSQL + Redis + Cellar S3, HDS). | Données en France/EU ; portabilité par variables d'env (voir §7.5). Redis **différé** en MVP. |
| Paiement (v1.0) | **Stripe** (Connect si reversement au coach) | Standard, bien documenté. |

> Choix assumé d'une **API custom NestJS** plutôt qu'un BaaS : plus de travail initial, mais contrôle total du modèle multi-tenant, **portabilité d'hébergement** (rien de propriétaire) et typage partagé bout-en-bout. Redis (cache / WebSocket) est **différé** au-delà du MVP.

### 7.3 Structure de projet (monorepo Turborepo + pnpm)

```
apps/
  api/        # NestJS — modules par feature : auth, account, exercise,
              #   session, plan, feedback, message, invoice + infra/ (prisma, storage, redis)
  mobile/     # Expo Router + NativeWind — app/ (routing) + feature/ + shared/
  web/        # React + Vite + TanStack Router/Query — feature/ + shared/
packages/
  shared/     # @cmv/shared — types métier (DTO) + schémas Zod, logique pure (front+back)
  tokens/     # @cmv/tokens — couleurs/spacing/typo → Tailwind (web) + NativeWind (mobile)
  tsconfig/   # @cmv/tsconfig — configs TS de base
```

L'affichage est conditionné par le **rôle** (`User.role`), pas par la plateforme : les deux rôles accèdent aux deux clients. Conventions détaillées par couche dans `architecture-choice.md`.

### 7.4 Environnements
- **local** (Docker `postgres:18-alpine`), **staging**, **production** (GitLab Flow : `feature/*` → `main` → `staging` → `production`).
- Schéma versionné via **migrations Prisma** (`prisma migrate`) ; jamais de modif manuelle non versionnée en prod. BDD MVP = Neon free (Prisma-natif).

### 7.5 Hébergement français : résidence vs souveraineté
Deux niveaux à ne pas confondre :

- **MVP (gratuit, résidence FR/EU) :** API → **Scaleway Serverless Containers** (scale-to-zero), médias → **Scaleway Object Storage** (FR), BDD → **Neon free** (EU, Prisma-natif), web → Cloudflare Pages/Scaleway. Démarrage immédiat, coût nul. *Limite :* Neon est une société US → résidence EU mais pas souveraineté stricte (exposition Cloud Act / Schrems II).
- **Souveraineté (v1.0) :** bascule **Clever Cloud** — app + **PostgreSQL** + **Redis** + **Cellar** (S3-compatible), **HDS** intégré (hébergeur français). La bascule = **variables d'environnement** (`DATABASE_URL`, endpoint S3…), rien de propriétaire : migration mécaniquement propre.

**Décision :** démarrer gratuit (Scaleway + Neon), **concevoir portable** (aucune dépendance à une fonctionnalité propriétaire) pour basculer vers Clever Cloud (souverain FR) sans réécriture.

**Caveat HDS :** si les données d'entraînement sont qualifiées de données de santé, l'hébergement devra être **HDS** (Clever Cloud, OVHcloud et Scaleway proposent des offres certifiées).

---

## 8. Modèle de données (détaillé)

> Convention : `id` (PK), `created_at`/`updated_at`. Schéma posé en **Prisma** (P1) ; l'isolation tenant est appliquée par l'extension Prisma (§9), **pas par RLS**. Better Auth gère ses propres tables (sessions, comptes) à côté de `users`.

### 8.1 Tables

**users** (compte Better Auth + profil)
- `id`, `email`, `role` enum(`coach`,`athlete`,`admin`), `full_name`, `avatar_url`, `locale` (`fr`/`en`)

**coach_athlete** (relation, 1 coach par athlète)
- `coach_id` → profiles, `athlete_id` → profiles **UNIQUE**, `status` enum(`pending`,`active`), `invited_at`, `joined_at`

**athlete_sheets** (fiche athlète, champ libre)
- `athlete_id` → profiles, `coach_id` → profiles, `content` text

**exercises** (bibliothèque coach)
- `coach_id`, `title`, `description` text, `category` text

**exercise_documents**
- `exercise_id`, `storage_path`, `file_name`, `mime_type`

**sessions** (modèle de séance)
- `coach_id`, `title`, `notes` text (consignes globales)

**session_exercises** (composition du modèle)
- `session_id`, `exercise_id`, `position` int, `prescription` text

**plans** (planification d'un athlète)
- `coach_id`, `athlete_id`, `title`, `description` text, `start_date`, `status` enum(`draft`,`published`)

**plan_weeks**
- `plan_id`, `week_number` int, `type` enum(`training`,`deload`), `note`

**scheduled_sessions** (instance de séance dans une semaine)
- `plan_id`, `plan_week_id`, `source_session_id` (réf. modèle, nullable), `title`, `scheduled_date` date, `position` int, `status` enum(`planned`,`done`,`skipped`)

**scheduled_session_exercises** (exercices **copiés** en instance, modifiables par le coach)
- `scheduled_session_id`, `exercise_id` (réf. biblio pour les docs), `position`, `prescription` text

**session_feedback** (débrief)
- `scheduled_session_id`, `athlete_id`, `content` text

**feedback_media**
- `session_feedback_id`, `storage_path`, `media_type` enum(`image`,`video`)

**conversations**
- `coach_id`, `athlete_id`, `last_message_at`

**messages**
- `conversation_id`, `sender_id`, `type` enum(`text`,`audio`,`image`,`video`), `content` text (nullable), `storage_path` (nullable), `read_at`

**invoices**
- `coach_id`, `athlete_id`, `period` (ex. `2026-07`), `amount_cents` int, `currency`, `status` enum(`pending`,`paid`), `issued_at`, `due_date`, `paid_at`, `note`

### 8.2 Relations clés
- `coach_athlete.athlete_id` unique → garantit **au plus 1 coach par athlète** (0 ou 1). En MVP, une ligne existe toujours ; en v1.0, son absence = athlète **autonome**.
- `scheduled_session_exercises` est une **copie** des `session_exercises` : modifier une planif n'altère pas la bibliothèque (répond à « modifier un exercice en cours de planif »).
- `session_feedback` rattaché à `scheduled_sessions` → le coach relie débrief et séance prescrite.

> **Athlète autonome (v1.0) — impact modèle.** Les tables de contenu (`exercises`, `sessions`, `plans`…) sont rattachées à un **propriétaire** (en MVP : `coach_id`). Pour l'auto-coaching, l'athlète autonome devient propriétaire de son propre contenu. Concevoir dès le MVP cette propriété comme un **`owner_id` générique** (profil propriétaire) plutôt qu'un `coach_id` strict évite une migration lourde en v1.0. À trancher au moment de poser le schéma Prisma (voir §15).

---

## 9. Sécurité et multi-tenant

L'isolation des données est garantie **à la couche données**, dans l'API NestJS — **pas** par RLS Postgres (tous les accès passent par Prisma, donc l'extension suffit et reste portable).

- **Tenancy guard** (NestJS) : à partir de la session Better Auth, résout l'acteur courant (`User`) et sa relation `CoachAthlete`, puis les injecte dans le contexte de requête.
- **Prisma Client Extension** : applique automatiquement le scope tenant (filtre `where` par coach/athlète) à **toute** requête métier. Aucune query ne s'exécute hors scope.
- **Invariant** : un coach ne lit/écrit que SES athlètes ; un athlète (lié ou autonome) que SES données. Toute nouvelle entité métier doit être rattachée au tenant.
- **Médias** : buckets **privés** en object storage ; accès uniquement via **URLs signées** générées par l'API après contrôle du scope (jamais d'accès direct au bucket).
- **Messagerie** : les conversations sont scopées par la relation ; un utilisateur ne lit que les messages de SES conversations.
- **Tests e2e d'isolation obligatoires** : vérifier qu'un coach A ne peut jamais lire/écrire les données d'un athlète du coach B.

> Décidé dès le départ plutôt que de gérer l'autorisation au cas par cas dans chaque service. Détail dans `architecture-choice.md` §6.

---

## 10. Gestion des médias
- Capture via `expo-camera` / `expo-image-picker`.
- **Compression côté client** avant upload (réduction du coût stockage/bande passante).
- **Plafonds MVP :** vidéo **60 s max**, **720p max**, **~50 Mo max**, **3 vidéos** par débrief ; photos **5 max**, réduites à ~1600 px. Plafonds facilement assouplis ensuite.
- Upload vers l'**object storage S3** (Scaleway en MVP) : bucket **privé**, accès via **URLs signées** délivrées par l'API.
- Vidéos = principal poste de coût : ces plafonds gardent les coûts prévisibles ; bascule vers stockage objet externe + CDN si le volume grandit.

---

## 11. Internationalisation
- Toutes les chaînes UI **externalisées** (`fr.json`) dès le MVP — aucune chaîne en dur.
- `locale` stocké par utilisateur ; détection via `expo-localization`.
- EN activé en v1.0 par simple ajout de `en.json`.
- Prévoir l'impact i18n sur les formats de date et la facturation.

---

## 12. Notifications et offline
- **Notifications push** : `expo-notifications` (clients) + `expo-server-sdk` côté **NestJS**, déclenchées par l'API sur événements métier (nouvelle planif, modif, message, facture).
- **Offline (lecture)** : cache des séances de la semaine via persistance TanStack Query (+ stockage local type MMKV/SQLite). L'écriture (débrief) peut être différée et synchronisée à la reconnexion (amélioration possible post-MVP).

---

## 13. Business model — pistes (hors MVP)
Gratuit au lancement. À structurer ensuite :
- **Abonnement coach** (par nombre d'athlètes).
- **Commission** sur la facturation in-app (nécessite le paiement intégré v1.0).
- **Freemium** (limites de stockage médias, fonctions de suivi avancées).

---

## 14. Risques et points d'attention
- **Coût stockage/bande passante vidéo** (poste n°1).
- **Messagerie** = module le plus complexe du MVP.
- **RGPD / données sensibles** (médias d'entraînement).
- **Adoption** : l'app doit être *au moins aussi simple* que WhatsApp.
- **Dérive de périmètre** : s'en tenir à la roadmap (§4).
- **Montée de version Expo** (3 SDK/an) : prévoir des mises à jour régulières.

---

## 15. Questions ouvertes restantes
- ~~Région d'hébergement~~ → **tranché : France/EU** (Scaleway + Neon EU en MVP gratuit, souveraineté FR via Clever Cloud en v1.0, voir §7.5).
- ~~Limites vidéo MVP~~ → **tranché** : 60 s / 720p / ~50 Mo, 3 vidéos + 5 photos par débrief.
- ~~Débrief par exercice~~ → **tranché** : débrief séance suffit en MVP, par exercice à évaluer plus tard.
- Les données d'entraînement sont-elles qualifiables de **données de santé** (→ obligation HDS) ? À clarifier juridiquement.
- Modèle économique : abonnement vs commission — à trancher avant v1.0.
- **Athlète autonome (v1.0)** : poser la propriété du contenu en `owner_id` générique dès le MVP, ou refactorer à l'arrivée de l'auto-coaching ? À trancher au moment du schéma Prisma (P1).

---

*Document de travail à itérer. Les versions des outils (Expo SDK, NestJS, Prisma, Postgres) évoluant régulièrement, vérifier les dernières versions stables au démarrage du projet.*
