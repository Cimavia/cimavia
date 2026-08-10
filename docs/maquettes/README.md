# Maquettes — cimavia

Maquettes d'écrans produites via **Claude Design** (format `*.dc.html`), track **PD — Maquettage** du plan de dev (`cimavia_dev-plan.html`). Référence visuelle / spec : chaque lot débloque la phase UI correspondante.

## Convention

- Un fichier `*.dc.html` par écran **ou par lot d'écrans** — une planche Claude Design porte souvent
  plusieurs *frames* (`athlete_web.dc.html` en contient 14). Ne pas déduire la couverture du nombre
  de fichiers : elle se lit dans la colonne « Écran » ci-dessous, et dans les commentaires
  `<!-- ===== NOM DE LA FRAME ===== -->` du fichier.
- Rangé par cible : `shared/`, `web-coach/`, `web-athlete/`, `mobile-athlete/`, `mobile-coach/`.
- Garder le nom d'export Claude Design ; le mapping vers la tâche `pd-N` (track PD) ou vers l'issue
  qui l'a commandée se fait dans le tableau ci-dessous.
- Les fichiers `support.js` / `ios-frame.jsx` font partie du **runtime Claude Design** (rendu), pas du produit : non versionnés ici. Ces maquettes servent de **référence**, pas de code à importer tel quel.

## Règles produit à respecter à l'implémentation

- **Tokens** : la palette du design system (accent terracotta `#C2603A`, neutres granite, success/warning/error, radii, spacing) devient la **source de `@cmv/tokens`** (pd-1 → P0-14). Une fois là : **zéro `#xxxxxx` hors tokens**, couleurs via `bg-cmv-*` / `text-cmv-*`.
- **Composants** préfixés `Cmv` (atoms du design system → `CmvButton`, `CmvInput`, `CmvBadge`, `CmvCard`…).
- **i18n** : toute string passe par i18next — les libellés des maquettes sont du français de référence, pas du texte en dur.
- **Nullable** : un champ sans donnée s'affiche `—`, jamais `0`.
- **Termes** : suivre le glossaire (`../CONTEXT.cimavia.md`) — `Plan`/`PlanWeek` (TRAINING/DELOAD), `ScheduledSession`, `SessionFeedback`, `Invoice`…

## Mapping écrans ↔ tâches PD

Le track **PD** couvrait les phases P0→P7. Les maquettes produites ensuite sont rattachées à
l'**issue** qui les a commandées (tableau suivant).

| Fichier | Tâche | Écran | Sert | Statut |
|---|---|---|---|---|
| `shared/design_system.dc.html` | pd-1, pd-2 | Design system (tokens + atoms) | P0-14 | ✅ |
| `mobile-athlete/athlete-planning_semaine.dc.html` | pd-9 | Planning athlète — vue semaine | P3 | ✅ |
| `mobile-athlete/athlete_seance.dc.html` | pd-9 | Détail de séance (à faire / débriefée) + onglet Séances (liste + vide) — entrée du débrief | P3 | ✅ |
| `web-coach/coach_builder_planification.dc.html` | pd-7 | Builder de planification (coach) | P3 | ✅ |
| `shared/auth_onboarding.dc.html` | pd-3 | Auth & onboarding (connexion, inscription, rôle, invitation) + états erreur/chargement | P1 | ✅ |
| `web-coach/coach_dashboard_athletes.dc.html` | pd-4 | Dashboard coach + liste des athlètes (+ vide + skeleton) | P1 | ✅ |
| `web-coach/coach_fiche_athlete.dc.html` | pd-5 | Fiche athlète (AthleteProfile) + note édition/vide | P1 | ✅ |
| `web-coach/coach_bibliotheque.dc.html` | pd-6 | Bibliothèque : Exercise (liste + form) + SessionBuilder + onglet Séances + état vide | P2 | ✅ |
| `web-coach/coach_facturation.dc.html` | pd-8 | Émission & suivi de factures (Invoice) + vide | P6 | ✅ |
| `mobile-athlete/athlete_debrief_seance.dc.html` | pd-10 | Débrief de séance (SessionFeedback + médias) + vide/upload/erreur | P4 | ✅ |
| `mobile-athlete/athlete_factures.dc.html` | pd-11 | Consultation factures (athlète) + détail | P6 | ✅ |
| `shared/conversation_1_1.dc.html` | pd-12 | Conversation 1:1 web + mobile, Composer texte/audio/médias + états vides + message non envoyé/hors-ligne | P5 | ✅ |
| `mobile-athlete/athlete_profile.dc.html` | pd-13 | Profil athlète (accès factures, mon coach, compte, langue, déconnexion) | P1 | ✅ |

