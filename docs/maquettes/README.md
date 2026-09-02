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
| `web-coach/coach_debrief.dc.html` | [#121](https://github.com/Cimavia/cimavia/issues/121) | Débriefs coach sur **web** : boîte de réception (liste + volet de lecture) + état vide | refonte de `/feedbacks` | ✅ *(le composer de réponse arrive avec [#193](https://github.com/Cimavia/cimavia/issues/193))* |
| `web-coach/coach_constructeur_exercice.dc.html` | — | **15 frames** — refonte du constructeur d'exercice (pleine page, aperçu athlète sticky) : état initial, les 5 types de structure, les 2 raccourcis, plusieurs blocs, saisie en grille, sélecteur de métriques, éditeur de consigne riche, insertion d'image, édition, validation | refonte de `ExerciseForm` — **non planifiée**, cf. section dédiée ci-dessous | ⏳ |
| `web-coach/coach_constructeur_seance.dc.html` | — | **10 frames** — refonte du constructeur de séance (pleine page, aperçu athlète = la séance entière) : séance vide, séance composée, exercice hérité / surchargé, exercice à plusieurs blocs, sélecteur de bibliothèque, notes, aperçu athlète mobile, niveau planification, validation | refonte de `SessionBuilder` — **non planifiée**, cf. section dédiée ci-dessous | ⏳ |
| `mobile-athlete/athlete_seance_lecture.dc.html` | — | **13 écrans** — refonte du détail de séance côté athlète, volet **lecture** : séance du jour, consigne dépliée, image (+ chargement), grilles à 2 / 3 / 4 colonnes avec l'encart du seuil, EMOM · AMRAP · Libre, exercice à plusieurs blocs, pièces jointes, fin de séance, séance à venir / débriefée / hors ligne | refonte de `athlete_seance.dc.html` (pd-9) — **non planifiée**, cf. section dédiée ci-dessous | ⏳ |
| `mobile-athlete/athlete_timers_suivi.dc.html` | — | **10 écrans** — même écran, volet **exécution** : séance en cours, cocher les séries d'un bloc groupé, repos en bandeau / agrandi, effort-repos alterné, EMOM, AMRAP, notification sur écran verrouillé, débrief avec décompte, encart des trois états | **fonctionnalité nouvelle** (timers + suivi) — cf. section dédiée ci-dessous | ⏳ |
| `web-athlete/athlete_seance_web.dc.html` | — | **7 frames** — le même écran côté web, avec rail de droite : détail de séance (consignes dépliées, cases visibles), grilles à 2 et 4 colonnes, exercice à plusieurs blocs + pièces jointes, suivi en cours, débrief, séance à venir, séance déjà débriefée | refonte du détail de séance de `athlete_web.dc.html` — **non planifiée**, cf. section dédiée ci-dessous | ⏳ |
| `shared/coach_athlete_etats_vides.dc.html` | — | **11 écrans** — les vides que la refonte fait apparaître, sur les deux plateformes : bibliothèque vide, onglet Séances vide, grille sans ligne, exercice sans structure, recherche sans résultat · aucune séance, séance sans exercice, exercice sans consigne, amorçage du suivi · aucune séance et débrief vide côté web | **non planifiée**, cf. section dédiée ci-dessous | ⏳ |

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
- **`coach_mobile.dc.html` — pas d'écran de détail de facture** : la maquette en prévoit un, la
  carte de la liste affiche déjà tout ce qu'il montrerait (montant, période, échéance, note,
  justificatif, statut). Le web coach fonctionne à l'identique — liste de cartes, actions sur la
  carte. La planche a été dessinée avant que ce motif se fixe.
- **`coach_mobile.dc.html` — pas d'onglet « Débriefs »** : la barre en compte quatre, et les
  débriefs s'atteignent par la tuile du tableau de bord (comme la maquette le montre). En revanche
  l'onglet **Notifications** a été AJOUTÉ, absent de la planche : c'est la seule surface où le coach
  voit ses `REMINDER_DUE`.
- **`coach_mobile.dc.html` — invitation partagée, pas copiée** : la planche a « Copier le code »,
  l'implémentation propose « Partager » (`Share` de React Native). `expo-clipboard` n'est pas une
  dépendance du projet, et partager couvre mieux le cas réel (SMS, WhatsApp). Dette **M-5**.
