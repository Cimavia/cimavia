# Dette technique — cimavia

Registre des **raccourcis assumés**, décidés en connaissance de cause pour avancer. Ce n'est ni un backlog de bugs (→ issues), ni une liste de features (→ `cahier-des-charges-mvp.md` §4).

**Règle** : tout raccourci pris pendant une phase s'ajoute ici **au moment où on le prend**, avec sa raison et son déclencheur de résolution. Une dette non écrite est une dette oubliée.

Statuts : 🟢 acceptable durablement · 🟡 à traiter avant v1.0 · 🔴 à traiter avant la mise en prod

---

## P2 — Exercices & Séances

| # | Dette | Pourquoi c'est acceptable | Déclencheur / résolution | Statut |
|---|---|---|---|---|
| P2-1 | **Objets orphelins en object storage** : si l'upload vers le storage réussit mais que le `POST /documents` (rattachement) échoue, le fichier reste dans le bucket sans ligne en base. | Cas rare (échec réseau entre deux appels), coût = quelques octets. La suppression d'un exercice, elle, nettoie bien ses objets. | Écrire une **tâche de purge** (lister les clés sans `ExerciseDocument` correspondant) — à faire quand les médias de débrief (P4) feront grossir le volume. | 🟡 |
| P2-2 | **Pas de pagination** sur `GET /exercises` et `GET /sessions` : tout est renvoyé. | Un coach a des dizaines d'exercices, pas des milliers. La recherche/filtre côté API limite déjà le volume. | Ajouter `?page`/`?limit` dès qu'un coach dépasse ~200 exercices, ou si la liste devient lente. | 🟢 |
| P2-3 | **Pas de drag & drop** dans le SessionBuilder : réordonnancement par boutons ↑/↓. | Imposerait une dépendance (dnd-kit) + un travail d'accessibilité. Les boutons sont utilisables au clavier, et le modèle (position = ordre du tableau) accepte le DnD **sans migration**. | Confort utilisateur : à ajouter si le coach compose des séances longues (>8 exercices). | 🟢 |
| P2-4 | **`crypto.randomUUID()` pour la clé objet**, alors que les `id` de tables sont des `cuid`. | Ce n'est pas un identifiant métier, juste un segment d'unicité dans le chemin S3. `randomUUID` est natif (zéro dépendance). | Aucun — incohérence assumée, deux usages distincts. | 🟢 |
| P2-5 | **Suppression d'un document : pas de rollback**. On supprime l'objet S3 **puis** la ligne. Si la suppression en base échoue, le document pointe vers un objet disparu. | Ordre choisi volontairement : une ligne orpheline casse l'affichage, un objet orphelin ne coûte que du stockage. La fenêtre d'échec est minuscule. | Revoir si l'on introduit une vraie gestion transactionnelle des médias (P4). | 🟢 |

---

## P3 — Planifications

| # | Dette | Pourquoi c'est acceptable | Déclencheur / résolution | Statut |
|---|---|---|---|---|
| P3-1 | **Push non envoyé à la diffusion** : `POST /plans/:id/publish` déclenche `NotificationService.notifyPlanPublished`, qui **journalise** (Pino → Axiom) au lieu d'émettre une notification. | Le push complet suppose l'enregistrement des tokens device (table `PushToken` + `expo-notifications` + build sur téléphone physique) — c'est le périmètre explicite de **p4-4**. Le déclencheur métier, lui, est déjà en place et couvert par les e2e : seule la livraison manque. | **p4-4** : brancher `expo-server-sdk` DANS `NotificationService`, sans toucher aux appelants (`grep MOCKED`). | 🔴 |
| P3-2 | **Objets S3 orphelins après suppression d'une planif** : une copie de document partage la clé objet de la bibliothèque. Si le document d'origine est supprimé (l'objet est alors *conservé* car une copie l'utilise) puis que la planif est supprimée à son tour, l'objet reste dans le bucket sans aucune ligne. | Le compromis inverse — purger l'objet dès la suppression du document — casserait un cycle **déjà diffusé** à l'athlète : une ligne pointerait vers un fichier disparu. On préfère payer du stockage. Le comptage de références (`deleteObjectIfUnreferenced`) évite le cas courant. | Même tâche de purge que **P2-1** (lister les clés sans ligne correspondante, ni `ExerciseDocument` ni `ScheduledSessionExerciseDocument`). | 🟡 |
| P3-3 | **Documents non lisibles hors-ligne** : le cache athlète (p3-5) conserve la structure des séances (exercices, prescriptions, consignes), mais les documents sont servis par des **URLs signées à TTL court** (5 min) — inutilisables sans réseau. | L'usage visé est « consulter sa séance en salle sans réseau » : le déroulé et les consignes suffisent. Télécharger et chiffrer les PDF/images en local est un chantier à part (quota, purge, sécurité). | Si les athlètes réclament les documents en salle : télécharger les fichiers à la diffusion et les stocker via `expo-file-system`. | 🟢 |
| P3-4 | **Écrans coach de P1 jamais construits** : la phase P1 a été cochée sur son **périmètre API** (relation, invitation, fiche athlète, tenancy). Côté web il n'existe ni nav latérale, ni liste d'athlètes (pd-4), ni écran d'invitation, ni fiche athlète (pd-5). | L'API est complète et testée ; le manque est purement UI. P2 et P3 ont pu avancer avec des relations créées à la main (client HTTP). | **p3-8** — à rattraper en fin de P3 : sans écran d'invitation, la recette du parcours coach passe obligatoirement par Insomnia. | 🔴 |
| P3-5 | **Écarts aux maquettes assumés** : pas de **durée de séance** (« 75 min » dans pd-7/pd-9 — le champ n'existe ni au CDC §8 ni sur `Session` en P2), et pas de **drag & drop** dans le builder (réordonnancement par ↑/↓). | Ajouter `durationMinutes` sur la seule instance créerait une asymétrie modèle/instance ; l'ajouter partout rouvre P2 pour un champ décoratif. Le DnD suit la dette **P2-3** (dépendance + accessibilité). | Ajouter `durationMinutes Int?` sur `Session` ET `ScheduledSession` le jour où le coach en exprime le besoin (migration triviale, nullable). | 🟢 |

> **Tranché en P3** (la question ouverte du modèle) : `ScheduledSessionExercise` est une **copie autonome** — snapshot `title`/`description`/`category`/`prescription` + `sourceExerciseId` **nullable en `SetNull`** (traçabilité seule), et les documents sont **copiés en lignes** partageant la clé objet. Conséquence : le coach peut supprimer un exercice de sa bibliothèque **sans jamais casser ni bloquer** une planification diffusée (pas de `Restrict`, pas de 409 à vie). La bibliothèque (`SessionExercise`) garde, elle, son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
