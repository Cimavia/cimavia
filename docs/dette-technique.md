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

## Modèle de données — à trancher en P3

**`ScheduledSessionExercise` doit-il garder une FK vers l'`Exercise` d'origine ?**

- **Oui** (prévu au CDC §8) : permet d'afficher les **documents** de l'exercice dans la séance planifiée. Mais impose un `onDelete: Restrict` → le coach ne pourra pas supprimer un exercice utilisé dans **une planification passée**, ce qui deviendra vite bloquant.
- **Non** (copie autonome : titre/description dupliqués) : la planification devient un instantané immuable, la bibliothèque reste librement modifiable. Mais on perd les documents, sauf à les copier aussi.

Contexte : en P2, `SessionExercise.exercise` est déjà en `Restrict` (avec un **409** explicite côté API). Le compromis se pose différemment pour les instances, qui sont censées être des **copies figées**.

---

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
