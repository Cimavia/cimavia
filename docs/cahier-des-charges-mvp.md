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
- Un athlète a **un seul coach** (contrainte d'unicité en base).
- Un coach a **N athlètes**.
- **Les deux rôles accèdent aux deux clients** (web et mobile) — l'usage diffère, pas les droits d'accès aux plateformes.

---

## 4. Roadmap des fonctionnalités (priorisation par version)

Légende : **MVP** = première version livrable · **v1.0** = première version "produit" · **v1.x / v2** = consolidation · **Vision LT** = très long terme.

| Fonctionnalité | Version | Notes |
|----------------|---------|-------|
| Comptes, rôles, connexion | MVP | email + mot de passe |
| Liaison coach ↔ athlète (invitation) | MVP | 1 coach par athlète |
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
- Inscription / connexion email + mot de passe (OAuth en option v1.0).
- Rôle attribué à l'inscription (coach / athlète).
- Liaison : le coach invite (lien ou code), l'athlète rejoint → relation unique.

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
- **Asynchrone** : pas de temps réel strict ; les nouveaux messages remontent via notification + rafraîchissement live (websocket Supabase).

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
| **Sécurité** | Auth robuste, HTTPS, médias chiffrés au repos, isolation des données par RLS. |
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
- **Une base de code front unique, universelle** (web + iOS + Android), un seul **back-end managé**.
- Pas de serveur applicatif custom à maintenir : la logique d'accès aux données passe par l'API auto-générée + la sécurité au niveau base.

```
┌──────────────────────────────────────────┐
│  App universelle Expo (TypeScript/React)  │
│  Web (coach+athlète) │ iOS │ Android       │
└───────────────┬──────────────────────────┘
                │  SDK Supabase (REST/Realtime/Storage/Auth)
┌───────────────▼──────────────────────────┐
│  Supabase                                 │
│  Postgres + RLS │ Auth │ Storage │ Realtime│
│  Edge Functions (notifs, logique serveur) │
└───────────────────────────────────────────┘
```

### 7.2 Stack proposée (et justification)

| Couche | Choix | Pourquoi |
|--------|-------|----------|
| Front (web+mobile) | **Expo / React Native** (SDK 56, RN 0.85 — *vérifier la dernière version stable au démarrage, sortie 3×/an*) | Universel par défaut : **une base de code** → iOS, Android, web. Idéal pour un dev solo qui doit livrer les 2 clients pour les 2 rôles. |
| Routing | **Expo Router** (file-based, universel) | Mêmes routes sur web et natif, moins de code spécifique plateforme. |
| Langage | **TypeScript** | Typage partagé front ↔ schéma DB (types générés depuis Supabase). |
| Données serveur | **TanStack Query** | Cache, synchro, support offline du cache. |
| État local léger | **Zustand** | Simple, sans boilerplate. |
| Back-end | **Supabase** (Postgres 17, Auth, Storage, Realtime, Edge Functions) | BaaS complet : pas de serveur à écrire, **RLS** pour le multi-tenant, websockets pour la messagerie, storage pour les médias. Free tier généreux pour démarrer (≈ 500 Mo DB, 1 Go storage, 50k utilisateurs actifs/mois — à confirmer). |
| Médias | **Supabase Storage** (compatible S3, sécurisé par RLS, transformation d'images) | Suffisant en MVP. Prévoir bascule vers stockage objet externe (ex. R2/S3) si le volume vidéo explose. |
| Auth | **Supabase Auth** (email/mot de passe ; OAuth/passkeys plus tard) | Intégré au RLS via `auth.uid()`. |
| Notifications | **expo-notifications** + Edge Functions Supabase (déclenchées par triggers DB) | Push natif + web. |
| i18n | **i18next** + `expo-localization` | Chaînes externalisées, FR puis EN. |
| Hébergement | **Supabase Cloud — région Europe (Paris)** en MVP ; option d'auto-hébergement sur cloud souverain FR (Scaleway/OVHcloud/Clever Cloud) en v1.0 | Données en France dès le MVP ; bascule souveraine possible car Supabase est open-source (voir §7.5). |
| Paiement (v1.0) | **Stripe** (Connect si reversement au coach) | Standard, bien documenté. |

> Alternative back-end : back-end custom (Node/NestJS + Postgres + S3). Plus de contrôle mais **beaucoup** plus de travail pour un dev solo. Non recommandé en MVP.

### 7.3 Structure de projet (proposée)
Application Expo universelle unique (le plus simple à maintenir en solo) :

```
app/                    # routes Expo Router (universel)
  (auth)/               # connexion, inscription
  (coach)/              # espaces coach (exercices, séances, planifs, facturation, athlètes)
  (athlete)/            # espaces athlète (planning, débrief, factures)
  (shared)/             # messagerie, profil
components/             # UI réutilisable
lib/
  supabase.ts           # client Supabase
  queries/              # hooks TanStack Query
  i18n/                 # fr.json, en.json
types/
  database.types.ts     # types générés depuis Supabase
supabase/
  migrations/           # SQL versionné (schéma + RLS)
  functions/            # Edge Functions (notifications…)
```

L'affichage est conditionné par le **rôle** (`profiles.role`), pas par la plateforme : le même code sert web et mobile.

### 7.4 Environnements
- **local** (Supabase CLI + Postgres local), **staging**, **production**.
- Schéma et policies RLS versionnés dans `supabase/migrations` (jamais de modif manuelle non versionnée en prod).

### 7.5 Hébergement français : résidence vs souveraineté
Deux niveaux à ne pas confondre :

- **Résidence (MVP) :** Supabase Cloud, **région Europe (Paris)**. Données physiquement en France, RGPD respecté, démarrage immédiat. *Limite :* Supabase Inc. est une société US et l'infra est AWS → résidence française mais pas souveraineté stricte (exposition Cloud Act / Schrems II).
- **Souveraineté (v1.0, si argument commercial) :** auto-héberger Supabase (open-source) sur un **cloud souverain français** — Scaleway, OVHcloud ou Clever Cloud. Le client `supabase-js` est inchangé, seule l'URL pointe vers l'instance auto-hébergée ; la migration est mécaniquement propre. *Coût :* exploitation à ta charge (sauvegardes, mises à jour, TLS, SMTP, stockage).

**Décision :** démarrer en région Paris, **concevoir portable** (pas de dépendance à une fonctionnalité propriétaire Supabase Cloud) pour pouvoir basculer vers un hébergeur souverain FR sans réécriture.

**Caveat HDS :** si les données d'entraînement sont qualifiées de données de santé, l'hébergement devra être **HDS** (OVHcloud et Scaleway proposent des offres certifiées).

---

## 8. Modèle de données (détaillé)

> Convention : `id uuid` (PK), `created_at`/`updated_at timestamptz`. Toutes les tables ont la **RLS activée**.

### 8.1 Tables

**profiles** (miroir de `auth.users`)
- `id` (= auth.users.id), `role` enum(`coach`,`athlete`,`admin`), `full_name`, `avatar_url`, `locale` (`fr`/`en`)

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
- `coach_athlete.athlete_id` unique → garantit **1 coach par athlète**.
- `scheduled_session_exercises` est une **copie** des `session_exercises` : modifier une planif n'altère pas la bibliothèque (répond à « modifier un exercice en cours de planif »).
- `session_feedback` rattaché à `scheduled_sessions` → le coach relie débrief et séance prescrite.

---

## 9. Sécurité et multi-tenant (RLS)

La séparation des données repose entièrement sur la **Row Level Security** Postgres, combinée à Supabase Auth (`auth.uid()`). Principe : **activer RLS sur chaque table** et n'autoriser que les lignes liées à l'utilisateur.

Exemples de politiques (illustratif, à finaliser) :

```sql
-- Un athlète lit ses propres débriefs ; son coach aussi.
create policy "feedback_select"
on session_feedback for select
using (
  athlete_id = auth.uid()
  or exists (
    select 1 from coach_athlete ca
    where ca.athlete_id = session_feedback.athlete_id
      and ca.coach_id = auth.uid()
      and ca.status = 'active'
  )
);

-- Seul l'athlète concerné insère son débrief.
create policy "feedback_insert"
on session_feedback for insert
with check (athlete_id = auth.uid());
```

Points d'attention :
- Le **Storage** s'appuie aussi sur RLS (politiques sur `storage.objects`) : un athlète n'accède qu'à ses médias et ceux que son coach lui partage.
- Le **Realtime** (messagerie) respecte les policies SELECT : un utilisateur ne reçoit en live que les messages de ses conversations.
- Ne jamais exposer la `service_role` côté client (elle contourne la RLS).
- Adopter RLS **dès le départ** plutôt que de gérer l'autorisation dans le code applicatif.

---

## 10. Gestion des médias
- Capture via `expo-camera` / `expo-image-picker`.
- **Compression côté client** avant upload (réduction du coût stockage/bande passante).
- **Plafonds MVP :** vidéo **60 s max**, **720p max**, **~50 Mo max**, **3 vidéos** par débrief ; photos **5 max**, réduites à ~1600 px. Plafonds facilement assouplis ensuite.
- Upload vers Supabase Storage (bucket privé, accès via RLS / URLs signées).
- Vidéos = principal poste de coût : ces plafonds gardent les coûts prévisibles ; bascule vers stockage objet externe + CDN si le volume grandit.

---

## 11. Internationalisation
- Toutes les chaînes UI **externalisées** (`fr.json`) dès le MVP — aucune chaîne en dur.
- `locale` stocké par utilisateur ; détection via `expo-localization`.
- EN activé en v1.0 par simple ajout de `en.json`.
- Prévoir l'impact i18n sur les formats de date et la facturation.

---

## 12. Notifications et offline
- **Notifications push** (`expo-notifications`) déclenchées par des Edge Functions sur événements DB (nouvelle planif, modif, message, facture).
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
- ~~Région d'hébergement~~ → **tranché : France** (région Paris en MVP, souveraineté FR visée en v1.0, voir §7.5).
- ~~Limites vidéo MVP~~ → **tranché** : 60 s / 720p / ~50 Mo, 3 vidéos + 5 photos par débrief.
- ~~Débrief par exercice~~ → **tranché** : débrief séance suffit en MVP, par exercice à évaluer plus tard.
- Les données d'entraînement sont-elles qualifiables de **données de santé** (→ obligation HDS) ? À clarifier juridiquement.
- Modèle économique : abonnement vs commission — à trancher avant v1.0.

---

*Document de travail à itérer. Les versions des outils (Expo SDK, Postgres, Supabase) évoluant régulièrement, vérifier les dernières versions stables au démarrage du projet.*