- ~~**`coach_debrief.dc.html` — répondre depuis le volet de lecture**~~ : **levé en #193**. La
  réponse existe, sous la forme d'un `Message` rattaché au débrief (`Message.sessionFeedbackId`,
  déjà au schéma et déjà validé côté serveur depuis P5 — il n'avait simplement aucune UI). Le
  composer de la planche est implémenté. Trois écarts subsistent, **dans le sens du « plus »** :
  la planche n'a qu'un composer TEXTE, ne montre aucune réponse déjà envoyée, et n'a pas de badge
  « répondu » sur les lignes de la liste — l'implémentation ajoute les médias et la note vocale
  (le `Composer` de la messagerie, réutilisé tel quel), le fil des réponses, et le badge.

## Constructeur d'exercice — modèle et changements requis

`coach_constructeur_exercice.dc.html` n'est **pas** un rendu du modèle actuel : c'est une refonte
qui suppose six changements backend. Aucun n'est planifié. Le modèle retenu, en bref :

Un exercice = titre + **tags** + **consigne riche** + **N blocs de structure ordonnés**. Chaque bloc
porte un type, ses **paramètres de structure** (bandeau, propres au type), ses **métriques**
(colonnes, propres au bloc) et ses **lignes**. Cinq types — Séries · EMOM · AMRAP · Circuit · Libre
— et deux **raccourcis** de saisie (Pyramide, Intervalles) qui ne sont pas des types : ils génèrent
des Séries. Une colonne dont toutes les valeurs sont identiques se **replie en valeur commune** dans
le bandeau et se redéploie à la demande — c'est un état d'affichage, pas une nature de donnée.

1. **`ExerciseCategory` (enum `RENFO`/`GRIMPE`/`TECHNIQUE`) disparaît** au profit de **tags libres**
   avec autocomplétion. Migration : les trois valeurs deviennent des tags.
2. **`Exercise.description: String` devient un document structuré** (JSON de blocs typés, validé par
   Zod dans `@cmv/shared`) — titres de section, listes, encadré neutre, images, liens. Rendu natif
   attendu côté web ET React Native : **pas de HTML**, pas de WebView.
   L'**encadré** à barre accent a son type de bloc — `callout`, **un seul**, sans variante de
   couleur : trois encadrés colorés feraient rentrer par la fenêtre la coloration de texte qu'on a
   écartée. Il est rendu sur les trois surfaces mais n'était créable nulle part — la barre compte
   désormais neuf outils : B · I · U │ Titre │ liste à puces · liste numérotée │ **encadré** ·
   image · lien. Un bouton s'allume quand le curseur est dans le bloc correspondant : la planche le
   montre pour l'image (frame 13), pas encore pour l'encadré (frame 12).
3. **Les images de la consigne sont stockées par RÉFÉRENCE**, jamais par URL : les URLs S3 sont
   signées et expirent (règle dure n°7). Le document porte l'id du média, résolu à l'affichage.
4. **Nouveaux modèles** : bloc de structure (ordonné, type, libellé optionnel), métriques du bloc
   (ordonnées — l'ordre est celui des colonnes), lignes et leurs valeurs. Une valeur absente reste
   `null` — l'affichage rend « — ».
5. **Échelles ordonnées définies par le coach** : la métrique personnalisée a un *type de valeur*
   (nombre · durée · texte · **échelle ordonnée**). Les cotations livrées (française, V) sont des
   échelles pré-remplies duplicables, pas des constantes — c'est l'ordre des paliers qui rend
   possible « progression sur l'échelle ».
6. **Snapshot P3** : `ScheduledSessionExercise` doit copier la **liste ordonnée de blocs** et les
   **références d'images** de la consigne, comme il copie déjà les documents (même clé objet, aucun
   binaire dupliqué). Sans ça, une planif diffusée se dégrade.

Donnée sans source, comme la famille **D-1** : le bandeau « **Utilisé dans 3 séances actives** » de
la frame d'édition — `ExerciseDto` ne porte aucun compteur d'usage.

L'aperçu athlète du constructeur est en **lecture seule** : le coach ne configure ni les timers ni le
suivi d'exécution, ils découlent des valeurs qu'il saisit (cf. section athlète ci-dessous). Rien ne
doit y laisser croire qu'il les paramètre.

## Constructeur de séance — le dosage à trois niveaux

`coach_constructeur_seance.dc.html` suppose la refonte de l'exercice ci-dessus : à lire après elle.
La règle qui structure tout l'écran :

    EXERCICE (bibliothèque)   le défaut, valable partout
    SÉANCE                    ajusté pour cette séance-type
    SÉANCE PLANIFIÉE          ajusté pour UN athlète, une semaine donnée

