# Maquettes — cimavia

Maquettes d'écrans produites via **Claude Design** (format `*.dc.html`), track **PD — Maquettage** du plan de dev (`cimavia_dev-plan.html`). Référence visuelle / spec : chaque lot débloque la phase UI correspondante.

## Convention

- Un fichier `*.dc.html` par écran, rangé par cible (`shared/`, `web-coach/`, `mobile-athlete/`).
- Garder le nom d'export Claude Design ; le mapping vers la tâche `pd-N` se fait dans le tableau ci-dessous.
- Les fichiers `support.js` / `ios-frame.jsx` font partie du **runtime Claude Design** (rendu), pas du produit : non versionnés ici. Ces maquettes servent de **référence**, pas de code à importer tel quel.

## Règles produit à respecter à l'implémentation

- **Tokens** : la palette du design system (accent terracotta `#C2603A`, neutres granite, success/warning/error, radii, spacing) devient la **source de `@cmv/tokens`** (pd-1 → P0-14). Une fois là : **zéro `#xxxxxx` hors tokens**, couleurs via `bg-cmv-*` / `text-cmv-*`.
- **Composants** préfixés `Cmv` (atoms du design system → `CmvButton`, `CmvInput`, `CmvBadge`, `CmvCard`…).
- **i18n** : toute string passe par i18next — les libellés des maquettes sont du français de référence, pas du texte en dur.
- **Nullable** : un champ sans donnée s'affiche `—`, jamais `0`.
- **Termes** : suivre le glossaire (`../CONTEXT.cimavia.md`) — `Plan`/`PlanWeek` (TRAINING/DELOAD), `ScheduledSession`, `SessionFeedback`, `Invoice`…

## Mapping écrans ↔ tâches PD

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

## Écarts MVP repérés dans les maquettes (à trancher avant implémentation)

Les maquettes anticipent quelques éléments **hors périmètre MVP** (cf. `cahier-des-charges-mvp.md` §4). À garder en tête ou à simplifier :

- **pd-11 (factures athlète)** : bouton « Régler · CB/virement » ⇒ **paiement intégré = v1.0** (MVP = paiement externe, l'athlète *consulte* seulement). À retirer/désactiver en MVP.
- **pd-12 (messagerie)** : indicateur de **frappe** + statut **« en ligne »** ⇒ **temps réel = v2** (MVP = async polling/push). Les accusés de lecture (✓✓) sont OK (`read_at` au modèle).
- **pd-5 (fiche athlète)** : la fiche MVP = **un champ texte libre** (`AthleteProfile.content`). Les **stats agrégées** (assiduité %, volume), le **niveau structuré** et les **documents attachés à l'athlète** sont post-MVP (suivi/analyse = v1.x). L'éditeur riche (gras/italique/liste) dépasse le « texte libre » — OK si rendu en markdown léger.
- **pd-8 (facturation)** : le modèle MVP = **montant unique** + statut `pending/paid`. Les **lignes multiples**, le statut **brouillon**, l'**export** et l'**envoi par e-mail** dépassent le minimal — décider de les inclure ou non en MVP. « En retard » = statut **dérivé** (pending + échéance passée), pas un 3ᵉ statut stocké.
