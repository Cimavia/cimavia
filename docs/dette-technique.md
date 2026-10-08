# Dette technique — cimavia

**Journal de décisions et index de dette.** Deux choses vivent dans ce journal : les **raccourcis
assumés** (le *quoi* et le *statut* — le *pourquoi* et le *quand* vivent dans l'issue liée) et les
**décisions tranchées en cours de route**, que le code ne justifie pas tout seul. Ce fichier en est
l'index ; le contenu est rangé par domaine sous `docs/dette/` (voir [Domaines](#domaines)).

Ce n'est ni un backlog de bugs (→ issues), ni une liste de features (→ `cahier-des-charges-mvp.md` §4).

**Règle de capture** : tout raccourci pris pendant une phase s'ajoute, dans le fichier de son
domaine, **au moment où on le prend** — une ligne suffit. L'issue peut attendre ; une dette non
écrite est une dette oubliée.

**Où lire quoi** : le journal dit *ce qui a été court-circuité* et *où en est le suivi*. L'issue
liée porte le raisonnement complet — pourquoi c'était acceptable, et ce qui doit se produire pour
qu'on le traite.

Statuts : 🟢 acceptable durablement · 🟡 à traiter avant v1.0 · 🔴 à traiter avant la mise en prod

**Épics de suivi** :
[#67](https://github.com/Cimavia/cimavia/issues/67) cohérence base ↔ storage ·
[#68](https://github.com/Cimavia/cimavia/issues/68) pagination ·
[#69](https://github.com/Cimavia/cimavia/issues/69) transcodage des médias ·
[#70](https://github.com/Cimavia/cimavia/issues/70) durcissement avant prod ·
[#7](https://github.com/Cimavia/cimavia/issues/7) capacités coach/athlète ·
[#593](https://github.com/Cimavia/cimavia/issues/593) entreprises et multi-coach ·
[#621](https://github.com/Cimavia/cimavia/issues/621) garde-fous du dépôt — plus neuf issues
autonomes.

**Dettes sans issue** : `pnpm check:dette` les liste par domaine, avec leur déclencheur — la liste
n'est plus tenue à la main ([#624](https://github.com/Cimavia/cimavia/issues/624)). Toutes sont
volontaires, et leur colonne Suivi dit pourquoi elles n'ont pas d'issue, en `— *(…)*` : le plus
souvent un déclencheur nommé avant lequel rien n'est à préparer, parfois « aucun » (pour **C-1**,
l'issue serait même un contresens — le déclencheur est qu'on la « corrige » à tort). Le même
script, lancé en CI, refuse un identifiant défini deux fois, une dette ouverte sans suivi, une ligne
de dette hors tableau, et une archive qui ne correspond plus aux lignes « Résolues, à l'archive ».

Toutes les lignes de la section [#7](https://github.com/Cimavia/cimavia/issues/7) (domaine
*Comptes, capacités et tenancy*) sont résolues sauf **C-1** : ce qui y reste est de la décision,
pas de la dette en attente.

---

## Domaines

Chaque domaine garde ses sections dans l'ordre où elles sont nées, tableaux de dette et encadrés
« Tranché en #N » ensemble. Une dette ou une décision se cherche par son identifiant ou son titre
d'encadré, sur tout le dossier : `grep -rn "Tranché en #10" docs/dette/`.

| Domaine | Fichier | Couvre |
|---|---|---|
| Séances et exercices | [`dette/seances-et-exercices.md`](dette/seances-et-exercices.md) | bibliothèque, modèle d'exercice, constructeurs, dosage, saisie |
| Planifications | [`dette/planifications.md`](dette/planifications.md) | cycles, semaines, diffusion, planning athlète, « aujourd'hui » |
| Débrief et médias | [`dette/debrief-et-medias.md`](dette/debrief-et-medias.md) | débrief, object storage, URLs signées, vidéo, hors-ligne |
| Messagerie et notifications | [`dette/messagerie-et-notifications.md`](dette/messagerie-et-notifications.md) | fils, notes vocales, centre de notifications, rappels, push |
| Facturation | [`dette/facturation.md`](dette/facturation.md) | factures, lecture par athlète |
| Comptes, capacités et tenancy | [`dette/comptes-et-tenancy.md`](dette/comptes-et-tenancy.md) | capacités coach/athlète, invitations, session, entreprises, isolation |
| Interface et i18n | [`dette/interface-et-i18n.md`](dette/interface-et-i18n.md) | i18n, registre, couleurs, parité web/mobile |
| Livraison et déploiement | [`dette/livraison-et-deploiement.md`](dette/livraison-et-deploiement.md) | images, NAS preview, stockage déployé, version, iOS, OTA, observabilité |
| Qualité et dépôt | [`dette/qualite-et-depot.md`](dette/qualite-et-depot.md) | tests, couverture, Sonar, CI, protections du dépôt, garde-fous |

Une section nouvelle va dans le domaine de ce qu'elle touche ; si elle en touche deux, dans celui
où l'on viendra la chercher en premier.

Les dettes **résolues** (✅) vivent dans [`dette/archive.md`](dette/archive.md), rangées par
domaine : une dette qui passe à ✅ y part dans la PR qui la résout, et son domaine garde sous le
tableau la ligne « *Résolues, à l'archive* » qui la nomme. Les encadrés restent dans leur domaine.

---

## Hors périmètre MVP (rappel — ce n'est PAS de la dette)

Ces manques sont des **choix de périmètre**, pas des raccourcis : résultats de compétition · paiement intégré · WebSocket temps réel · débrief par exercice · historique des modifications. Voir `cahier-des-charges-mvp.md` §4.
