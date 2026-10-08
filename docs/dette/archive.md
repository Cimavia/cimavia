# Dette technique — Archive

Les dettes **résolues** (statut ✅), sorties de leur domaine en
[#624](https://github.com/Cimavia/cimavia/issues/624) pour que les tableaux ne montrent plus que ce
qui reste ouvert. Chacune garde son identifiant, et son domaine d'origine en nomme la liste sous le
tableau qu'elle a quittée. Les encadrés « Tranché en #N » qui les accompagnaient sont restés dans
leur domaine : une décision ne s'archive pas avec la dette qui l'a fait naître. Voir
l'[index](../dette-technique.md).

---

## Comptes, capacités et tenancy

### Post-MVP — Dashboard coach ([#110](https://github.com/Cimavia/cimavia/issues/110))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~D-2~~ | ~~**Pas de recherche, de tri ni de filtre** sur le tableau de suivi, là où la maquette en prévoit.~~ | ✅ | résolue en **#123** — recherche par nom, filtres *Cycle terminé* / *Sans plan*, ordre alphabétique. Le **tri par activité** est resté dehors (cf. encadré ci-dessous) |

### Post-MVP — Capacités coach/athlète ([#7](https://github.com/Cimavia/cimavia/issues/7))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~C-2~~ | ~~**L'autorisation API tourne encore sur le rôle exclusif**~~ : `@Roles` et `tenantField` lisaient `actor.role`. | ✅ | résolue en **#10** — `@RequireCapability` maison, `TenantContext` sans `role` |
| ~~C-3~~ | ~~**Les clients n'envoient pas `?as=`**~~ : les routes servant les deux capacités répondaient 400 à un compte cumulant. | ✅ | résolue en **#12** (le paramètre) et **#129** (le choix explicite) |

### Post-MVP — Invitations qui attendent, refus et e-mail ([#146](https://github.com/Cimavia/cimavia/issues/146) · [#147](https://github.com/Cimavia/cimavia/issues/147))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~I-3~~ | ~~**`InvitationStatus.REVOKED` reste une valeur sans chemin**~~ : aucune route ne la posait, et un coach ne pouvait pas annuler une invitation encore en attente — il attendait son expiration (7 jours). | ✅ | résolue en [#524](https://github.com/Cimavia/cimavia/issues/524) — `POST /invitations/:id/revoke`, « Retirer » sur le web et le mobile |

## Débrief et médias

### P4 — Débrief & Médias

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P4-3~~ | ~~**Vol de token push possible**~~ : `POST /me/push-tokens` réaffectait au compte courant un token déjà enregistré. | ✅ | résolue en [#90](https://github.com/Cimavia/cimavia/issues/90) — un **secret d'installation**, émis par l'API et gardé en `expo-secure-store`, conditionne la réaffectation |
| ~~P4-4~~ | ~~**Pas de miniature vidéo sur mobile**~~ : ni dans la galerie de débrief, ni dans la bulle de messagerie — une pastille, un libellé, aucun aperçu de l'image. **Rectifié en #92** : la ligne annonçait, depuis #407, `expo-image` comme module natif restant à payer ; `expo-image-manipulator`, déjà là pour les photos, a suffi. | ✅ | résolue en [#92](https://github.com/Cimavia/cimavia/issues/92) · [#155](https://github.com/Cimavia/cimavia/issues/155) — vignette tirée sur l'appareil à l'affichage, sans module natif de plus (cf. « Tranché en #92 ») |
| ~~P4-5~~ | ~~**Un seul push par débrief** : seule la CRÉATION notifie le coach, pas les compléments.~~ | ✅ | résolue en [#540](https://github.com/Cimavia/cimavia/issues/540) — un push par envoi de l'athlète, sans trace (cf. « Tranché en #537 ») |
| ~~P2-1~~ / ~~P3-2~~ | ~~**Nouveau cas**~~ : un média de débrief n'est jamais copié ni partagé, et son **retrait** par l'athlète purge l'objet — mais la **disparition de sa séance** cascadait débrief et médias en base sans toucher au bucket. Fermé pour la séance seule en [#313](https://github.com/Cimavia/cimavia/issues/313), pour la semaine et le cycle **diffusés** en [#312](https://github.com/Cimavia/cimavia/issues/312) et [#85](https://github.com/Cimavia/cimavia/issues/85) — tous en 409. Un brouillon n'a jamais été visible de l'athlète : aucune de ses séances n'est débriefée. **Rectifié en #313** : cette ligne disait « P4 n'ajoute aucun nouveau cas ». | ✅ | résolue en [#313](https://github.com/Cimavia/cimavia/issues/313) · [#312](https://github.com/Cimavia/cimavia/issues/312) · [#85](https://github.com/Cimavia/cimavia/issues/85) — le cas général des orphelins reste à [#72](https://github.com/Cimavia/cimavia/issues/72) |

### Post-MVP — Envoi découpé des médias (branche `fix/increase-size-video`)

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~U-1~~ | ~~**Aucune reprise d'un envoi interrompu**~~ : toute erreur abandonnait l'upload entier. | ✅ | résolue en [#152](https://github.com/Cimavia/cimavia/issues/152) — une part qui tombe est **réessayée** (1 s puis 3 s), et l'upload n'est abandonné que sur échec définitif. Ce qui reste, c'est **U-5** |
| ~~U-2~~ | ~~**`sendInParts` écrit quatre fois**~~ (débrief ↔ messagerie × web ↔ mobile). | ✅ | résolue en [#152](https://github.com/Cimavia/cimavia/issues/152) — la boucle vit dans `runMultipartUpload` (`@cmv/shared`), les apps n'y branchent que le transport et les deux appels d'API. Le suivi pointait [#96](https://github.com/Cimavia/cimavia/issues/96), qui portait sur la **préparation** média mobile et n'a jamais touché `sendInParts` : lien faux, corrigé ici |

### Post-MVP — Lecture vidéo sur mobile ([#151](https://github.com/Cimavia/cimavia/issues/151))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~V-1~~ | ~~**Pas de lecture vidéo EN LIGNE sur mobile**~~ : le web lit dans la page (`<video controls>`), le mobile délègue au lecteur système. Lecture hors de l'app, aucun contrôle du rendu. Écart de parité assumé (épic [#20](https://github.com/Cimavia/cimavia/issues/20)). | ✅ | résolue en [#407](https://github.com/Cimavia/cimavia/issues/407) — le déclencheur est survenu (retour du coach beta) : `CmvVideoPlayer` lit en plein écran dans l'app, avec `expo-video` |
| ~~V-3~~ | ~~**Vidéo mobile : un saut tardif peut échouer dans le lecteur système**~~ : `CmvVideoLink` re-signe l'URL AVANT de l'ouvrir, mais le lecteur système la garde ensuite. Une vidéo mise en pause plus de 5 min puis relancée ou déplacée redemande des octets avec une URL expirée, et le storage répond 403 — hors de l'app, donc sans reprise possible, là où le web re-signe et reprend à la même position (#304). Rare : la vidéo est plafonnée à 3 min. | ✅ | résolue en [#407](https://github.com/Cimavia/cimavia/issues/407), avec **V-1** — l'erreur de lecture remonte enfin à l'app : `CmvVideoPlayer` re-signe et reprend à la même position |

## Facturation

### P6 — Facturation

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P6-1~~ | ~~**Astérisques d'obligation partiels**~~ : la ligne datait, et disait « seul le formulaire de facturation » alors que quatre autres surfaces avaient reçu `requiredMark` entre-temps. | ✅ | résolue en [#97](https://github.com/Cimavia/cimavia/issues/97) — le repère suit désormais une règle écrite, et non l'ordre d'arrivée des écrans |
| ~~P6-3~~ | ~~**Suppression d'un cycle diffusé bloquée côté UI seulement**~~ : `DELETE /plans/:id` acceptait encore un `PUBLISHED`, et effaçait sa facture émise — ainsi que les débriefs de ses séances et leurs médias, laissés orphelins dans le bucket (#313). | ✅ | résolue en [#85](https://github.com/Cimavia/cimavia/issues/85) — 409 dans `PlanService.delete`, livré avec le verrou de la semaine (cf. « Tranché en #312 ») |

## Interface et i18n

### Post-MVP — Parité multi-plateforme ([#20](https://github.com/Cimavia/cimavia/issues/20))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~M-1~~ | ~~**Les e2e ne tournent dans aucune porte**~~ : la CI lançait `pnpm turbo test`, qui exécute le script `test` de chaque paquet — les 186 e2e ont le leur (`test:e2e`) et n'étaient donc jamais exécutés en PR. Découvert en #36 : deux e2e cassés pendant des jours derrière une CI verte. | ✅ | résolu en **#130** — job `E2E (isolation multi-tenant)` sur chaque PR, **requis** dans les rulesets `main` et `staging`/`production` |
| ~~M-4~~ | ~~**Préparation média toujours dupliquée entre les deux features mobile**~~ (`feedback` ↔ `message`) — doublon de **P5-5**, la même dette suivie à deux endroits. | ✅ | résolue en [#96](https://github.com/Cimavia/cimavia/issues/96) — voir **P5-5** |
| ~~M-5~~ | ~~**Pas de presse-papier sur mobile**~~ : l'invitation se transmettait par `Share` (SMS, WhatsApp) et non par « Copier le code » comme la maquette. | ✅ | caduque en [#390](https://github.com/Cimavia/cimavia/issues/390) — il n'y a plus de code à transmettre, ni à copier ni à partager |
| ~~M-6~~ | ~~**Le `buster` du cache persisté se bump à la main**~~ (`CACHE_SCHEMA_VERSION`, `shared/lib/query.tsx`) : rien ne forçait à y penser, et la panne ne se voit pas chez celui qui développe — son cache est toujours neuf. | ✅ | résolue en **#187** — le buster est la version du produit, lue par `currentAppVersion()` |

## Livraison et déploiement

### P7 — Déploiement FR

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P7-3~~ | ~~**Aucun e-mail de réinitialisation n'était envoyé**~~ : `sendResetPassword` journalisait le lien en `// MOCKED`, dernier du dépôt. Personne n'aurait pu récupérer son mot de passe en production. **Jamais inscrite ici au moment où elle a été prise** — c'est la règle de capture qui a été manquée, pas le raccourci qui était illégitime. | ✅ | résolue en **#63** — `MailService` + catalogue serveur FR/EN ([#62](https://github.com/Cimavia/cimavia/issues/62) · [#63](https://github.com/Cimavia/cimavia/issues/63)) |
| ~~P7-4~~ | ~~**MinIO est figé, et vulnérable là où il est exposé**~~ : MinIO a retiré ses images de Docker Hub (2026-09-13, E2E et déploiement NAS cassés) et ne publie plus d'édition communautaire. Les deux composes tirent désormais `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` et `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z` — même digest que l'ancien `latest`, donc aucun changement, et aucun correctif à venir. Or cette version est visée par des écritures d'objets **sans authentification** (`CVE-2026-41145`, `CVE-2026-40344`) corrigées dans aucune image, et le NAS l'expose sur `s3-dev`, qu'aucune policy Access ne peut protéger puisque le téléphone appelle les URLs signées. Le dev local et l'E2E ne sont pas exposés, mais dépendent d'un registre que MinIO peut retirer à son tour. | ✅ | résolue en **[#257](https://github.com/Cimavia/cimavia/issues/257)** — SILO, fork maintenu de MinIO qui corrige les deux failles (`RELEASE.2026-04-17`), tiré d'un miroir `ghcr.io/cimavia` ; les données du NAS restent dans leur volume |
| ~~P7-6~~ | ~~**Le NAS était déployé par un runner auto-hébergé inscrit sur un dépôt PUBLIC**~~, conteneur `myoung34/github-runner` avec le socket Docker de l'hôte monté. Un contributeur déjà mergé une fois pouvait ouvrir une PR apportant son propre workflow `runs-on: [self-hosted, cimavia-dev]`, exécuté sur le NAS sans approbation (`first_time_contributors`) — c'est-à-dire root sur toute la machine. Tolérable tant que le NAS ne portait que des données synthétiques ; plus du tout depuis qu'il porte celles du Coach bêta ([#260](https://github.com/Cimavia/cimavia/issues/260)). **Jamais inscrite ici** : le runner date du montage du NAS en P7. | ✅ | résolue en **[#266](https://github.com/Cimavia/cimavia/issues/266)** — le NAS tire la version promue (`pull-preview.sh`), plus aucun runner. En attendant la PR, l'approbation des workflows de fork est passée à « all external contributors » le 2026-09-14 |
| ~~P7-8~~ | ~~**L'API signait ses URLs avec le compte ROOT du stockage**~~ : `deploy/dev/docker-compose.yml` passait la même paire à `MINIO_ROOT_USER` et à `S3_ACCESS_KEY_ID`. Or une clé d'accès est lisible **en clair dans chaque URL signée** (`X-Amz-Credential`), et c'est tout ce qu'exigeaient les deux écritures sans authentification que SILO corrige. Une fuite de l'environnement de l'API donnait l'administration complète du stockage, pas l'accès à ses médias. **Jamais inscrite ici** : le NAS n'a longtemps porté que des données synthétiques. | ✅ | résolue en **[#267](https://github.com/Cimavia/cimavia/issues/267)** — une clé dédiée, limitée aux objets du bucket, créée par `silo-setup` |

### Post-MVP — Observabilité front ([#183](https://github.com/Cimavia/cimavia/issues/183))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~O-1~~ | ~~**Sentry ne couvre que l'API**~~, malgré trois documents qui annonçaient « les 3 couches ». Le web et le mobile n'avaient ni SDK ni Error Boundary : un crash de rendu donnait un écran blanc côté web, fermait l'app côté mobile, sans aucune trace. | ✅ | résolu en **[#181](https://github.com/Cimavia/cimavia/issues/181)** (web) et **[#182](https://github.com/Cimavia/cimavia/issues/182)** (mobile) — les trois documents redeviennent vrais par le code, pas par réécriture |

### Post-MVP — Build et distribution iOS ([#134](https://github.com/Cimavia/cimavia/issues/134))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~IOS-1~~ | ~~**Les chaînes de permission iOS ne passent pas par i18next**~~ (règle dure n°6) : elles sont gravées dans l'`Info.plist` AU BUILD, avant que le moindre JS s'exécute. #134 affirmait que les localiser sortait de ce que la config Expo expose, et cette ligne l'a d'abord recopié. | ✅ | résolue en [#254](https://github.com/Cimavia/cimavia/issues/254) — `expo.locales`, construit par `app.config.ts` depuis le bloc `permission.ios` des catalogues i18next ; repli sur le français (encadré ci-dessous) |
| ~~IOS-6~~ | ~~**La chaîne de notification du minuteur n'a aucun test**~~ : `timer-alert.ts`, `useTimerNotification.ts`, et le calcul des échéances enfermé dans `SessionDetailScreen`. Découvert en mesurant `usePushToken` pour #134. Couverte en #509 : les deux premiers par leurs tests unitaires, le calcul des échéances à travers l'écran, sur ce qui part vers `expo-notifications` (encadré « Tranché en #509 »). Le plafond iOS réel reste à IOS-5. | ✅ | résolue en [#253](https://github.com/Cimavia/cimavia/issues/253), livrée par [#509](https://github.com/Cimavia/cimavia/issues/509) |

## Messagerie et notifications

### P5 — Messagerie & débrief vocal

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P5-4~~ | ~~**Throttle push « first-unread » sans reprise temporelle** : une rafale de messages = 1 push, sans rappel.~~ | ✅ | résolue pour le push en [#539](https://github.com/Cimavia/cimavia/issues/539) — un push par message ; la trace garde le throttle (**N-3**, **N-8**) |
| ~~P5-5~~ | ~~**Préparation média dupliquée** entre `feature/feedback` et `feature/message` (mobile)~~. La moitié mobile↔web n'a jamais été une dette : elle s'est réglée en promotion **intra-app** côté web (#26), ce que la ligne d'origine annonçait à tort comme un partage à faire. | ✅ | résolue en [#96](https://github.com/Cimavia/cimavia/issues/96) — `shared/util/media.util.ts` paramétré par un `MediaProfile`, le déclencheur ayant fini par survenir : les deux copies contrôlaient les plafonds à deux endroits différents |

### Post-MVP — Rappels ([#38](https://github.com/Cimavia/cimavia/issues/38))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~R-1~~ | ~~**Aucun push quand un rappel devient dû**~~ : sans scheduler, il n'apparaissait qu'au prochain chargement du centre. | ✅ | résolu en **#47** — tick externe horaire (`POST /internal/reminders/tick`), push idempotent via `pushedAt` |
| ~~R-3~~ | ~~**Pas de report d'échéance ni d'édition**~~ : reprogrammer un rappel demandait de le traiter puis d'en créer un autre — deux gestes, et un historique de doublons. | ✅ | résolu en **#105** — `PATCH /reminders/:id` (échéance et/ou note) + bouton « Repousser » sur l'écran **et** dans le centre de notifications |

### Post-MVP — Messagerie sans interlocuteur ([#198](https://github.com/Cimavia/cimavia/issues/198))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~MI-1~~ | ~~**Le coach n'apprend pas tout de suite qu'un athlète l'a rejoint**~~ : le `staleTime` par défaut (60 s web, 5 min mobile) retenait `GET /me/counterparts`, et il fallait recharger la page pour voir la messagerie apparaître. | ✅ | déclencheur survenu **le jour même** (retour de bêta) — `staleTime: 0` sur cette seule requête, refetch au montage et au retour sur l'app. **La moitié athlète, corrigée en [#308](https://github.com/Cimavia/cimavia/issues/308)** : sur mobile, l'athlète qui venait de rejoindre n'avait pas non plus son onglet Messages — `useAcceptInvitation` énumérait ses invalidations et oubliait les contreparties, et le `staleTime: 0` n'y pouvait rien, la barre d'onglets restant montée sous `join`. Il invalide depuis tout le cache, comme le web, et par la même mutation : `acceptInvitationMutation` (`@cmv/shared`), écrite une fois pour ne plus diverger |

## Planifications

### P3 — Planifications

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P3-1~~ | ~~**Push non envoyé à la diffusion**~~ : `notifyPlanPublished` journalisait au lieu d'émettre. | ✅ | résolu en **p4-4** — `expo-server-sdk` branché dans `NotificationService`, table `PushToken` |
| ~~P3-3~~ | ~~**Documents non lisibles hors-ligne**~~ : servis par des URLs signées à TTL court (5 min). | ✅ | résolue en [#95](https://github.com/Cimavia/cimavia/issues/95) — documents ET déroulé descendus sur l'appareil à la première ouverture en ligne. Le TTL, lui, n'a pas bougé : c'est le CLIENT qui a changé |
| ~~P3-4~~ | ~~**Écrans coach de P1 jamais construits**~~ (nav, liste d'athlètes, invitation, fiche). | ✅ | résolu en **p3-8** — `CmvAppShell`, `/athletes`, invitation, fiche athlète |
| ~~P3-6~~ | ~~**Tuile « Factures en attente » non branchée**~~ : affichait `—`, marquée `// MOCKED`. | ✅ | résolue en **P6** — branchée sur `pendingCount(invoices)` |

## Qualité et dépôt

### Post-MVP — Qualité & analyse statique

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~Q-1~~ | ~~**Couverture non mesurée sur le web et le mobile**~~ : `sonar.coverage.exclusions` n'écartait la mesure que sur `@cmv/shared`, les trois autres paquets étant hors de vue. Les trois tiers sont levés — API en **#57** (e2e instrumentés, 2,6 % → ~86 %), web en **#58**, mobile en **#59** (Vitest, périmètre total). | ✅ | [#56](https://github.com/Cimavia/cimavia/issues/56) → ~~[#57](https://github.com/Cimavia/cimavia/issues/57)~~ ~~[#58](https://github.com/Cimavia/cimavia/issues/58)~~ ~~[#59](https://github.com/Cimavia/cimavia/issues/59)~~ |
| ~~Q-2~~ | ~~**nginx tourne en root dans l'image web**~~ (`apps/web/Dockerfile`), signalé par Sonar (`docker:S6471`). Passée à `nginxinc/nginx-unprivileged` (uid 101, port 8080). | ✅ | ~~[#83](https://github.com/Cimavia/cimavia/issues/83)~~ résolu en [#379](https://github.com/Cimavia/cimavia/issues/379) |
| ~~Q-3~~ | ~~**Les e2e ne sont pas typecheckés**~~ : `apps/api/test/` était hors de l'`include` du tsconfig, donc le seul filet de la couche API (cf. Q-1) tournait sans vérification de types — 16 erreurs y dormaient. | ✅ | résolu en **#130** ([#126](https://github.com/Cimavia/cimavia/issues/126)), complété en **#57** — `tsconfig.test.json` couvre `test/` **et** les deux configs Vitest, branché sur le `typecheck` de l'API |
| ~~Q-4~~ | ~~**Les composants et écrans web n'ont pas de filet** : la couverture est mesurée depuis #56, elle affiche ce qu'elle mesure. 169 fichiers `component/` + `screen/` (105 web, 64 mobile), dont **89** portent de la logique — état dérivé, filtres, tris, `switch` ; les 80 autres n'ont rien à affirmer.~~ Le harnais de rendu web et les **8 plus chargés** sont livrés en **#188** ; celui du mobile en **#156**. Le reste est faisable au coup par coup, le jour où on y touche. La bibliothèque (`feature/library`) est couverte en **#507**, le reste du web en **#508** : 99,9 % des lignes, 97,9 % des conditions, hors gardes mortes, supprimées en #512. Le mobile l'est en **#509** : 99,0 % des lignes, 97,2 % des conditions, hors gardes mortes (#512) et hors [#519](https://github.com/Cimavia/cimavia/issues/519). | ✅ | résolue en [#507](https://github.com/Cimavia/cimavia/issues/507), [#508](https://github.com/Cimavia/cimavia/issues/508) et [#509](https://github.com/Cimavia/cimavia/issues/509) — [#188](https://github.com/Cimavia/cimavia/issues/188) · volet mobile : **#156** (et non #137, qui ne traite que des adaptateurs de formatage — pointeur corrigé en #156) |
| ~~Q-5~~ | ~~**La Quality Gate bloque la CI alors que `main` est rouge**~~ : la période de code neuf était `days: 30`, héritée de l'instance et jamais choisie ; tout ce qui avait moins d'un mois pesait dans `new_coverage`, et le job sur `push: main` échouait à chaque merge. Le mode « previous version » n'était pas disponible tant qu'aucune version n'était envoyée au scan. | ✅ | [#186](https://github.com/Cimavia/cimavia/issues/186) pose `sonar.projectVersion` ; période passée en `previous_version` dans SonarCloud (constaté par l'API le 2026-09-25) ; [#318](https://github.com/Cimavia/cimavia/issues/318) rend sa référence juste — voir « Tranché en #318 » |

## Séances et exercices

### P2 — Exercices & Séances

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~P2-3~~ | ~~**Pas de drag & drop** dans le SessionBuilder~~ : réordonnancement par boutons ↑/↓. | ✅ | jamais vraie pour le `SessionBuilder`, qui a le glisser **depuis son commit de création** — [#165](https://github.com/Cimavia/cimavia/issues/165) l'annonçait (« absorbe #93 ») sans que #93 soit fermée. [#93](https://github.com/Cimavia/cimavia/issues/93), recyclée, a couvert les **deux surfaces qui manquaient** : la séance planifiée et les séances d'une journée |

### Post-MVP — Quitter une saisie non enregistrée ([#327](https://github.com/Cimavia/cimavia/issues/327))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~G-1~~ | ~~**Le panneau d'une séance planifiée n'est pas gardé** : son titre, ses notes et sa date se perdent sans confirmation, qu'on navigue hors du cycle ou qu'on referme le panneau. Il ne remonte aucun état « modifié » au constructeur, qui ne garde que l'en-tête et la facturation. Trois champs courts, là où les constructeurs de bibliothèque portent des grilles entières.~~ | ✅ | résolue par [#518](https://github.com/Cimavia/cimavia/issues/518) : le panneau porte désormais une grille de dosage par exercice, et le déclencheur (« trois champs courts ») ne tenait plus. Fermer le panneau ou quitter le cycle demande, comme les constructeurs |