Chaque niveau part du précédent. Une valeur modifiée est marquée — **rond accent** au niveau séance,
**carré info** au niveau planifié — avec « Revenir au défaut » sur la ligne et « Tout réinitialiser »
sur l'exercice. La forme distingue les deux niveaux autant que la couleur : les deux marqueurs
peuvent coexister sur la même grille.

Décisions tranchées pendant la conception, que le code ne justifierait pas seul :

1. **Sont VERROUILLÉS au niveau séance** : le type de structure, le jeu de métriques (donc les
   colonnes), le nombre de blocs et leurs libellés, la consigne. Restent modifiables : les valeurs
   des cellules, les paramètres du bandeau, le nombre de lignes. Pour changer le reste, le coach
   passe par « Dupliquer en variante » dans la bibliothèque. Sans ce verrou, le SessionBuilder
   redevient le constructeur et la notion de défaut se dilue.
2. **Une séance est indépendante une fois composée** : les valeurs sont **copiées à l'ajout**.
   Modifier un exercice dans la bibliothèque ne touche aucune séance existante, et la séance ne
   détecte pas ce changement — pas d'empreinte de version à mémoriser ni à comparer. Le coach qui
   veut la nouveauté déclenche **« Recharger depuis la bibliothèque »** (menu de la carte), qui
   relit l'exercice tel qu'il est aujourd'hui et écrase la carte en place, après confirmation.
   À ne pas confondre avec « Tout réinitialiser », qui revient aux valeurs copiées à l'ajout.
3. **Chaque valeur stockée porte un marqueur héritée / ajustée.** Nécessaire au marquage comme à
   « Revenir au défaut » : le stockage n'est donc pas une copie plate des valeurs.

Changements requis, aucun planifié :

- **`SessionExercise.prescription: String?`** (texte libre, `SESSION_PRESCRIPTION_MAX_LENGTH`)
  devient une **structure de valeurs surchargées** alignée sur les blocs de l'exercice. La **note
  par exercice** — le contexte que la grille ne dit pas — reste un champ texte distinct.
- **`ScheduledSessionExercise`** porte la même structure pour le troisième niveau, en plus du
  snapshot déjà requis par la refonte de l'exercice.
- **`SessionExerciseDto`** expose aujourd'hui `title` + `category` : `category` suit la migration
  vers les tags.

Écart de token à corriger à l'implémentation : les lignes sélectionnées du sélecteur d'exercice
utilisent `rgba(194,96,58,.1)` au lieu de `accent.soft` (`.16`).

