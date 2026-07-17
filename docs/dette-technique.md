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
| ~~P3-1~~ | ~~**Push non envoyé à la diffusion**~~ : `POST /plans/:id/publish` déclenche `NotificationService.notifyPlanPublished`, qui **journalise** (Pino → Axiom) au lieu d'émettre une notification. | Le push complet suppose l'enregistrement des tokens device (table `PushToken` + `expo-notifications` + build sur téléphone physique) — c'est le périmètre explicite de **p4-4**. Le déclencheur métier, lui, est déjà en place et couvert par les e2e : seule la livraison manque. | ✅ **Résolu en p4-4** : `expo-server-sdk` branché DANS `NotificationService`, sans que les appelants bougent. Table `PushToken` + enregistrement mobile. | ✅ |
| P3-2 | **Objets S3 orphelins après suppression d'une planif** : une copie de document partage la clé objet de la bibliothèque. Si le document d'origine est supprimé (l'objet est alors *conservé* car une copie l'utilise) puis que la planif est supprimée à son tour, l'objet reste dans le bucket sans aucune ligne. | Le compromis inverse — purger l'objet dès la suppression du document — casserait un cycle **déjà diffusé** à l'athlète : une ligne pointerait vers un fichier disparu. On préfère payer du stockage. Le comptage de références (`deleteObjectIfUnreferenced`) évite le cas courant. | Même tâche de purge que **P2-1** (lister les clés sans ligne correspondante, ni `ExerciseDocument` ni `ScheduledSessionExerciseDocument`). | 🟡 |
| P3-3 | **Documents non lisibles hors-ligne** : le cache athlète (p3-5) conserve la structure des séances (exercices, prescriptions, consignes), mais les documents sont servis par des **URLs signées à TTL court** (5 min) — inutilisables sans réseau. | L'usage visé est « consulter sa séance en salle sans réseau » : le déroulé et les consignes suffisent. Télécharger et chiffrer les PDF/images en local est un chantier à part (quota, purge, sécurité). | Si les athlètes réclament les documents en salle : télécharger les fichiers à la diffusion et les stocker via `expo-file-system`. | 🟢 |
| ~~P3-4~~ | ~~**Écrans coach de P1 jamais construits**~~ (nav, liste d'athlètes, invitation, fiche). | — | ✅ **Résolu en p3-8** : nav latérale (`CmvAppShell`), `/athletes`, panneau d'invitation (code + copie) et fiche athlète livrés. Le dashboard a remplacé l'accueil. | ✅ |
| P3-5 | **Écarts aux maquettes assumés** : pas de **durée de séance** (« 75 min » dans pd-7/pd-9 — le champ n'existe ni au CDC §8 ni sur `Session` en P2), et pas de **drag & drop** dans le builder (réordonnancement par ↑/↓). | Ajouter `durationMinutes` sur la seule instance créerait une asymétrie modèle/instance ; l'ajouter partout rouvre P2 pour un champ décoratif. Le DnD suit la dette **P2-3** (dépendance + accessibilité). | Ajouter `durationMinutes Int?` sur `Session` ET `ScheduledSession` le jour où le coach en exprime le besoin (migration triviale, nullable). | 🟢 |
| P3-6 | **Tuile « Factures en attente » non branchée** : affiche `—`, marquée `// MOCKED`. (« Débriefs à relire » est branchée en P4.) | Les données n'existent pas encore ; un `0` mentirait (règle nullable). La structure de l'écran, elle, est posée. | **P6** (factures) : `grep -r MOCKED` la liste. | 🟡 |

---

> **Tranché en P3** (la question ouverte du modèle) : `ScheduledSessionExercise` est une **copie autonome** — snapshot `title`/`description`/`category`/`prescription` + `sourceExerciseId` **nullable en `SetNull`** (traçabilité seule), et les documents sont **copiés en lignes** partageant la clé objet. Conséquence : le coach peut supprimer un exercice de sa bibliothèque **sans jamais casser ni bloquer** une planification diffusée (pas de `Restrict`, pas de 409 à vie). La bibliothèque (`SessionExercise`) garde, elle, son `Restrict`/409 : un modèle de séance doit rester cohérent.

---

## P4 — Débrief & Médias

| # | Dette | Pourquoi c'est acceptable | Déclencheur / résolution | Statut |
|---|---|---|---|---|
| P4-1 | **Vidéo non transcodée** : le plafond 720p n'est pas appliqué, ni vérifié. Le picker borne la durée à la capture, et une vidéo hors plafonds est **refusée** (message explicite) plutôt que réencodée. | Transcoder côté client impose une dépendance native lourde (`react-native-compressor`) ; côté serveur, un pipeline ffmpeg — hors de proportion pour le MVP. Les deux plafonds qui protègent le coût sont, eux, bien appliqués : la durée (déclarée, bornée à la capture) et surtout la **taille**, signée dans l'URL PUT donc opposable par le storage. | Si les athlètes butent souvent sur le refus « > 50 Mo » : compresser côté client (dev build requis, l'app n'est plus lançable dans Expo Go). | 🟢 |
| P4-2 | **Durée vidéo déclarative** : `durationSeconds` vient du client, le serveur ne décode pas le fichier. Un client modifié pourrait annoncer 10 s pour une vidéo de 5 min. | Le vrai garde-fou du coût est la taille (50 Mo), elle **vérifiée par le storage**. Mentir sur la durée sans dépasser la taille ne coûte rien de plus. | Une inspection serveur (ffprobe) n'a de sens qu'avec un pipeline de transcodage — donc avec P4-1. | 🟢 |
| P4-3 | **Vol de token push possible** : `POST /me/push-tokens` réaffecte un token déjà enregistré au compte courant. Qui connaîtrait le token d'un tiers pourrait le priver de ses notifications. | La réaffectation est **nécessaire** : le token est unique en base, et un appareil change de main (le cas courant : tester coach et athlète sur le même téléphone). Sans elle, un 500 sur violation d'unicité. L'impact est borné : aucune donnée n'est exposée, seule la livraison bascule ; et le token n'est pas devinable. | Le correctif propre est une preuve de possession de l'appareil (challenge push) — hors MVP. À revoir si un usage multi-comptes par appareil apparaît. | 🟡 |
| P4-4 | **Pas de miniature vidéo** dans la galerie mobile : une pastille « Vidéo · 42 s » tient lieu d'aperçu. | Générer une vignette demande un module natif de plus (`expo-video-thumbnails`) pour un gain cosmétique. Le coach, lui, lit la vidéo en entier côté web. | Confort : à ajouter si l'athlète peine à distinguer ses vidéos entre elles. | 🟢 |
| P4-5 | **Un seul push par débrief** : seule la CRÉATION notifie le coach. Les compléments (texte ajouté, photo tardive) repassent le débrief « à relire » dans le dashboard, sans notification. | L'athlète débriefe en plusieurs fois : un push par ajout serait du harcèlement. Le signal n'est pas perdu — il est juste passif. | Si les coachs ratent des compléments : notifier à nouveau au-delà d'un délai (ex. 1 h après le dernier push). | 🟢 |
| ~~P2-1~~ / ~~P3-2~~ | *(inchangées)* La purge des objets S3 orphelins reste différée. | P4 n'ajoute **aucun** nouveau cas : un média de débrief n'est jamais copié ni partagé, sa clé n'appartient qu'à lui, et sa suppression purge l'objet directement. | Toujours les mêmes déclencheurs (P2-1). | 🟡 |

> **Résolu en P4** : ~~P3-1~~ (push non envoyé) — `expo-server-sdk` est branché dans
> `NotificationService`, sans que les appelants aient bougé. ~~P3-6~~ côté débriefs — la tuile
> « Débriefs à relire » est connectée (les factures restent `MOCKED` pour P6).

> **Rattrapages faits en P4** (hors périmètre annoncé, révélés par le test de bout en bout) :
> **p4-5** l'écran mobile « rejoindre un coach » — `POST /invitations/accept` existait et était
> testé, mais aucun client ne l'appelait : la relation ne pouvait s'établir qu'à la main, donc
> l'athlète n'avait ni planif ni séance à débriefer. **p4-6** le rafraîchissement mobile —
> **rien** ne déclenchait de refetch (`refetchOnWindowFocus` s'appuie sur des événements de
> navigateur, absents en React Native) : avec le cache persisté et `staleTime` à 5 min, l'athlète
> pouvait relire un cycle supprimé sans le moindre signe. Manque hérité de P3, invisible en dev
> (on recharge sans cesse), qui aurait mordu en production.

---
## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