## Mapping écrans ↔ issues (post-PD)

| Fichier | Issue | Écran (frames) | Sert | Statut |
|---|---|---|---|---|
| `web-athlete/athlete_web.dc.html` | [#21](https://github.com/Cimavia/cimavia/issues/21) [#22](https://github.com/Cimavia/cimavia/issues/22) | **14 frames** — planning semaine (+ vide), **séances liste (+ vide)**, détail de séance, débrief (vide / upload / limite atteinte), factures (liste / détail / vide), mon coach (lié / aucun coach / code invalide) | [#25](https://github.com/Cimavia/cimavia/issues/25) [#26](https://github.com/Cimavia/cimavia/issues/26) [#27](https://github.com/Cimavia/cimavia/issues/27) [#28](https://github.com/Cimavia/cimavia/issues/28) | ✅ |
| `mobile-coach/coach_mobile.dc.html` | [#23](https://github.com/Cimavia/cimavia/issues/23) [#24](https://github.com/Cimavia/cimavia/issues/24) | **11 frames** — dashboard, liste des athlètes, fiche athlète (+ note vide / édition), invitation, facturation (liste / détail), débriefs à relire (liste / détail / vide) | [#30](https://github.com/Cimavia/cimavia/issues/30) [#31](https://github.com/Cimavia/cimavia/issues/31) [#32](https://github.com/Cimavia/cimavia/issues/32) [#33](https://github.com/Cimavia/cimavia/issues/33) | ✅ |
| `shared/messagerie_web_athlete_mobile_coach.dc.html` | [#20](https://github.com/Cimavia/cimavia/issues/20) | **6 frames** — les deux combinaisons que `conversation_1_1.dc.html` ne couvrait **pas** : web × athlète (fil unique / fil vide / aucun coach) et mobile × coach (liste des fils / liste vide / fil ouvert) | [#29](https://github.com/Cimavia/cimavia/issues/29) [#34](https://github.com/Cimavia/cimavia/issues/34) | ✅ |
| `shared/design_system_white.dc.html` | [#1](https://github.com/Cimavia/cimavia/issues/1) | Design system en thème **clair** (couleurs, typo, composants, radii/spacing) | thème clair (v1.0) | ⏳ |
| `web-coach/coach_debrief.dc.html` | — | Débriefs coach sur **web** : boîte de réception (liste + volet de lecture) + état vide | refonte de `/feedbacks` — **non planifiée** | ⏳ |

⏳ = maquette produite, écran pas encore implémenté (ou refonte pas encore planifiée).

## Écarts MVP repérés dans les maquettes (à trancher avant implémentation)

Les maquettes anticipent quelques éléments **hors périmètre MVP** (cf. `cahier-des-charges-mvp.md` §4). À garder en tête ou à simplifier :

- **pd-11 (factures athlète)** : bouton « Régler · CB/virement » ⇒ **paiement intégré = v1.0** (MVP = paiement externe, l'athlète *consulte* seulement). À retirer/désactiver en MVP.
- **pd-12 (messagerie)** : indicateur de **frappe** + statut **« en ligne »** ⇒ **temps réel = v2** (MVP = async polling/push). Les accusés de lecture (✓✓) sont OK (`read_at` au modèle).
- **pd-5 (fiche athlète)** : la fiche MVP = **un champ texte libre** (`AthleteProfile.content`). Les **stats agrégées** (assiduité %, volume), le **niveau structuré** et les **documents attachés à l'athlète** sont post-MVP (suivi/analyse = v1.x). L'éditeur riche (gras/italique/liste) dépasse le « texte libre » — OK si rendu en markdown léger.
- **pd-8 (facturation)** : le modèle MVP = **montant unique** + statut `pending/paid`. Les **lignes multiples**, le statut **brouillon**, l'**export** et l'**envoi par e-mail** dépassent le minimal — décider de les inclure ou non en MVP. « En retard » = statut **dérivé** (pending + échéance passée), pas un 3ᵉ statut stocké.

### Écarts des maquettes post-PD (#20)

- **`athlete_web.dc.html` / `coach_mobile.dc.html` — numéro de facture et lignes de détail** :
  les deux planches affichent `N° F-2025-012` et un tableau « Détail / Total ». `InvoiceDto` n'a
  **ni numéro ni lignes** (`id`, `period`, `amountCents`, `dueDate`, `note`, `documentUrl`). Non
  rendable sans changement backend, que #20 exclut.
- **`athlete_web.dc.html` — durée de séance** (« 75 min ») sur le planning : donnée inexistante,
  dette **P3-5** / [#94](https://github.com/Cimavia/cimavia/issues/94). Les frames `SÉANCES`
  ajoutées ensuite s'en passent (nombre d'exercices) — c'est la forme à suivre.
- **`coach_mobile.dc.html` — données sans source** : « Séances / semaine 42 » et « Encaissé
  1 080 € » (agrégats sans endpoint, famille **D-1** / [#114](https://github.com/Cimavia/cimavia/issues/114)) ;
  « Inactive · 12 j » et la recherche/filtres d'athlètes (tranchés en
  [#113](https://github.com/Cimavia/cimavia/issues/113), suivis par
  [#123](https://github.com/Cimavia/cimavia/issues/123)) ; badge de relation « En attente »
  (`CoachAthleteStatus.PENDING` n'est **jamais écrit**) ; sous-titre « 7b bloc » (`AthleteSheetDto`
  n'a qu'un `content` libre).
- **`coach_mobile.dc.html` — bottom nav à 4 onglets** (Athlètes · Messages · Factures · Profil) :
  **pas d'onglet Notifications**, alors que le centre est la seule surface où le coach voit ses
  `REMINDER_DUE`. Écart assumé à l'implémentation — le coach reçoit le même onglet que l'athlète.
- **`messagerie_…dc.html` (frame D) — aperçu préfixé « Vous : »** sur un dernier message sortant :
  `ConversationDto` ne porte pas l'auteur du dernier message (`lastMessageAt`, `lastMessageType`,
  `lastMessagePreview`, `unreadCount`). Non rendable sans changement backend.
- **`messagerie_…dc.html` (frame D) — barre « Rechercher un athlète… »** : même famille que
  [#123](https://github.com/Cimavia/cimavia/issues/123). À trancher à l'implémentation de #34.
- **`coach_debrief.dc.html` — sidebar périmée** : première entrée « Athlètes » alors que
  `/athletes` a été **supprimée** en [#113](https://github.com/Cimavia/cimavia/issues/113) (le
  tableau vit sur `/`), et pas d'entrée « Rappels ». La sidebar de référence est celle du code
  (`CmvAppShell`), pas celle de cette planche.
- **`coach_debrief.dc.html` — répondre depuis le volet de lecture** : `SessionFeedback` n'a **pas**
  de réponse au modèle ; le coach répond aujourd'hui par la messagerie. C'est une **fonctionnalité
  nouvelle**, pas un rendu — à cadrer avant toute implémentation.