L'aperçu athlète du SessionBuilder reste en lecture seule, pour la même raison que ci-dessus. La
durée estimée de séance a été **retirée** — elle n'a aucune source et son calcul n'a pas de réponse
pour un AMRAP ou un exercice « au ressenti » (même famille que **P3-5** /
[#94](https://github.com/Cimavia/cimavia/issues/94)).

## Séance côté athlète — lecture, puis exécution

`athlete_seance_lecture.dc.html` et `athlete_timers_suivi.dc.html` sont **deux volets du même
écran** : la première dit comment la séance se lit, la seconde ce qui se passe pendant qu'on la
fait. `athlete_seance_web.dc.html` porte le même écran sur grand écran : les règles ci-dessous
valent pour les deux plateformes, sauf mention contraire. Les trois supposent les deux refontes
ci-dessus et se lisent après elles.

### Volet lecture — le seuil de colonnes

La règle centrale, chiffrée sur la planche : 402 px moins les marges laissent 362 px utiles, une
colonne de valeur en mono demande 90 px, l'index 28 px.

    1 ligne            →  une PHRASE, quel que soit le nombre de colonnes
    2 à 3 colonnes     →  mini-tableau, les valeurs s'alignent
    4 colonnes et plus →  une carte par ligne

**Jamais de scroll horizontal** : inutilisable une main sur la barre. Les frames à 3 et 4 colonnes
montrent le MÊME exercice — c'est l'ajout d'une colonne qui fait basculer la forme.

### Volet exécution — timers et suivi

**Décision de périmètre** : cette planche RENVERSE la règle « l'athlète lit, il ne coche rien » qui
tenait jusque-là. Validée explicitement. Elle touche la zone que `CLAUDE.md` garde hors MVP (*débrief
par exercice*) : ce n'est pas un ressenti par exercice, seulement un décompte, mais ça ouvre la même
porte et ajoute un modèle, des endpoints et de la synchronisation.

1. **Le timer ne demande AUCUNE donnée nouvelle** — il joue les durées déjà saisies par le coach et
   sa forme découle du type de structure : Séries → repos ; durée d'effort → alternance effort /
   repos ; EMOM → top chaque intervalle ; AMRAP → compte à rebours ; Circuit → repos entre tours ;
   Libre → aucun timer imposé. Règle générale : **toute durée affichée est lançable d'un tap**, le
   chiffre EST le bouton. Le timer ne démarre jamais seul.
2. **Le suivi ne suit pas le groupement du coach.** Un bloc écrit « ×4 séries » n'a qu'une ligne
   dans la grille : côté athlète il faut QUATRE cases. L'unité est nommée par type — séries, tops,
   tours, étapes — et l'AMRAP se compte au lieu de se cocher (l'objectif est indicatif).
3. **Ne rien cocher ≠ ne rien faire.** Trois états : *tout terminé* · *X sur Y* · *non suivi*. Le
   troisième est SILENCIEUX — jamais « 0 sur 4 », jamais de rouge, jamais de relance.
4. **Le suivi vit en LOCAL** (l'athlète est souvent sans réseau en salle) et ne remonte au serveur
   qu'avec le débrief. Il informe le débrief en lecture seule, corrigeable d'un tap — il ne le
   remplit pas.
5. **Notification locale + vibration** à la fin d'un timer : le cas d'usage réel est téléphone en
   poche, et on n'entend rien en salle. `expo-server-sdk` / `expo-notifications` sont déjà au stack.
6. **Le bandeau plutôt que le plein écran** pour le repos : c'est le moment où l'athlète relit la
   consigne suivante. Il porte le temps, la pause et « Passer » ; « + 30 s » vit dans l'agrandi.
7. La barre de progression montre le **temps restant**, elle se vide.

### Volet web — les mêmes règles, quatre décisions propres

`athlete_seance_web.dc.html` porte le même écran sur grand écran, avec un rail de droite :
sommaire qui suit le défilement, progression, note du coach, bouton de débrief collé en bas.

1. **Le seuil de colonnes est une spécificité MOBILE.** Le web garde le tableau aligné quel que
   soit le nombre de colonnes — quatre s'y lisent sans peine. Les deux planches montrent le même
   exercice pour que l'écart soit visible.
2. **Les cases sont toujours affichées**, sans bascule ni écran séparé. L'ordre dans un exercice :
   titre · dosage · grille · cases · lien de consigne · consigne. Le mobile, lui, les ouvre par
   « Suivre mes séries » — la place n'y est pas.
3. **Un seul compteur, porté par le rail.** L'en-tête ne compte rien (« Mardi 18 août · 4
   exercices », toujours) ; la progression vit dans le rail et nulle part ailleurs.
4. **Pas de note vocale sur web** : le débrief y accepte photos et vidéos, l'audio reste mobile —
   `feedback.schema.ts` n'admet que m4a/mp4/aac, pas le webm d'un enregistrement navigateur. Les
   plafonds affichés viennent du schéma : 5 photos (JPEG/PNG/WebP), 3 vidéos (MP4/MOV) de 3 min.

Deux états que le mobile ne montre pas : la séance **à venir** n'affiche aucune case (le suivi
s'ouvre le jour venu, le bouton de débrief est désactivé et daté) ; la séance **débriefée** garde
ses cases visibles mais **figées** — « le suivi reste consultable, il ne se modifie plus ».

### Changements requis

- **Nouveau modèle de suivi d'exécution** rattaché à `ScheduledSession` : par exercice et par unité,
  l'état coché / non coché, avec la distinction *non suivi* qui n'est PAS « zéro ».
- **`SessionFeedback`** reçoit le décompte au moment de l'envoi. Le ressenti textuel reste ce qu'il
  est ; le décompte l'accompagne sans le remplacer.
- **Stockage local** puis remontée à l'envoi du débrief — pas de synchronisation temps réel.
- **Un token typographique `chrono`** (96 px) à ajouter à l'échelle de `@cmv/tokens`, qui s'arrête
  aujourd'hui à 40 px. Le compteur de tours utilise `cmv-display` (40) et le bandeau `cmv-title` (24).

### Écarts et points d'attention

- Le lien de la liste dit **« Suivre mes séries » sur tous les exercices**, alors que la planche pose
  elle-même que l'unité est nommée. À l'implémentation : *mes séries · mes tops · mes tours ·
  mes étapes* selon le type.
- La planche lecture se termine par « **Rien à cocher pendant la séance** » — phrase antérieure au
  renversement, **fausse depuis**. À retirer.
- Les **pastilles de durée font 32 px** de haut, sous les 44 px recommandés : inline dans un texte à
  25 px d'interligne on ne peut pas faire mieux, la zone tactile sera étendue par `hitSlop`.
- Le **bandeau réduit est serré** une fois « Passer » ajouté : « repos · série 3 sur 4 » tronquera
  sur les petits écrans.
- La notification sur écran verrouillé utilise `rgba(28,38,48,.92)`, hors tokens — effet système,
  écart assumé. Les tirets de progression d'un exercice terminé utilisent `success.on` comme aplat
  là où `success` DEFAULT serait le rôle exact.
- **Une case cochée ⇒ une pastille.** Dès qu'au moins une unité est cochée, l'exercice porte
  « X sur Y ». La frame 2 de la planche web montre deux cases cochées sans pastille — écart de la
  planche, pas de la règle.
- **Le web ne montre aucun timer** : ils sont mobiles, et rien n'impose de les y porter — l'athlète
  au mur a son téléphone. À trancher explicitement plutôt qu'à supposer.

## États vides et amorçage

`coach_athlete_etats_vides.dc.html` couvre les onze vides que la refonte fait apparaître, sur les
deux plateformes. Principe : un vide n'est pas une absence, c'est une **porte** — un titre, une
phrase, UNE action primaire. Pas d'illustration décorative : le reste des planches est sobre, celle-ci
ne fait pas exception. Le vide de **départ** et le vide de **filtre** ne se ressemblent pas — le
premier amorce, le second constate que la recherche ne trouve rien alors que la bibliothèque est
pleine, et propose de créer l'exercice manquant en reprenant le texte tapé comme titre, sans perdre
la séance en cours.

### Ce qui est tranché

- **Pas de presets à l'amorçage.** La bibliothèque vide propose « Créer un exercice », point ; le
  constructeur s'ouvre comme il s'ouvre toujours. Trois entrées par cas d'usage (renfo · circuit ·
  partir de zéro) avaient été dessinées, puis écartées : elles dupliquaient le choix de structure.
