# Priorités du backlog

Repriorisation du 2026-11-04 (skill `prioriser`), état des issues au **2026-11-11**.

- **Prio** : le label `prio:` de l'issue sur GitHub — 🔴 `urgent` · 🟠 `high` · 🟡 `med` · ⚪ `low`.
- **Fermée** : ✅ quand l'issue est fermée.
- Les épics conteneurs (#67, #68, #69, #70, #71, #100, #114, #117, #412) n'y figurent pas : leur
  priorité est celle de leur enfant ouvert le plus prioritaire.

## Sécurité

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #324 | Un document LINK accepte `javascript:`, `intent:` et `cimavia://` | 🔴 | ✅ |
| #270 | Vérifier l'adresse e-mail à l'inscription | 🟠 | ✅ |
| #354 | Des textes persistés n'ont aucune longueur maximale | 🟠 | ✅ |
| #677 | La mutation de la tenancy dépasse son délai et n'est plus mesurée | 🟠 | ✅ |
| #323 | `validateBlockValues` ne tourne que dans le navigateur | 🟡 | ✅ |
| #780 | Le web n'envoie aucun en-tête de sécurité : ni CSP, ni frame-ancestors, ni nosniff | 🟡 | ✅ |
| #782 | Les routes métier de l'API n'ont aucune limite de débit | 🟡 | ✅ |
| #781 | Derrière Cloudflare, le rate limit de Better Auth peut compter tous les clients comme un seul | 🟡 | |
| #468 | Le rattachement d'un média croit le type et la taille déclarés | 🟡 | ✅ |
| #352 | Une clé de requête répétée rend 500 (paramètres hors Zod) | 🟡 | |
| #466 | Les routes d'auth n'apparaissent jamais dans les journaux Pino | 🟡 | |
| #81 | Inspection serveur des durées (ffprobe) | ⚪ | |

## Conformité et données personnelles

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #778 | Aucune politique de confidentialité ni mention légale n'est accessible depuis les apps | 🔴 | ✅ |
| #259 | Cadrage : les données imposent-elles un hébergeur HDS ? | 🔴 | |
| #256 | Cadrage : supprimer son compte depuis l'app | 🔴 | ✅ |
| #795 | Supprimer son compte depuis le web *(enfant de #256)* | 🔴 | ✅ |
| #796 | Supprimer son compte depuis l'app mobile *(enfant de #256)* | 🔴 | ✅ |
| #285 | Effacer un compte et ses médias | 🔴 | ✅ |
| #783 | Cadrage : quelles données personnelles partent chez Sentry, Axiom, Scaleway, Expo et Cloudflare ? | 🟡 | |
| #74 | Rupture d'une relation : purger objets et notifications | 🟡 | |

## Bugs

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #731 | Notes vocales en erreur en preview : établir la cause, puis corriger | 🟠 | ✅ |
| #439 | Un 401 n'est traité nulle part sur mobile | 🟠 | ✅ |
| #340 | Quitter pendant un enregistrement envoie la capture tronquée | 🟠 | |
| #347 | « Passer » dans le bandeau réduit arrête tout le déroulé | 🟠 | |
| #329 | Une adresse e-mail dans la consigne rend l'exercice inenregistrable | 🟠 | |
| #519 | Les pastilles de chrono annoncent l'effort de la première ligne | 🟡 | |
| #374 | « Autorise les notifications » s'affiche à chaque série manuelle | 🟡 | |
| #367 | Le fil ne reste pas collé en bas quand le dernier message est une photo | 🟡 | |
| #380 | « Débrief reçu » ouvre la boîte de réception vide | 🟡 | |
| #363 | Ouvrir une séance du constructeur ne montre ni chargement ni échec | 🟡 | |
| #328 | Sous-liste et retour à la ligne disparaissent de la consigne | 🟡 | |
| #331 | Objectif AMRAP : null s'affiche « 1 » et ne peut plus être retiré | 🟡 | |
| #330 | Une image retirée de la consigne est quand même envoyée | 🟡 | |
| #333 | « Dupliquer en variante » sans garde de double clic | 🟡 | |
| #356 | « Le dernier cycle terminé » est élu par date de début | 🟡 | |
| #344 | Destination d'une notification décidée sur la capacité possédée | 🟡 | |
| #343 | Le tableau de bord coach lit ses factures au titre exercé | 🟡 | |
| #82 | Note vocale web → iOS : format lisible partout | 🟡 | |
| #371 | La barre latérale se construit sur `?as=` sans borne | ⚪ | |
| #366 | Retirer un média d'un débrief échoue en silence | ⚪ | |
| #369 | L'indice « défaut … » affiche des secondes brutes | ⚪ | |
| #381 | Une horloge en avance affiche une date absolue | ⚪ | |
| #358 | La recherche ne replie pas « œ » ni « æ » | ⚪ | |
| #437 | Lien de réinitialisation expiré : le formulaire s'affiche quand même | ⚪ | |
| #485 | Payer une facture laisse le badge des rappels périmé | ⚪ | |
| #514 | Métrique maison : bouton actif sur un libellé trop long | ⚪ | |
| #521 | Mobile : une colonne repliée répète son unité | ⚪ | |

## Performance et scalabilité

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #350 | E-mail et push attendus dans la requête métier, sans délai maximum | 🟠 | |
| #809 | Une vidéo met très longtemps à se charger sur l'app mobile hors wifi | 🟠 | |
| #77 | Messages : pagination par curseur | 🟡 | |
| #201 | Débriefs : la boîte de réception servie par l'API | 🟡 | |
| #139 | Endpoint d'agrégat du dashboard coach | ⚪ | |
| #140 | Pagination du tableau de suivi | ⚪ | |
| #79 | Exercices et séances : `?page` / `?limit` | ⚪ | |
| #78 | Notifications : pagination par curseur | ⚪ | |
| #106 | Rappels : pagination de l'historique | ⚪ | |
| #80 | Pipeline de transcodage serveur | ⚪ | |
| #86 | Alléger l'image API | ⚪ | |

## Fiabilité, exploitation et livraison

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #779 | La copie hors du NAS est manuelle : une panne du NAS perd tout depuis la dernière | 🟠 | |
| #772 | Restauration du README cassée, et un silo-setup en échec ignoré par la promotion | 🟠 | |
| #760 | Une bibliothèque en deux copies dans le bundle mobile passe la CI | 🟠 | |
| #290 | L'app web ne prend une nouvelle version qu'après un rechargement forcé | 🟠 | |
| #394 | Recette sur iPhone réel du code écrit pour iOS | 🟠 | |
| #255 | Le profil EAS production n'a pas d'URL d'API | 🟠 | |
| #800 | Une version plus récente de SILO est disponible | 🟠 | |
| #784 | Personne n'est prévenu quand l'API ou le stockage de preview tombe | 🟡 | |
| #212 | Dire au démarrage ce qui n'est pas configuré, ni migré | 🟡 | |
| #418 | La promotion ne sait viser que preview | 🟡 | |
| #84 | Migrations Prisma dans une étape de déploiement dédiée | ⚪ | |
| #411 | Terraform pour Cloudflare et Scaleway | ⚪ | |
| #248 | Release Sentry du mobile | ⚪ | |
| #99 | Relire les receipts Expo | ⚪ | |
| #289 | Cadence des releases | ⚪ | |

## Fonctionnalités

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #771 | Joindre un PDF dans une conversation | 🟠 | ✅ |
| #5 | Duplication d'une planification | 🟠 | |
| #213 | Cadrage : rompre une relation coach↔athlète | 🟠 | |
| #231 | Reporter un cycle diffusé | 🟡 | |
| #202 | Le segment « À traiter » | 🟡 | |
| #565 | Copier le texte d'un message sur téléphone | 🟡 | |
| #2 | Feedback in-app | 🟡 | |
| #3 | Rôle admin et back-office | 🟡 | |
| #87 | Anglais : catalogues `en.json` | ⚪ | |
| #88 | Anglais : détection de langue et préférence utilisateur | ⚪ | |
| #89 | Anglais : formats localisés (dates, montants) | ⚪ | |
| #118 | Photo de profil : backend | ⚪ | |
| #119 | Photo de profil : web et mobile | ⚪ | |
| #725 | Enregistrer le temps et le score d'un bloc | ⚪ | |
| #203 | Cadrage : archiver un cycle terminé | ⚪ | |
| #223 | Cadrage : relancer sur une facture en retard | ⚪ | |
| #136 | Marquer un rappel fait depuis le centre de notifications | ⚪ | |
| #149 | Export Google Calendar | ⚪ | |
| #150 | Cadrage : outil de facturation externe | ⚪ | |
| #94 | Durée de séance | ⚪ | |
| #98 | Grouper les ajustements d'un même cycle | ⚪ | |
| #155 | Miniature vidéo dans la messagerie | ⚪ | |

## Qualité et outillage

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #455 | La porte locale tombe au hasard : tests web hors délai | 🟠 | |
| #668 | Le minuteur d'un toast survit au démontage : CI rouge sur une suite verte | 🟡 | |
| #382 | Le test de changement d'heure est vert quelle que soit l'implémentation | 🟡 | |
| #351 | Onze `notifyX` recopiés, aucun test sur la partie fragile | 🟡 | |
| #638 | Aucun parcours de l'Athlete testé de bout en bout sur mobile | 🟡 | |
| #178 | Vérifier les classes Tailwind qui référencent un token | 🟡 | |
| #355 | 830 lignes de logique pure dans le schéma des blocs | ⚪ | ✅ |
| #387 | Trois fichiers dépassent nettement 400 lignes | ⚪ | |
| #360 | Sept copies du même déplacement d'élément | ⚪ | |
| #376 | Deux dérivations du mobile recopiées | ⚪ | |
| #383 | Le web recopie deux formateurs de `@cmv/shared` | ⚪ | |
| #372 | Un composant du design system importe une feature | ⚪ | |
| #375 | Le design system mobile lit le stockage hors-ligne | ⚪ | |
| #359 | Un type de notification oublié disparaît des pastilles | ⚪ | |
| #386 | Commentaire et cahier des charges à 60 s au lieu de 180 s | ⚪ | |
| #342 | Le bouton de fermeture du panneau porte un libellé en dur | ⚪ | |
| #348 | Le nom du canal de notification Android est écrit en dur | ⚪ | |
| #368 | La limite du justificatif est écrite en dur dans le catalogue | ⚪ | |

## Accessibilité et lisibilité

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #570 | « Débrief enregistré » et « Fait » en terracotta, lus comme une erreur | 🟡 | |
| #579 | Boutons sans fond ni bordure, lus comme du texte | 🟡 | |
| #218 | Le DEFAULT des familles d'état employé comme texte (contraste AA) | 🟡 | |
| #199 | Rôle d'accessibilité sur les composants Cmv du mobile | 🟡 | |
| #377 | Les boutons de la barre d'envoi n'ont aucun nom accessible | 🟡 | |
| #650 | Le sélecteur segmenté n'annonce pas l'option choisie | ⚪ | |
| #217 | Repère de champ obligatoire sur mobile | ⚪ | |
| #705 | Couleur progressive des compteurs du tableau de suivi | ⚪ | |
| #1 | Thème clair | ⚪ | |

## Cohérence des données et stockage

| Issue | Nom | Prio | Fermée |
|---|---|---|---|
| #72 | Tâche de purge des objets sans ligne en base | 🟡 | |
| #102 | Nettoyer les notifications d'une relation supprimée *(avec #213)* | 🟡 | |
| #108 | Purger les rappels d'une cible disparue *(avec #213)* | 🟡 | |
| #73 | Purger le PDF à la suppression d'un cycle brouillon | ⚪ | |
| #75 | Suppression d'un document : rollback si la ligne ne part pas | ⚪ | |
| #76 | Rétention des notifications lues *(doublon de #101)* | ⚪ | |
| #101 | Purge et rétention des notifications *(doublon de #76)* | ⚪ | |
| #107 | Rétention des rappels traités | ⚪ | |

## Notes

- **#809 → #80** : la cause de #809 n'est pas établie, mais l'issue cite l'absence de transcodage
  (vidéos jusqu'à 1 Go, dette P4-1). Si l'enquête la confirme, #80 monte avec elle.
- **Doublon à fermer** : #76 et #101 portent la même dette N-2.