- **Un exercice sans aucun bloc de structure est LÉGITIME** — « étirements au ressenti ». Le
  constructeur le dit sans alarme (« Aucune structure… c'est un état valide, tu peux enregistrer »)
  et l'athlète voit titre + consigne, rien d'autre : pas de grille vide, pas de phrase de dosage,
  pas de case à cocher. Une grille SANS LIGNE, elle, garde ses en-têtes — le coach voit ce qu'on
  va lui demander — et l'aperçu athlète annonce « le dosage apparaîtra ici dès la première ligne ».
- **Une séance vide côté athlète est l'anomalie du COACH.** On ne culpabilise pas l'athlète et on
  ne lui demande pas de la réparer : on constate, et on offre de la signaler. Le bouton de débrief
  est **retiré, pas grisé** — un bouton mort se tape quand même.
- **Un débrief entièrement vide s'envoie.** « J'ai fait la séance, rien à dire » est une réponse
  valable, et forcer du texte n'en produit que de creux. Le bouton reste actif ; une ligne dit ce
  qui partira, et le rail le détaille : séance faite, aucun commentaire, aucun décompte.
- **Jamais de lien vers du vide.** Un exercice sans consigne ni pièce jointe n'affiche pas « Voir la
  consigne ». Et le lien de suivi **nomme son unité** : « Suivre mes séries », « Suivre mes tours ».
- **L'amorçage du suivi tient en un indice** — « Coche au fur et à mesure », en pastille accent,
  au-dessus de la liste, dans l'écran de suivi ouvert. Première séance seulement, disparaît au
  premier tap, définitivement. Pas de visite guidée, pas de modale, pas de série d'infobulles.
- **Le rail web se réduit à ce qui existe encore.** Sans sommaire, sans progression, sans débrief,
  il ne garde que le lien vers le coach — et l'action n'apparaît qu'une fois, dans le rail.

### Vocabulaire

Le coach diffuse une **planification**, pas des séances une par une : « Ton coach n'a pas encore
diffusé de planification. Elle apparaîtra ici dès qu'il la publiera. »
