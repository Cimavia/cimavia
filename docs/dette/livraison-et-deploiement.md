# Dette technique — Livraison et déploiement

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P7 — Déploiement FR

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P7-1 | **Image API à ~1 Go**, dont ~150 Mo de React Native tirés par les peerDependencies de `@better-auth/expo` — dans une image de **serveur**. Ce code mort porte aussi les alertes de sécurité rejetées en #398 (`image-size`, `uuid`, `decode-uri-component`). **Le plan de #86 est caduc** : `@better-auth/expo` 1.6.23 déclare déjà ses peers Expo optionnelles, et pnpm les résout quand même depuis le mobile. | 🟢 | [#86](https://github.com/Cimavia/cimavia/issues/86) |
| P7-2 | **Migrations jouées au démarrage du conteneur** (`prisma migrate deploy` dans l'entrypoint) plutôt qu'en étape de déploiement distincte. | 🟡 | [#84](https://github.com/Cimavia/cimavia/issues/84) |
| ~~P7-3~~ | ~~**Aucun e-mail de réinitialisation n'était envoyé**~~ : `sendResetPassword` journalisait le lien en `// MOCKED`, dernier du dépôt. Personne n'aurait pu récupérer son mot de passe en production. **Jamais inscrite ici au moment où elle a été prise** — c'est la règle de capture qui a été manquée, pas le raccourci qui était illégitime. | ✅ | résolue en **#63** — `MailService` + catalogue serveur FR/EN ([#62](https://github.com/Cimavia/cimavia/issues/62) · [#63](https://github.com/Cimavia/cimavia/issues/63)) |
| ~~P7-4~~ | ~~**MinIO est figé, et vulnérable là où il est exposé**~~ : MinIO a retiré ses images de Docker Hub (2026-09-13, E2E et déploiement NAS cassés) et ne publie plus d'édition communautaire. Les deux composes tirent désormais `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` et `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z` — même digest que l'ancien `latest`, donc aucun changement, et aucun correctif à venir. Or cette version est visée par des écritures d'objets **sans authentification** (`CVE-2026-41145`, `CVE-2026-40344`) corrigées dans aucune image, et le NAS l'expose sur `s3-dev`, qu'aucune policy Access ne peut protéger puisque le téléphone appelle les URLs signées. Le dev local et l'E2E ne sont pas exposés, mais dépendent d'un registre que MinIO peut retirer à son tour. | ✅ | résolue en **[#257](https://github.com/Cimavia/cimavia/issues/257)** — SILO, fork maintenu de MinIO qui corrige les deux failles (`RELEASE.2026-04-17`), tiré d'un miroir `ghcr.io/cimavia` ; les données du NAS restent dans leur volume |
| P7-5 | **Le profil EAS `production` ne déclare ni `EXPO_PUBLIC_API_URL` ni `EXPO_PUBLIC_WEB_URL`** : Metro les inline au build, le `.env` du poste n'est pas envoyé à EAS, et `api.ts`, `auth.ts` et `ForgotPasswordScreen` se replient alors sur `localhost`. Le build réussit, l'app ne joint jamais l'API. Jamais vue parce qu'aucun build `production` n'est parti. **Jamais inscrite ici** — découverte en #134 en préparant la sortie store. Le web porte le même repli, tenu par le seul workflow de déploiement. **Périmètre réduit en #287** : `app.config.ts` refuse désormais toute variante hors `development` sans les deux URL — le build `production` échoue au lieu de produire un binaire muet, et un update aussi. Les variables vivent dans les environnements EAS, plus dans `eas.json`. Reste l'URL elle-même. | 🟡 | [#255](https://github.com/Cimavia/cimavia/issues/255) — garde posée en [#287](https://github.com/Cimavia/cimavia/issues/287) |
| ~~P7-6~~ | ~~**Le NAS était déployé par un runner auto-hébergé inscrit sur un dépôt PUBLIC**~~, conteneur `myoung34/github-runner` avec le socket Docker de l'hôte monté. Un contributeur déjà mergé une fois pouvait ouvrir une PR apportant son propre workflow `runs-on: [self-hosted, cimavia-dev]`, exécuté sur le NAS sans approbation (`first_time_contributors`) — c'est-à-dire root sur toute la machine. Tolérable tant que le NAS ne portait que des données synthétiques ; plus du tout depuis qu'il porte celles du Coach bêta ([#260](https://github.com/Cimavia/cimavia/issues/260)). **Jamais inscrite ici** : le runner date du montage du NAS en P7. | ✅ | résolue en **[#266](https://github.com/Cimavia/cimavia/issues/266)** — le NAS tire la version promue (`pull-preview.sh`), plus aucun runner. En attendant la PR, l'approbation des workflows de fork est passée à « all external contributors » le 2026-09-14 |
| P7-7 | **Les sauvegardes du NAS ne sortent pas du NAS** : depuis [#268](https://github.com/Cimavia/cimavia/issues/268), `backup.sh` écrit chaque nuit un `pg_dump` relu et un miroir du bucket dans `backup/`, à côté du `.env` — mais sur le même disque que les données qu'il protège. Ça couvre le `down -v`, le bug qui efface, la migration fautive et la suppression par erreur, c'est-à-dire les pannes les plus probables. Ça ne couvre ni la panne de disque, ni le rançongiciel, ni le vol ou l'incendie. Le hors-site est **manuel** (archive chiffrée, `deploy/preview/README.md`), donc oubliable. **Jamais inscrite ici avant #268** : le NAS n'a longtemps porté que des données synthétiques. | 🟡 | — *(déclencheur : preview qui dure, un second Coach, ou une copie manuelle qui date de plus d'un mois)* |
| ~~P7-8~~ | ~~**L'API signait ses URLs avec le compte ROOT du stockage**~~ : `deploy/dev/docker-compose.yml` passait la même paire à `MINIO_ROOT_USER` et à `S3_ACCESS_KEY_ID`. Or une clé d'accès est lisible **en clair dans chaque URL signée** (`X-Amz-Credential`), et c'est tout ce qu'exigeaient les deux écritures sans authentification que SILO corrige. Une fuite de l'environnement de l'API donnait l'administration complète du stockage, pas l'accès à ses médias. **Jamais inscrite ici** : le NAS n'a longtemps porté que des données synthétiques. | ✅ | résolue en **[#267](https://github.com/Cimavia/cimavia/issues/267)** — une clé dédiée, limitée aux objets du bucket, créée par `silo-setup` |
| P7-9 | **Une adresse invitée s'inscrit sans être vérifiée** : depuis [#263](https://github.com/Cimavia/cimavia/issues/263), preview n'accepte que les adresses invitées ou listées — mais rien ne prouve que celui qui s'inscrit **possède** l'adresse. Qui connaît l'adresse d'un Athlete invité et pas encore inscrit peut créer le compte à sa place, trouver l'invitation qui l'y attend et accepter la liaison. Le mode `invitation` ferme la porte à qui ne connaît aucune adresse, pas à qui en connaît une. | 🟡 | [#270](https://github.com/Cimavia/cimavia/issues/270) |

> **Tranché en #266** (on promeut une VERSION, jamais un merge) : jusqu'ici, chaque push sur `main`
> partait sur le NAS dans la minute, migrations comprises — une migration fautive frappait les
> données du Coach sans que personne ait rien validé. Désormais `promote-preview.yml`, lancé à la
> main avec un numéro publié, pose le tag `preview` et le NAS le tire.
>
> - **Une release d'abord.** Promouvoir un commit quelconque aurait marché, mais la ligne de version
>   de l'écran de compte afficherait l'ancien numéro sur du code plus récent : un retour de bêta
>   citerait un numéro faux, ce que #187 existait précisément pour empêcher.
> - **Sauter des versions, oui ; revenir en arrière, jamais.** `migrate deploy` rattrape les
>   migrations manquantes dans l'ordre, mais une version plus ancienne tournerait sur un schéma déjà
>   migré. Le workflow refuse tout numéro inférieur ou égal à celui que porte la branche `preview`.
> - **La branche `preview` dit ce qui tourne**, avancée en fast-forward par l'App de release, seule
>   exception au ruleset « Production » (« Restrict updates »). Corollaire à ne pas relire de
>   travers : la règle « historique linéaire » du ruleset ne contraint plus rien, `main` contient
>   des commits de merge et l'App passe outre ; elle ne s'appliquerait qu'à qui ne peut de toute
>   façon rien pousser.
> - **Les checks sont vérifiés, pas rejoués.** `ci.yml` ne tourne plus sur `preview` ni sur
>   `production` — il tourne sur les PR vers `main` et sur `main` : le commit promu y a déjà passé
>   les trois checks, et le workflow le vérifie par l'API avant de publier. *(Précisé en #318 :)*
>   cette vérification lit les check-runs **sur le sha du commit de release de `main`**, pas sur
>   celui de sa PR. Elle dépend donc du run `push: main` de ce commit — celui que #318 restreint au
>   commit de release, et qu'il ne faut jamais couper.

> **Tranché en #266** (le NAS tire, et c'est le compose DU COMMIT PROMU qu'il déploie) : sans
> runner, plus rien n'apporte au NAS une copie à jour de `deploy/dev/docker-compose.yml`. Une copie
> à la main aurait divergé dès le premier changement du compose — et quatre issues ouvertes le
> modifient. `pull-preview.sh` lit donc dans l'image de l'API l'étiquette
> `org.opencontainers.image.revision` et télécharge le compose de ce commit (le dépôt est public).
>
> - **Le script, lui, est une copie** : il ne se met pas à jour tout seul, et le runbook le dit.
> - **Les images sont épinglées par digest**, pas par tag : une promotion peut déplacer `preview`
>   pendant un passage. D'où `image: ${API_IMAGE:?…}` dans le compose, qui refuse de démarrer sans
>   le script.
> - **Un projet compose renommé** (#271) garde ses volumes sous leur ancien nom : le script arrête
>   l'ancien projet avant de démarrer le nouveau, sinon deux PostgreSQL écriraient dans le même
>   volume.
> - **GHCR reste privé**, avec un jeton classique `read:packages` posé sur le NAS. Un tag `preview`
>   public dirait à tout le monde quelle version tourne — ce que « Tranché en #186 » a refusé en
>   mettant la version derrière authentification.

> **Tranché en #266** (reconnaître le redémarrage sans exposer la version) : un déploiement tiré ne
> rougit plus rien dans GitHub. Le workflow de promotion attend donc, jusqu'à 20 minutes, un
> `uptime` de `/health` plus court que le temps écoulé depuis la promotion, puis `/health/ready`.
> Limite assumée : un redémarrage sans rapport dans cette fenêtre tromperait la sonde. L'autre voie
> — publier le numéro sur `/health` — défaisait #186. Le NAS signale aussi ses échecs lui-même
> (e-mail de la tâche DSM sur code de sortie non nul).

> **Tranché en #266** (plus d'image web sur `main`, plus de `concurrency` sur la construction) :
> l'image web n'avait plus de lecteur, et ses sourcemaps auraient été téléversées sous le même nom
> de release Sentry (`1.2.2+3f2a1c`) que le build de promotion — l'écrasement que #186 voulait
> éviter. Quant au groupe `cancel-in-progress` par branche, il annulait la construction en cours au
> push suivant et remplaçait de toute façon une exécution en attente : un merge suivant de près la
> PR de release suffisait à perdre l'image `X.Y.Z`, la seule que la promotion sait retaguer.
>
> *Renversé en #417* pour sa première moitié : l'image web est revenue sur `main`
> (`web-image.yml`), parce qu'elle y est désormais l'artefact que la promotion retague — voir
> « Renversé en #417 » sous « Tranché en #186 ». Ses sourcemaps n'y partent qu'au commit de bump.
> La seconde moitié tient, et vaut pour les deux images : toujours pas de `concurrency`.

> **Appris en #266** (un `.env` cassé ne se voyait que dans l'onglet Actions) : le 2026-09-14, la
> commande de sauvegarde de #264 s'est retrouvée collée dans le `.env` du NAS. `docker compose` a
> refusé de le lire, et trois déploiements d'affilée ont échoué sur « Pull & up » — le Coach est
> resté sur l'image de la veille sans que rien ne le lui dise, ni à personne hors de GitHub.
> `pull-preview.sh` valide désormais le compose contre le `.env` (`config -q`) avant d'agir, écrit
> la cause dans son journal, et sort en erreur pour que la tâche DSM l'envoie par e-mail.

> **Tranché en #257** (SILO maintenant, Garage sur déclencheur) : MinIO communautaire est figé, et
> sa dernière image acceptait des écritures d'objets **sans authentification** pour qui connaît une
> clé d'accès — or elle est en clair dans chaque URL signée (`X-Amz-Credential`), et c'est la clé
> root sur le NAS. Deux remplaçants couvraient nos huit opérations S3 et le CORS :
>
> - **SILO** (`pgsty/silo`), le fork maintenu de MinIO : **changement d'image**, même API, mêmes
>   variables `MINIO_*`, même format sur disque. Ses correctifs sont prouvés, pas supposés : son
>   registre de sécurité donne `CVE-2026-41145` et `CVE-2026-40344` corrigées en
>   `RELEASE.2026-04-17`, dont les notes citent les deux avis GitHub, et `CVE-2025-62506` en
>   `RELEASE.2025-12-03`. Revers : un mainteneur principal.
> - **Garage** (Deuxfleurs) : le choix le plus durable — plusieurs mainteneurs, purge des envois
>   abandonnés appliquée (U-6), droits par clé et par bucket (#267) — mais il coûtait une migration
>   des médias réels du NAS et un CORS à poser partout, là où MinIO et SILO l'acceptent d'office.
>
> SILO ferme la faille sans toucher aux données et ne ferme aucune porte : passer à Garage plus tard
> coûtera ce que ça coûte aujourd'hui. **Déclencheurs pour Garage** : SILO ne publie plus rien
> pendant trois mois, tarde sur un correctif critique, ou la purge absente (U-6) se met à coûter.

> **Mesuré en #257** (SILO se conduit comme MinIO, défaut compris) — `RELEASE.2026-09-16`, en local :
> les 359 e2e passent ; `ListMultipartUploads` voit un envoi ouvert ; `ListParts` ne voit qu'une
> part après un renvoi signé sous le même `PartNumber`, et l'objet recollé porte les octets du
> second envoi ; le préflight CORS d'un `PUT` signé depuis le web local répond 204 sans
> configuration ; la règle de `deploy/prod/bucket-lifecycle.json` est **refusée** (400), et
> accompagnée d'une `Expiration` elle est acceptée puis relue **sans** la clause d'abandon —
> exactement le comportement de MinIO. Un seul écart : SILO expose `ETag` en CORS sur la réponse du
> `PUT`. Le client n'en a pas l'usage, l'API relisant les ETags par `ListParts`.

> **Tranché en #257** (les images de stockage viennent de NOTRE registre) : le 2026-09-13, MinIO a
> retiré ses images de Docker Hub et l'E2E — check requis — est tombé d'un coup ; le 2026-09-15, une
> panne de quay.io a bloqué une PR pendant des heures. `mirror-images.yml` copie donc SILO et `mc`
> dans `ghcr.io/cimavia`, et les composes ne tirent que de là. Les deux paquets sont **publics**
> (irréversible, et sans conséquence : ce sont des copies d'images publiques), ce qui épargne tout
> `docker login` en CI comme en local. Il a fallu autoriser les paquets publics dans les réglages
> de l'organisation, qui les interdisaient.
>
> **Dependabot n'en suit pas les versions, et ce n'est pas un oubli** : il ne comprend pas les tags
> `RELEASE.…` de MinIO et de ses forks (dependabot-core#11680). Le même workflow copie chaque lundi
> la dernière version publiée et tient à jour une issue `[silo-version]` tant qu'un compose en
> épingle une plus ancienne. Monter le tag reste une PR relue, rejouée par les e2e.

> **Tranché en #257** (renommer `minio` en `silo` sans perdre une donnée) : le service, les
> conteneurs et l'étape de CI changent de nom ; **les volumes, non**. Déclarés sous leur nom réel
> (`name: api_minio_data` en local, `cimavia-dev_minio_data` sur le NAS, relevé par
> `docker volume ls`), ils sont repris tels quels — renommer le volume aurait démarré un stockage
> vide. Deux faits mesurés rendent le changement sûr :
>
> - `docker compose up -d --remove-orphans` **arrête et supprime l'ancien conteneur avant de créer le
>   nouveau** : deux serveurs n'écrivent jamais ensemble dans le même volume. Un objet écrit par
>   `minio` a été relu par `silo`.
> - Sur le NAS, le service `silo` garde un **alias réseau `minio`** : le tunnel Cloudflare vise
>   encore `http://minio:9000`, et la promotion qui renomme le service ne coupe donc pas les médias
>   du Coach. Le tunnel passe à `silo:9000` et l'alias disparaît avec #271.
>
> La bascule du NAS ne demande rien de plus : `pull-preview.sh` télécharge le compose de la version
> promue et passe par `up -d --remove-orphans`. En local, un poste qui avait déjà le compose doit
> lancer une fois `up -d --remove-orphans` (README).

> **Tranché en #268** (le script fabrique une copie COHÉRENTE, il ne l'emporte pas) : sauvegarder le
> NAS, c'est deux gestes de nature différente. Le premier demande de savoir ce qu'on sauvegarde —
> copier les fichiers du volume PostgreSQL à chaud ne vaut rien, il faut un `pg_dump`, et le relire
> pour prouver qu'il n'est pas tronqué ; c'est ce que fait le script, versionné. Le second, emporter
> la copie ailleurs, ne demande aucune connaissance du projet : Hyper Backup ou une archive chiffrée
> le font mieux qu'un script maison. Ils ne sont donc pas mêlés.
>
> - **Le miroir des médias reflète les suppressions** (`mc mirror --remove`). L'inverse aurait fait
>   survivre indéfiniment tout média effacé, ce qu'un droit à l'effacement
>   ([#285](https://github.com/Cimavia/cimavia/issues/285)) ne peut pas accepter. L'historique long,
>   ce sont les copies manuelles.
> - **La rétention compte les dumps, elle ne regarde pas leur âge** : sept fichiers gardés. Une
>   rétention par âge laisserait un NAS éteint trois semaines se réveiller sans aucune sauvegarde.
> - **Le manifeste existe pour qu'on vérifie sans restaurer** : nombre d'objets, tailles, empreinte
>   du dump. Le script refuse d'ailleurs de finir si la copie et le bucket ne comptent pas le même
>   nombre d'objets.
> - **Le chiffrement n'intervient qu'à la sortie du NAS** : sur place, la copie n'est pas plus
>   exposée que les données vivantes, à côté desquelles elle vit.

> **Renversé en #268** (la règle « données synthétiques uniquement » du NAS n'existe plus, et il a
> fallu du temps pour l'écrire) : l'en-tête de `deploy/dev/docker-compose.yml` l'affirme encore, et
> c'est #271 qui la retirera. En attendant, le NAS porte les vraies planifications, les vrais médias
> et les vrais comptes du Coach bêta — c'est ce qui a rendu #266, #257, #268 et #285 nécessaires,
> chacune fermant une tolérance que cette règle rendait acceptable.

> **Tranché en #267** (deux identités, et `ListBucket` n'est pas pour l'API) : le stockage a
> désormais un compte **root**, qui administre et ne sort jamais du NAS, et une clé **d'API** qui ne
> peut que lire, écrire et supprimer les objets du bucket — plus gérer ses envois découpés. C'est la
> clé d'API qui voyage dans les URL signées ; elle ne doit donner accès qu'à ce qu'elle sert.
>
> - **Le droit de LISTER n'y est pas**, et ce n'est pas un oubli : l'API n'énumère jamais le bucket.
>   C'est `backup.sh` qui en a besoin, pour son miroir — il prend donc le compte root, ce qui est
>   cohérent, une sauvegarde étant une tâche d'administration. Vérifié : avec la seule clé d'API, le
>   miroir échoue en `Access Denied`.
> - **Les e2e tournent sous la clé restreinte.** Une permission oubliée doit faire rougir la CI, pas
>   se découvrir en panne sur le NAS. Les 359 e2e, envois découpés compris, passent sous cette policy.
> - **`silo-setup` réapplique la policy à chaque démarrage** : changer un secret dans le `.env` suffit
>   à le faire prendre au déploiement suivant, l'API et le stockage redémarrant ensemble.
> - **Le mot de passe root est à changer après la bascule** : il a vécu dans l'environnement de l'API,
>   donc il est à considérer comme connu.

> **Appris en #267** (le bucket e2e grossissait sans que personne ne le voie) : chaque exécution des
> e2e laisse ses médias derrière elle — **5969 objets pour 27 Gio** relevés sur un poste de
> développement, dont 54 pour la seule exécution suivante. En CI, le stockage est jetable, donc rien
> ne le signalait. `silo-setup` vide désormais ce bucket au démarrage ; celui de dev, jamais, puisqu'on
> y travaille avec ses propres données. Le chiffre a été découvert en sauvegardant ce bucket par
> erreur pendant un test — une sauvegarde qui copie 27 Gio dit quelque chose que personne n'avait
> regardé.

> **Appris en #267** (un script qui s'arrête sans rien dire) : dans `backup.sh`, lire une variable
> absente du `.env` faisait sortir `grep` en 1 ; sous `set -e`, une affectation dont la substitution
> échoue **arrête le script sur-le-champ** — donc avant la ligne qui aurait journalisé pourquoi. Le
> repli sur une autre identité n'était jamais atteint, et le journal restait vide. Corrigé par un
> `|| true` dans le lecteur de variables. À retenir pour tout script du dépôt : sous `set -e`, chaque
> `var="$(…)"` est une sortie silencieuse possible.

---

## Post-MVP — Observabilité front ([#183](https://github.com/Cimavia/cimavia/issues/183))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~O-1~~ | ~~**Sentry ne couvre que l'API**~~, malgré trois documents qui annonçaient « les 3 couches ». Le web et le mobile n'avaient ni SDK ni Error Boundary : un crash de rendu donnait un écran blanc côté web, fermait l'app côté mobile, sans aucune trace. | ✅ | résolu en **[#181](https://github.com/Cimavia/cimavia/issues/181)** (web) et **[#182](https://github.com/Cimavia/cimavia/issues/182)** (mobile) — les trois documents redeviennent vrais par le code, pas par réécriture |
| O-2 | **`@sentry/cli` déclaré en dépendance du mobile sans être importé** : il n'y sert qu'à exister au chemin `apps/mobile/node_modules/@sentry/cli`, que `sentry.gradle` construit en dur pour téléverser les sourcemaps. Son repli pnpm est inatteignable — il vit dans un `catch` que `execute()` ne déclenche jamais, `node --print require.resolve(…)` rendant une sortie vide plutôt qu'une exception quand la résolution échoue. Sans cette déclaration, le build EAS **release** échoue sur « a problem occurred starting process ». La version est épinglée sur celle qu'exige `@sentry/react-native` (2.58.4) : la laisser flotter installerait deux copies du binaire. | 🟢 | — *(bug amont ; déclencheur : une version de `@sentry/react-native` dont le `sentry.gradle` résout enfin pnpm — la dépendance pourra alors sauter)* |
| O-3 | **Les routes `/api/auth/*` ne laissent aucune ligne dans les journaux Pino** : Better Auth est branché sur Fastify avant les middlewares de Nest, et le logger HTTP de `nestjs-pino` en est un. Connexion, inscription, réinitialisation : ni statut ni durée dans Axiom — Sentry, lui, les voit. Découvert au test de #433. | 🟡 | [#466](https://github.com/Cimavia/cimavia/issues/466) |

> **Tranché en #183** (trois projets Sentry, pas un) : `cimavia-api`, `cimavia-web`,
> `cimavia-mobile`. Releases et sourcemaps s'attachent **par projet** — mêler un bundle Vite et un
> bundle Hermes dans un seul projet rendrait l'unminification hasardeuse. Le quota du plan gratuit
> est de toute façon partagé par l'organisation : séparer ne coûte rien et sépare les alertes.

> **Tranché en #183** (`sendDefaultPii: false` côté front, plus `setUser({ id })`) : sans `setUser`,
> une erreur est anonyme et l'on ne distingue pas *un* utilisateur qui boucle deux cents fois de
> *deux cents* utilisateurs touchés — or c'est ce chiffre qui décide si l'on corrige le soir même.
> Avec l'`id` seul, Sentry ne détient qu'un pseudonyme ; c'est en base, chez nous, qu'il redevient
> une personne. L'**API reste en `sendDefaultPii: true`** et envoie IP et en-têtes : l'asymétrie est
> assumée plutôt que corrigée en passant, changer ce réglage modifierait ce qu'on capture sur une
> couche qui marche, sans qu'aucun incident ne le demande.
> *Amendé en #433* : l'API garde `sendDefaultPii: true`, mais ni cookies, ni en-têtes secrets, ni
> corps de requête — voir plus bas.

> **Tranché en #183** (pas de Session Replay, `tracesSampleRate: 0`) : le Replay filmerait l'écran
> d'un coach, donc des données d'athlètes, pour un gain que l'écran de repli et la stack couvrent
> déjà. Le quota de performance, lui, se vide bien plus vite depuis un navigateur ou un téléphone
> que depuis l'API, et aucune question de perf front n'est ouverte — à monter à `0.1` le jour où il
> y en a une.

> **Tranché en #182** (un crash au tout premier rendu n'a pas d'utilisateur) : `setUser` vit dans un
> effet, et React n'exécute pas les effets d'un rendu qui a levé — un crash au démarrage part donc
> anonyme, d'autant que la session Better Auth n'est pas encore résolue à cet instant. Ce n'est pas
> réparable : à ce moment-là, l'identité n'est connue de personne. Un « 0 utilisateur » sur un crash
> de démarrage ne veut donc PAS dire que `setUser` est cassé. Tout crash survenant après le montage,
> lui, porte bien son `id`.

> **Tranché en #183** (le DSN front n'est pas un secret) : il part dans le bundle web et dans le
> binaire mobile, n'importe qui peut le lire. Il se range donc en **variable de dépôt** (`vars.`),
> comme `DEV_PUBLIC_API_URL`. Le réflexe inverse donnerait l'illusion d'une protection qui n'existe
> pas, et ferait passer une fuite du DSN pour un incident. Le seul vrai secret du chantier est le
> `SENTRY_AUTH_TOKEN` d'upload des sourcemaps, qui n'est jamais embarqué.
>
> *Précisé en #417* : le raisonnement tient, l'endroit a changé. Le DSN web n'est plus figé dans le
> bundle mais servi au démarrage dans `/config.js` : il vit dans le `.env` du NAS
> (`SENTRY_DSN_WEB`), plus dans GitHub.

> **Tranché en #335** (`sendDefaultPii: false` ne couvre QUE l'IP) : l'encadré ci-dessus sur
> `sendDefaultPii` a été lu, dans le code, comme « ni IP ni en-têtes ». Faux :
> `httpContextIntegration`, intégration par défaut du SDK navigateur, écrit `location.href`, le
> `Referer` et le `User-Agent` sur TOUT événement, quel que soit ce réglage. Sur
> `/reset-password?token=…`, le jeton partait donc chez Sentry. Trois décisions :
> - **Blanchir plutôt que couper l'intégration** : un `beforeSend` (`shared/lib/sentry-scrub.ts`)
>   remplace la valeur de `token`, `code` et `X-Amz-Signature` par `[Filtered]` dans l'URL, le
>   `Referer` et les fils d'Ariane. Le nom du paramètre reste : savoir sur quelle page est survenue
>   l'erreur, et qu'un jeton y était, sert au diagnostic. `code` est défensif, aucune route ne le
>   porte aujourd'hui.
> - **Le jeton quitte l'URL dès sa lecture** (`navigate` en `replace`), et le `beforeSend` n'est
>   pas optionnel pour autant : le fil d'Ariane de ce `replace` porte encore l'ancienne URL dans son
>   `from`. Prix assumé : recharger la page perd le jeton ; recliquer le lien du mail marche tant
>   qu'il n'a pas servi.
> - **Le test lit l'événement émis, pas l'option** : le vrai SDK tourne, seul le transport est
>   remplacé. Lire `sendDefaultPii: false` est précisément ce qui avait laissé passer la fuite.
>
> Hors de ce périmètre : la même famille côté API, traitée en
> [#433](https://github.com/Cimavia/cimavia/issues/433) (encadré suivant). Le mobile n'a pas d'écran
> de réinitialisation et envoie ses médias par `File.upload` (natif, sans fil d'Ariane) ; ses fils
> d'Ariane par défaut n'ont pas été relus.

> **Tranché en #433** (ce que l'API écrit dans ses journaux et envoie à Sentry — ferme aussi
> [#294](https://github.com/Cimavia/cimavia/issues/294)) : Pino recopiait tous les en-têtes, à
> chaque requête — cookie de session Better Auth rejouable sept jours, `authorization`, secret du
> tick — et le jeton d'appareil dans l'URL de révocation. Sentry
> y ajoutait le corps des requêtes, mot de passe de connexion compris, **sans qu'aucune erreur ne
> soit levée** : une transaction échantillonnée emporte la même requête qu'une erreur. Relevé en
> faisant tourner le vrai SDK, pas en lisant ses options. Quatre décisions :
> - **Une liste blanche pour Pino, pas un `redact`** (`observability/logger.config.ts`) : `req` se
>   réduit à `id`, `method` et l'URL blanchie, `res` à `statusCode`. Un `redact` aurait laissé
>   passer le prochain en-tête sensible, et ne sait pas réécrire une partie de l'URL — or deux
>   jetons sont DANS le chemin. L'IP, `query` et `params` partent avec.
>   *Corrigé en #357* : cet encadré ajoutait à la liste le `set-cookie` de la connexion et le
>   `location` de la redirection de réinitialisation. Faux — Pino n'a JAMAIS vu les routes
>   `/api/auth/*` : Better Auth est branché directement sur Fastify (`httpAdapter.use`), avant les
>   middlewares de Nest, et répond sans passer la main (dette **O-3**, [#466](https://github.com/Cimavia/cimavia/issues/466)). Constaté au test de la PR : une demande de
>   réinitialisation envoie son e-mail sans laisser de ligne `request completed`. Sentry, qui
>   écoute sous Fastify, les voit bien : le blanchiment de `/reset-password/<jeton>` y sert.
> - **Une seule liste de secrets d'URL** (`redactUrlSecrets`, `@cmv/shared`), pour le web, les
>   journaux et Sentry : les paramètres `token`, `code`, `X-Amz-Signature`, et les segments
>   `/reset-password/<jeton>` (le lien de l'e-mail, qui arrive sur l'API) et
>   `/push-tokens/<jeton>`. Ce dernier était un secret : sans la sécurité renforcée des push, il
>   suffisait à pousser vers l'appareil. Elle est activée depuis #357 ; il reste blanchi, parce
>   qu'il identifie l'appareil et redeviendrait suffisant si l'option était coupée.
> - **Le corps n'est jamais lu, sur aucune route** (`maxIncomingRequestBodySize: "none"`), plutôt
>   qu'une exception pour `/api/auth/*` : hors authentification, il porte aussi le code d'une
>   invitation et le texte d'un débrief, et une liste d'exceptions s'oublie à la prochaine route
>   sensible. Une 500 se rejoue avec sa stack, sans son corps.
> - **`beforeSend` ET `beforeSendTransaction`** (`observability/sentry-scrub.ts`) retirent cookies,
>   `authorization`, secret du tick et `set-cookie` — en-têtes de l'événement comme attributs de
>   span — et blanchissent tout ce qui porte une URL : nom de transaction, `http.target`,
>   `url.full`, `referer`, fils d'Ariane. `sendDefaultPii: true` reste (#183) : IP et autres
>   en-têtes partent toujours.
>
> Ce qui avait déjà fui n'a pas été purgé : Axiom n'a jamais reçu de journaux (`AXIOM_TOKEN` vide
> sur le NAS), et les journaux Docker du NAS, que seul son administrateur lit, disparaissent avec le
> conteneur au déploiement suivant. Les sessions en cours n'ont donc pas été invalidées. Côté
> Sentry, le nettoyage serveur par défaut du projet (« Data Scrubber ») masque les clés comme
> `password` ou `cookie` : les événements antérieurs se vérifient et se suppriment à la main.

---

## Post-MVP — Numéro de version du produit ([#184](https://github.com/Cimavia/cimavia/issues/184))

> **Tranché en #185** (le numéro se coupe sur `main`, pas à la promotion) : `main → staging →
> production` fait avancer le **même** numéro, elle n'en attribue pas un nouveau. Que `staging` soit
> en 1.3.0 pendant que `production` est en 1.2.0 est l'état normal — une seule lignée, deux têtes de
> lecture décalées par le temps de promotion. Le tier reste porté par `APP_ENV`, jamais par le
> numéro : les confondre rendrait impossible de dire qu'une même version tourne à deux endroits.

> **Tranché en #185** (aucun garde-fou mécanique sur un `feat` qui ne se voit pas) : l'épic posait
> la question des scopes techniques — un `feat(ci):` produirait un mineur sans rien changer pour un
> utilisateur. Le cas **n'existe pas dans ce dépôt** : sur 716 commits, zéro `feat(ci|infra|deps)`,
> parce que `ci` y est un **type** et non un scope. Trois raisons de ne pas armer la règle malgré
> tout : `scope-enum` est indifférent au type et ne saurait pas l'exprimer sans convertir
> `.commitlintrc.json` en config JS à plugin ; une liste noire sur `deps` entrerait en collision
> avec le `chore(deps):` de Dependabot ; et surtout un filtre par scope défendrait l'hypothèse
> nommée en laissant passer le vrai risque — un `feat(api):` interne, que rien ne distingue d'une
> fonctionnalité. La porte est **humaine et déjà là** : rien n'est numéroté sans que la PR de
> release soit mergée, et c'est à ce moment que le CHANGELOG se lit. `Release-As:` corrige un bump
> faux.

> **Appris en #187** (le mobile n'a RIEN à composer pour sa release Sentry, et c'est voulu) : l'API
> et le web assemblent `1.2.0+3f2a1c` à la main, le mobile non — et il ne s'agit pas d'un oubli. Le
> SDK le fait déjà seul, depuis la couche native :
>
> ```js
> event.release = `${nativeRelease.id}@${nativeRelease.version}+${nativeRelease.build}`;
> event.dist    = `${nativeRelease.build}`;
> ```
>
> `version` vient d'`app.json` (écrit dans `Info.plist` et `build.gradle` au prebuild), `build` du
> `versionCode` / `buildNumber` géré par EAS. Ce qui manquait n'était donc pas le mécanisme mais la
> vérité de la donnée : `app.json` annonçait `1.0.0`. Le brancher sur `extra-files` en #186 a suffi
> à rendre ce nom exact.
>
> Le problème d'unicité qui impose le `+sha` ailleurs ne se pose pas ici : `autoIncrement` d'EAS
> garantit un `build` distinct à chaque build. Les trois couches ont chacune une identité unique,
> par trois mécanismes différents — un `release` explicite côté API et web, la dérivation native
> côté mobile. Une issue avait été envisagée pour « nommer les releases Hermes » ; elle aurait
> inventé du travail.

> **Tranché en #187** (le tier a DEUX vocabulaires, et on ne les uniformise pas) : `AppTier` compte
> quatre valeurs. Le web lit `VITE_APP_ENV` (`development | staging | production`, aligné sur
> l'`APP_ENV` de l'API), le mobile lit `Constants.expoConfig.extra.appVariant`
> (`development | preview | production`, posé par `app.config.ts`). `staging` n'existe que d'un
> côté, `preview` que de l'autre — parce que ce sont deux chaînes de livraison différentes, un
> build EAS interne n'étant pas un déploiement de serveur. L'issue affirmait que « le tier vient
> d'`APP_ENV` » ; c'est faux sur mobile, où `sentry.ts` explique déjà pourquoi inventer une
> `EXPO_PUBLIC_APP_ENV` de plus serait la mauvaise voie. L'union accueille les deux plutôt que de
> fabriquer un troisième vocabulaire que personne n'émettrait.

> **Renversé en #261** (un seul mot, `preview`, sur les trois couches) : la raison de l'encadré
> précédent a disparu. Les deux chaînes de livraison n'en font plus qu'une : l'épic
> [#260](https://github.com/Cimavia/cimavia/issues/260) fait du NAS l'environnement preview, et le
> build EAS `preview` pointe déjà dessus. Garder `staging` côté serveur aurait laissé un même
> environnement porter deux noms selon qui le lit — et un environnement à deux noms finit par en
> porter trois. `AppTier`, `APP_ENV` et le `env` de `GET /version` comptent donc trois valeurs,
> `development | preview | production`.
>
> - **`staging` est refusé explicitement** par le test du DTO, et pas seulement absent de l'union :
>   le laisser passer rouvrirait en silence le vocabulaire qu'on referme.
> - **Aucun client installé ne casse** : aucun serveur n'a jamais émis `staging`, le NAS tournait en
>   `development`.
> - **La branche garde un rôle** : `preview` pointera sur la version promue chez le Coach bêta
>   ([#266](https://github.com/Cimavia/cimavia/issues/266)), elle ne se contente pas de changer de
>   nom.
> - **Le NAS lui-même s'appelle encore `dev`** — hostnames, variables, workflow, dossier,
>   `APP_ENV=development`. Son renommage demande une bascule sans coupure et un nouveau build mobile :
>   il est suivi à part, en [#271](https://github.com/Cimavia/cimavia/issues/271).
>
> Les entrées de #185 et #186, qui disent `main → staging → production`, ne sont pas réécrites :
> c'est ce qu'on savait alors, et celle-ci suffit à les relire.

> **Tranché en #187** (une ligne de pied, pas un écran « À propos ») : l'issue posait la question
> ouverte, et la maquette y répondait déjà — `athlete_profile.dc.html` se termine par
> `Cimavia · v1.0.0`, sous « Se déconnecter ». Son « À trancher » s'appuyait par ailleurs sur une
> affirmation périmée, « aucun écran de réglages n'existe » : le mobile a `ProfileScreen` et le web
> `AccountScreen` depuis #13. Il n'y avait donc rien à créer, seulement une ligne à poser.

> **Tranché en #187** (deux clés i18n plutôt qu'une avec substitution) : `account.about.version` et
> `account.about.unknown`. Une clé unique où l'on aurait injecté `—` aurait marché à l'écran, mais
> le harnais de test tourne en `cimode` et **perd l'interpolation** : le cas d'absence serait
> devenu indistinguable du cas nominal, donc intestable. Deux clés rendent la décision de l'écran
> observable — c'est elle qu'on éprouve, la mise en forme du numéro étant couverte à 100 % dans
> `@cmv/shared`.

> **Tranché en #187** (le buster du cache est le NUMÉRO NU, pas le libellé affiché) : `query.tsx`
> lit `currentAppVersion()` et non `appVersionLabel()`. Le libellé porte le suffixe de tier,
> c'est-à-dire de la présentation ; l'identité d'un schéma de cache n'en dépend pas. Corollaire
> de la fermeture de **M-6** : le cache est jeté à CHAQUE montée de version, même sans changement de
> DTO. Ce sur-bust est assumé — une première ouverture qui recharge coûte infiniment moins qu'un
> écran mort pendant sept jours, et surtout l'oubli devient impossible au lieu d'improbable. Sans
> OTA, une montée de version est de toute façon un build de store.
>
> **Précisé en #287** : il y a désormais des updates, et la dernière phrase ne tient plus — une
> montée de version peut arriver par le réseau. Le buster reste juste : après un update,
> `Constants.expoConfig` vient du manifeste de l'update, donc `currentAppVersion()` rend le numéro
> du tag publié, et le cache est jeté comme après un build. C'est même le cas où il sert le plus :
> un update peut changer un DTO sans toucher au binaire.

> **Tranché en #186** (l'identité d'un artefact est `1.2.0+3f2a1c`, jamais le numéro nu) : entre
> deux releases, le tier dev republie une image à CHAQUE push sur `main` alors que le numéro
> n'avance qu'au merge de la PR de release. Dix builds différents portent donc le même numéro. Le
> nommer seul suffirait à casser deux choses : côté Sentry, les sourcemaps web téléversées sous ce
> nom s'écrasent entre elles et l'unminification désigne le mauvais code, sans rien dire ; côté
> GHCR, un tag `1.2.0` repoussé à chaque fois change de contenu. Le numéro rend LISIBLE, le sha
> rend UNIQUE, et l'on a besoin des deux. `APP_VERSION` et `APP_BUILD` voyagent donc séparément —
> Swagger, `GET /version` et l'écran d'à-propos veulent la première moitié seule.

> **Tranché en #186** (le tag Docker versionné n'est posé que sur le commit de bump) : corollaire du
> précédent. `deploy-dev.yml` détecte ce commit en comparant le `package.json` de HEAD à celui de
> HEAD~1, **et non en cherchant le tag `vX.Y.Z`** : `release.yml` le pose en réaction au MÊME push,
> et rien n'ordonne les deux workflows — s'y fier serait une course. Le contenu du fichier, lui, est
> déjà là. C'est aussi pourquoi `package.json` et `CHANGELOG.md` sont entrés dans les `paths` du
> déploiement : le commit de bump ne touche qu'eux, et sans ça le NAS aurait gardé l'ancien numéro
> jusqu'au prochain push de feature — l'écran d'à-propos aurait menti sur le tier où on le lit le
> plus.

> **Tranché en #186** (la version s'expose sur une route AUTHENTIFIÉE, pas sur `/health`) :
> `/health` est publique, et la version qui tourne dit quels correctifs sont passés et lesquels ne
> le sont pas. La divulgation est mineure et courante, mais elle se décide plutôt qu'elle ne se
> subit, et tous les lecteurs de cette information ont une session. Contrepartie assumée : le smoke
> check du déploiement, qui sonde `/health` sans session, ne peut plus dire quelle version il vient
> de rendre saine — c'est le journal de démarrage de `main.ts` qui le fait, au même endroit que le
> tier.

> **Tranché en #186** (la promotion RETAGUE, elle ne reconstruit pas) : contrainte posée AVANT que
> les workflows `staging` et `production` existent, parce qu'elle est impossible à rattraper après.
> Une image `1.2.0` validée en staging doit être le binaire exact qui part en prod : reconstruire
> donnerait deux artefacts différents sous le même numéro — dépendances résolues autrement, image de
> base qui a dérivé. L'en-tête du `Dockerfile` de l'API a été précisé en conséquence : « une seule
> image » veut dire une image PAR VERSION, promue telle quelle, le tier restant porté par `APP_ENV`.
>
> **L'image web est l'exception, et elle est structurelle** : un SPA fige `VITE_API_URL` dans son
> bundle au build, elle ne peut donc pas être promue par retag. Elle est reconstruite par tier —
> mais depuis le MÊME tag git, jamais depuis la branche de promotion.

> **Renversé en #417** (le web aussi est une image par version, promue par retag) : l'exception
> ci-dessus n'était structurelle que parce que le tier était figé dans le bundle. Elle coûtait ce
> que #186 refuse pour l'API — le web promu n'était pas l'artefact validé, ses dépendances et son
> image de base pouvant dériver entre deux builds du même tag —, et un workflow de production
> aurait dû reconstruire lui aussi. La prémisse est levée plutôt que l'exception supportée : ce qui
> dépend du TIER (l'URL de l'API, le DSN Sentry, le nom du tier) est servi par nginx en `/config.js`
> au démarrage du conteneur, depuis ses variables `CMV_*` ; seul ce qui dépend de la VERSION
> (`VITE_APP_VERSION`, la release Sentry) reste figé au build. `web-image.yml` construit donc le web
> sur `main`, le démarre, lui pose `X.Y.Z` au bump, et la promotion le retague comme l'API. Le
> principe de cet encadré sort renforcé : il vaut désormais pour les deux images.

> **Tranché en #417** (les sourcemaps web ne partent qu'au commit de bump) : une release Sentry par
> version, nommée `X.Y.Z+sha` comme celle de l'API — et non une par push sur `main`, pour des images
> `sha-*` qui ne seront jamais promues. Le jeton n'est passé à BuildKit que sur ce build ; sans lui,
> le plugin ne fait rien. L'écrasement que redoutait l'encadré sur l'identité `1.2.0+3f2a1c`
> n'existe de toute façon plus côté web : `@sentry/vite-plugin` 5.x rattache chaque sourcemap à son
> bundle par *debug ID*, pas par nom de release. Le nom sert désormais aux pages *Releases* et aux
> régressions, et `environment` y distingue preview de production.
>
> *Appris en #474* : aucune de ces sourcemaps n'était jamais partie, et ce depuis la première
> promotion (2026-09-16). L'étage de build n'avait pas de certificats racine, et `sentry-cli`
> échouait sur le TLS. Le build restait vert parce que `@sentry/vite-plugin` 5.4.0 traite l'échec de
> la release et du téléversement comme *récupérable* : il journalise et continue, là où sa doc
> promet l'inverse. D'où l'`errorHandler` qui lève dans `vite.config.ts`, et la règle qui en
> découle : un build qui reçoit le jeton et ne téléverse pas **échoue**. Au commit de bump, il échoue
> donc avant le tag `X.Y.Z` : la version n'est pas promouvable, plutôt que promue sans sourcemaps.

> **Tranché en #417** (la config du web échoue deux fois, et jamais en silence) : une variable
> `CMV_*` ABSENTE du conteneur n'est pas substituée par `envsubst`, nginx lit `${CMV_…}` comme une
> de ses variables et **refuse de démarrer** — d'où les trois variables toujours définies dans le
> compose, le DSN par `${SENTRY_DSN_WEB?}` (vide permis, absent refusé avant tout remplacement de
> conteneur), et `pull-preview.sh` qui attend désormais le web sain comme l'API. Une variable
> définie mais VIDE ou invalide arrive jusqu'au navigateur : `runtime-config.ts` la rend `null`, et
> `main.tsx` affiche `CmvCrashScreen` au lieu de monter l'app (règle dure n°5). Les deux replis
> d'avant disparaissent : `http://localhost:3000` — dans le Dockerfile, mais aussi dans `api.ts` et
> `auth.ts`, qui faisaient appeler le poste du Coach par son propre navigateur — et le tier
> `development` par défaut. Seul le DSN garde un vide légitime : il veut dire « pas de Sentry ».

> **Tranché en #417** (rien de secret dans `config.js`, et le filtre le garantit) : `config.js` part
> chez chaque visiteur, comme le bundle avant lui. L'image pose `NGINX_ENVSUBST_FILTER=^CMV_` : seules
> ces variables peuvent être substituées, si bien qu'une variable du conteneur ajoutée demain — un
> secret compris — ne peut pas finir dans ce que le navigateur reçoit par une faute de frappe dans
> le template. Le jeton Sentry reste un secret BuildKit, jamais un argument ni une variable
> d'exécution.

> **Appris en #185** (deux réglages qui paraissent anodins et cassent la pose du tag) — la première
> PR de release s'est ouverte, s'est mergée, et n'a produit **ni tag ni GitHub Release** :
>
> - **`separate-pull-requests: false` ne doit PAS être écrit** quand le dépôt n'a qu'un paquet. La
>   valeur par défaut vaut déjà `Object.keys(repositoryConfig).length === 1`, donc `true` ici ;
>   l'écrire à `false` réveille le plugin `Merge`, qui renomme la branche de release en
>   `release-please--branches--main` — **sans composant**. Or la phase de release lit le composant
>   dans le NOM DE LA BRANCHE et le compare à celui configuré (`cimavia`, déduit du nom du paquet) :
>   `undefined` ≠ `cimavia`, la release est abandonnée en silence. Le message suivant,
>   `There are untagged, merged release PRs outstanding - aborting`, verrouille alors toute
>   exécution ultérieure jusqu'à ce que le label `autorelease: pending` de la PR soit retiré.
> - **Un tag git nu ne suffit pas à amorcer** : `release-please` cherche des **GitHub Releases** et
>   non des tags (`Could not find releases` sur un dépôt qui portait pourtant `v1.0.0`). Seul le
>   `bootstrap-sha` a évité un CHANGELOG rédigé sur 716 commits. Toute reprise manuelle doit donc
>   créer la Release, pas seulement le tag.

> **Tranché en #185** (les six paquets restent à `0.0.0`) : ils sont tous `private` et aucun n'est
> publié — cinq numéros indépendants n'auraient aucun lecteur. Seule la racine porte la version, et
> `release-please` n'est configuré que sur `.`. La question se rouvre le jour où un paquet serait
> publié.

---


> **Tranché en [#509](https://github.com/Cimavia/cimavia/issues/509)** (couvrir le mobile) : les
> règles de #506, #507 et #508 valent telles quelles ; six choix de plus, propres au harnais natif.
>
> - **Les nouveaux tests montent les vrais hooks, les anciens sont étendus.** Seul l'appel de
>   `api.ts` est bouchonné (`importOriginal` puis écrasement de la seule fonction) : les clés de
>   cache sont les vraies, et ce sont elles que le cache persiste sur le disque pour le hors-ligne.
>   Les tests d'avant #507 qui mockent leurs hooks gardent leur harnais, comme en #508.
> - **Le minuteur ne sort pas de `SessionDetailScreen`.** `useTimerAlerts` et son calcul des
>   échéances restent dans l'écran ; le test les lit sur ce qui part vers `expo-notifications`
>   (contenu, délai, plafond de programmation). Les extraire aurait été un refactor sans filet,
>   que #506 interdit.
> - **Le bouchon d'`expo-notifications` rendait le minuteur inerte.** Sans
>   `SchedulableTriggerInputTypes` (et avec un `AndroidImportance` incomplet), la programmation
>   levait un `TypeError` que le `catch` du minuteur avale par conception : `scheduleTimerEnd`
>   rendait toujours `null`, et le rapport comptait couvert un chemin qui n'avait rien programmé.
>   Les valeurs du module réel sont reprises dans `test/native.tsx`.
> - **`RefreshControl` a son double**, un bouton `data-refresh="running|idle"` posé À CÔTÉ du
>   contenu — `react-native` y est mocké partiellement, tout le reste est le vrai `react-native-web`.
>   `react-native-web` jette `onRefresh` : sans lui, le tirer-pour-rafraîchir des huit écrans qui
>   l'offrent était inatteignable.
> - **Écart nommé : `BlockTimerChips` et `DurationChip`** (`ExerciseCard`) ne sont pas couverts ; ils
>   suivent dans [#519](https://github.com/Cimavia/cimavia/issues/519).
> - **Trois limites du harnais, contournées sans rien masquer.**
>   - NativeWind ne pose pas de `className` dans le DOM : `CmvBadge` est doublé en
>     `<span data-variant>` là où la variante est l'affirmation ; la couleur d'une tuile du tableau
>     de bord, elle, ne s'affirme pas.
>   - La `Modal` de react-native-web rend dans un portail (lire `baseElement`) et n'apparaît qu'au
>     bout de son fondu : le test le termine (`webkitAnimationEnd`).
>   - Le mode `cimode` d'i18next rend la clé sans ses paramètres. Là où l'interpolation EST
>     l'affirmation (un compte, un nom), le test enveloppe le composant dans un `I18nextProvider`
>     local aux traductions minimales. `MediaPicker:86` n'en a pas encore : sa branche reste
>     non couverte, faute de harnais et non faute de garde.

---

## Post-MVP — Build et distribution iOS ([#134](https://github.com/Cimavia/cimavia/issues/134))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~IOS-1~~ | ~~**Les chaînes de permission iOS ne passent pas par i18next**~~ (règle dure n°6) : elles sont gravées dans l'`Info.plist` AU BUILD, avant que le moindre JS s'exécute. #134 affirmait que les localiser sortait de ce que la config Expo expose, et cette ligne l'a d'abord recopié. | ✅ | résolue en [#254](https://github.com/Cimavia/cimavia/issues/254) — `expo.locales`, construit par `app.config.ts` depuis le bloc `permission.ios` des catalogues i18next ; repli sur le français (encadré ci-dessous) |
| IOS-2 | **Pas de build iOS en CI**, comme pour Android : les builds partent du poste de développement. | 🟢 | — *(déclencheur : un rythme de livraison qui justifierait un runner macOS payant)* |
| IOS-3 | **`UIBackgroundModes: ["audio"]` déclaré sans usage** : `expo-audio` le pose par défaut (`enableBackgroundPlayback`), l'app ne joue rien app fermée. Sans effet tant qu'aucune revue n'a lieu — la bêta passe par des testeurs TestFlight internes —, mais déclarer un mode inutilisé est un motif de rejet à la revue Apple — même famille que la chaîne de permission par défaut. | 🟡 | — *(déclencheur : le premier envoi à des testeurs TestFlight EXTERNES, ou à l'App Store — les testeurs internes ne passent aucune revue)* |
| IOS-4 | **La chaîne micro est écrite DEUX fois** — `expo-image-picker` et `expo-audio`, même valeur au caractère près — et une troisième dans `fr.json` depuis #254. Les désynchroniser ferait dépendre le texte affiché de l'ordre du tableau de plugins. Depuis #254, `ios-permission-locales.test.ts` échoue si l'une des valeurs de base d'`app.json` s'écarte du catalogue français. L'encadré ci-dessous dit pourquoi la couper d'un côté était pire. | 🟢 | — *(déclencheur : aucun ; duplication assumée)* |
| IOS-5 | **Le code écrit pour iOS n'a jamais tourné** : `openOnIos`, `playsInSilentMode`, HEIC → JPEG, `video/quicktime`, le plafond des 64 notifications programmées. Aucun test ne peut les couvrir — seule une recette sur iPhone réel le peut. | 🟡 | [#134](https://github.com/Cimavia/cimavia/issues/134) |
| ~~IOS-6~~ | ~~**La chaîne de notification du minuteur n'a aucun test**~~ : `timer-alert.ts`, `useTimerNotification.ts`, et le calcul des échéances enfermé dans `SessionDetailScreen`. Découvert en mesurant `usePushToken` pour #134. Couverte en #509 : les deux premiers par leurs tests unitaires, le calcul des échéances à travers l'écran, sur ce qui part vers `expo-notifications` (encadré « Tranché en #509 »). Le plafond iOS réel reste à IOS-5. | ✅ | résolue en [#253](https://github.com/Cimavia/cimavia/issues/253), livrée par [#509](https://github.com/Cimavia/cimavia/issues/509) |

> **Tranché en #134** (TestFlight interne plutôt qu'ad hoc — arbitrage RENVERSÉ en cours de PR) :
> la bêta passait d'abord par la distribution `internal`, qui signe le binaire pour une liste
> d'UDID. Choisie pour l'absence de revue Apple, elle a buté sur un fait que l'arbitrage n'avait pas
> posé : **le développeur n'a pas d'iPhone, le coach bêta en a un**. L'ad hoc aurait exigé de
> collecter l'UDID du coach avant chaque build, et de reconstruire pour tout appareil ajouté ensuite.
>
> TestFlight ne signe pour aucun appareil. Un profil `testflight` étend `preview` — même variante,
> même API `api-dev` — et ne change que la signature (`distribution: store`) et la numérotation
> (`autoIncrement`, chaque envoi exigeant un numéro neuf). Le testeur est **interne** : aucune
> revue, au prix d'un accès — même restreint — au compte App Store Connect. Les testeurs externes
> auraient évité cet accès, mais leur premier build passe une revue qui applique les consignes de
> l'App Store (règle 2.2), et l'app ne sait pas supprimer un compte (#256).
>
> L'ad hoc n'est pas supprimé : `development` et `preview` restent `internal`, le dev client en
> ayant besoin pour se brancher sur Metro. `submit.production` reste sans identifiants tant que
> rien ne part vers l'App Store ; les deux profils d'envoi fixent seulement la langue de la fiche
> à `fr-FR`, qu'`eas-cli` mettrait sinon à `en-US`.

> **Découvert en #134** (`eas submit` lancé seul vise la mauvaise app) : pour trouver l'identifiant
> iOS, `eas submit` prend dans l'ordre une surcharge, le `bundleIdentifier` du profil d'envoi, puis
> `app.config.ts` évalué **sans** `APP_VARIANT` — les profils d'envoi n'ont pas d'`env`. Il retombe
> donc sur la variante `development` et vise `fr.cimavia.app.dev`, quel que soit le build envoyé.
> Seul `eas build --auto-submit` pose la surcharge, depuis l'identifiant du build qui vient de
> sortir. C'est pourquoi `build:testflight:ios` passe le drapeau, et pourquoi la commande de
> production devra le passer aussi. Lu dans `eas-cli` (`submit/ios/AppProduce.js`,
> `build/runBuildAndSubmit.js`), pas encore observé : aucun envoi n'est parti.

> **Tranché en #134** (`ios.supportsTablet` passe à `false`) : il était à `true` depuis toujours et
> personne n'a jamais vu un écran de cimavia sur iPad. Le laisser engageait l'app à être regardée en
> grand format à la revue Apple, captures d'écran comprises, pour une surface que rien ne vérifie.
> Le grand écran est déjà couvert par le web ([#20](https://github.com/Cimavia/cimavia/issues/20)).
> Fermer la cible ne coûte rien tant que personne ne la demande.

> **Découvert en #134** (couper la clé micro du picker aurait tué l'enregistrement vocal ANDROID) :
> l'issue demandait `cameraPermission: false` ET `microphonePermission: false` sur
> `expo-image-picker`, pour que l'ordre des plugins cesse de décider quelle chaîne l'`Info.plist`
> reçoit. Le raisonnement était juste, le geste non. Ce plugin n'écrit pas que des clés iOS : à
> `false`, il appelle `withBlockedPermissions` sur `android.permission.RECORD_AUDIO`, qui pose un
> `tools:node="remove"` dans le manifeste. `expo-audio` déclare bien cette permission, mais le
> contrôle de doublon (`isPermissionAlreadyRequested`) ne compare que `android:name` : il voit
> l'entrée bloquée comme déjà présente et ne la remplace jamais. Dans les DEUX ordres de mods
> possibles, `RECORD_AUDIO` sort du manifeste final — et rien n'échoue au build.
>
> Le geste juste est de donner au picker **la même chaîne** qu'`expo-audio` plutôt que `false` :
> les deux plugins écrivent alors la même valeur, l'ordre redevient indifférent (l'objectif visé),
> et aucune permission Android n'est bloquée. C'est ce que paie IOS-4. `cameraPermission: false`
> reste, lui : rien n'appelle `launchCameraAsync` dans le dépôt, et bloquer `CAMERA` côté Android
> est un gain.
>
> La leçon vaut au-delà du cas : **un plugin de config Expo nommé d'après une permission iOS peut
> agir sur Android**, et un `false` y veut dire « interdis à tout le monde », pas « ne déclare rien ».

> **Découvert en #134** (le mock de permission notifiait un refus que personne n'avait demandé) :
> `test/native.tsx` rendait `{ status: "granted" }` là où le vrai module rend AUSSI le booléen
> `granted`, seul champ que lisent `usePushToken` et `timer-alert`. Il valait donc `undefined`, tout
> appelant concluait au refus, et n'importe quel test écrit sur ce mock serait passé au vert sans
> rien éprouver. Un mock incomplet ne rate pas un test : il en fabrique un faux.

> **Tranché en #254** (les permissions iOS parlent la langue du téléphone, et se replient sur le
> français) : trois décisions, dont aucune ne se lit dans le code.
>
> - **Un seul catalogue.** Les traductions vivent sous `permission.ios` dans `fr.json` et `en.json`,
>   pas dans des fichiers `locales` au format Expo. Ceux-là auraient été un second endroit où vivent
>   des textes, invisible de `check:i18n` : ni tutoiement, ni clé morte. `expo.locales` accepte un
>   objet à la place d'un chemin, donc aucun script : `app.config.ts` appelle
>   `buildIosPermissionLocales` (`shared/lib/`), dont la table `IOS_PERMISSION_KEY` est lue par le
>   contrôle A. `en.json` est né avec ce seul bloc ; #87 le complète. L'import porte son extension
>   `.ts` : sans elle, le chargeur de config d'Expo ne le résout pas.
> - **La langue de repli est `CFBundleDevelopmentRegion`, pas la « valeur de base ».** #254 disait
>   que le texte des plugins s'afficherait pour toute langue absente de `locales`. C'est faux dès
>   qu'un `.lproj` existe : iOS choisit alors celui de la langue de développement, que le gabarit
>   Expo fixe à `en`. Un téléphone en allemand aurait lu ses permissions en anglais, et l'app en
>   français. `app.config.ts` la force à `fr`, le `fallbackLng` d'i18next
>   ([#88](https://github.com/Cimavia/cimavia/issues/88)) : les deux changent ensemble, et un
>   changement exige un nouveau binaire.
> - **`NSFaceIDUsageDescription` retirée** (`faceIDPermission: false` sur `expo-secure-store`) :
>   le plugin la posait avec son texte anglais par défaut, et rien n'appelle `requireAuthentication`.
>   Même famille qu'IOS-3. Contrairement au piège de #134, ce `false` ne touche aucune permission
>   Android — vérifié dans le plugin, qui n'écrit que cette clé.
>
> Le générateur d'Expo écrit `clé = "valeur";` sans échapper : `buildIosPermissionLocales` refuse
> un guillemet droit ou une barre oblique inverse plutôt que de produire un `InfoPlist.strings`
> invalide sans erreur de build. Vérifié par un prebuild iOS : `fr.lproj` et `en.lproj` portent les
> deux clés, l'`Info.plist` porte `CFBundleDevelopmentRegion = fr` et plus de clé Face ID. Rien de
> tout cela n'a encore été vu sur un iPhone (IOS-5).

---

## Post-MVP — Correctifs poussés sans rebuild ([#287](https://github.com/Cimavia/cimavia/issues/287))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| OTA-1 | **Les updates partent du poste de développement**, pas de la CI : `pnpm ota:preview` depuis `apps/mobile`, tag extrait à la main. Le script refuse un arbre hors tag ou modifié, mais rien ne garantit que le tag extrait est celui que le NAS a promu. | 🟢 | — *(déclencheur : une publication depuis la CI — elle sauterait en plus la vérification `--environment`, que `eas-cli` désactive en CI)* |
| OTA-2 | **« Pas de `feat` mobile dans un update » est une procédure, pas une vérification** : le script ne connaît pas le tag du binaire installé, il ne peut donc pas lister ce qui les sépare. La commande `git log` du README le fait, à condition d'être lancée. | 🟡 | — *(déclencheur : un update qui porte une fonctionnalité, ou le premier binaire en production — la règle protège la revue Apple)* |

> **Tranché en #287** (`runtimeVersion` par empreinte native, version retirée de l'empreinte) : une
> update n'est servie qu'aux binaires de même `runtimeVersion`. La politique `appVersion` la tire du
> numéro de version, que release-please réécrit dans `app.json` à chaque release : un correctif
> publié depuis le tag 1.5.4 n'atteindrait jamais un binaire 1.5.3, c'est-à-dire personne. Une
> chaîne fixe montée à la main coupe ce lien, mais un oubli après l'ajout d'un module natif envoie
> un JS qui plante au démarrage. `fingerprint` hache ce qui est natif — modules et versions,
> plugins, config Expo évaluée — et change tout seul quand il le faut.
>
> **L'issue se trompait sur un point** : elle présentait `fingerprint` comme l'option qui ne coupe
> pas à chaque release. Par défaut, `@expo/fingerprint` hache aussi `version` — seuls les scripts du
> `package.json` sont exclus. `apps/mobile/fingerprint.config.js` ajoute `ExpoConfigVersions`, et
> répète l'exclusion par défaut, que `sourceSkips` remplace au lieu de compléter. Vérifié en #287 :
> sans ce fichier, passer la version de 1.5.3 à 1.5.4 change l'empreinte ; avec, non. Modifier un
> fichier JS ne la change pas non plus.
>
> **Ce qui la change, et coûte donc un build** : un module natif ajouté ou monté de version, un
> plugin, un identifiant, `APP_VARIANT` — et **`eas.json` et `.gitignore`**, que l'empreinte lit
> aussi. Ajouter un profil EAS coupe la diffusion vers tous les binaires déjà installés. `eas update`
> affiche l'empreinte qu'il publie ; `eas fingerprint:compare` la confronte à celle d'un build.
>
> Corollaire utile : un update publié sans `APP_VARIANT` porte une autre empreinte, et n'atteint
> personne. Sans elle, il serait arrivé chez le Coach tagué `development` — dans Sentry comme sur la
> ligne de version.

> **Tranché en #287** (une seule source pour les variables : les environnements EAS) : `eas update`
> ne lit pas les blocs `env` d'`eas.json`, réservés au build. Les garder et recopier les valeurs dans
> les environnements EAS aurait fait deux sources, qui divergent un jour — et une divergence sur
> `APP_VARIANT` change l'empreinte, donc coupe la diffusion sans rien dire. `eas.json` ne porte plus
> de valeurs : chaque profil nomme son `environment`, `testflight` hérite de celui de `preview`.
> Le prix : les valeurs ne sont plus lisibles dans le dépôt. Elles sont toutes publiques (inlinées
> dans le bundle), la liste vit dans le README.
>
> Effet de bord corrigé au passage : sans `environment` explicite, EAS range un build `store` dans
> l'environnement `production`. `testflight` y lisait donc son `SENTRY_AUTH_TOKEN` depuis #134.

> **Tranché en #287** (trois canaux gravés, un seul publié) : le canal est écrit dans le binaire au
> build. Le déclarer plus tard coûterait un build de plus, le déclarer maintenant ne coûte rien.
> `development`, `preview` et `production` en ont un ; seul `preview` reçoit des updates, par
> `pnpm ota:preview`. Il n'existe aucun script pour `production`, et c'est voulu.

> **Tranché en #287** (on ne publie que depuis le tag promu sur le NAS) : `eas update` emballe
> l'arbre de travail, alors que l'API de preview tourne la version PROMUE (#266). Un JS pris en tête
> de `main` peut appeler une route que le NAS n'a pas encore. Le JS et l'API voyagent donc sous le
> même tag — le principe de #186 appliqué au mobile. Le script le vérifie à moitié (voir **OTA-1**).

> **Tranché en #287** (un update ne porte que des correctifs) : la consigne 2.5.2 d'Apple interdit
> de télécharger du code « which introduces or changes features or functionality of the app ». La
> borne tient dans nos types de commit : aucun `feat` touchant `apps/mobile`, `packages/shared` ou
> `packages/tokens` entre le tag du binaire installé et celui qu'on publie. Tout le reste — `fix`,
> `perf`, `refactor`, texte — peut partir. Une fonctionnalité passe par un build. Tenue par la
> procédure seulement (**OTA-2**).

> **Tranché en #287** (l'update s'applique au lancement suivant, sans invite) : c'est le
> comportement par défaut d'`expo-updates` — téléchargé en arrière-plan au démarrage, appliqué au
> démarrage à froid suivant. Il faut donc DEUX lancements pour voir un correctif, ce que le Coach doit
> savoir. Une invite « Redémarrer », en miroir de #290 côté web, reste possible et n'a pas été
> demandée. Seule exception : l'écran de panne relance le JS (`Updates.reloadAsync`) au lieu de
> re-monter l'arbre, ce qui applique tout de suite un correctif déjà téléchargé — le crash est
> souvent ce qu'il corrige. On y perd l'écran en cours, pas la session.

> **Tranché en #287** (retour arrière et quota) : c'est le développeur qui décide d'annuler un
> update. `eas update:republish` republie un groupe antérieur ; `eas update:roll-back-to-embedded`
> renvoie les téléphones au JS embarqué dans leur binaire. Le plan EAS gratuit sert les updates à
> **1 000 utilisateurs actifs par mois**, 100 Gio de bande passante, sans dépassement facturé : au
> plafond, les updates cessent (expo.dev/pricing, lu le 2026-09-23). Sans effet pour la bêta, c'est
> le plafond de la production.

> **Tranché en #287** (la garde de #255 entre ici, pas l'URL de production) : `app.config.ts` est
> évalué par `eas update` comme par `eas build`. La garde qui refuse une variante hors
> `development` sans URL d'API ni URL web vaut donc pour les deux. Son déclencheur dans #255, « le
> premier build production », arrivait trop tard pour les updates. **P7-5** reste ouverte pour
> l'URL elle-même, qui n'existe pas.

> **Découvert en #287** (le premier build avec `expo-updates` a échoué sur les deux plateformes) :
> `expo-updates` ajoute au build natif une étape qui relance Metro pour lister les assets
> (`createUpdatesResources.js`), et Babel y échouait sur `Cannot find module
> '@babel/plugin-transform-react-jsx'`, puis sur `react-native-worklets/plugin`. Les deux sont
> appelés PAR LEUR NOM dans le preset de NativeWind (`react-native-css-interop/babel`), qui ne les
> déclare pas : il compte sur le hoisting. Babel les résout depuis `apps/mobile`, où pnpm ne les
> installe pas.
>
> Pourquoi le bundle passait jusque-là : il est produit par `expo`, lancé par son raccourci pnpm
> (`node_modules/.bin/expo`), et ce raccourci ajoute `node_modules/.pnpm/node_modules` à
> `NODE_PATH`. L'étape d'`expo-updates` lance `node` directement, sans ce raccourci. Rien ne
> distinguait les deux chemins en local, où `expo export` réussit.
>
> Correctif : les deux paquets sont déclarés par `@cmv/mobile` — `@babel/plugin-transform-react-jsx`
> en devDependency, `react-native-worklets` en dependency, **à la version déjà liée en natif**
> (0.10.0, qu'exige `react-native-reanimated` 4.5.0). L'étape se reproduit hors EAS :
> `node node_modules/expo-updates/utils/build/createUpdatesResources.js android "$PWD/android" <dossier> all`.
> Effet de bord bienvenu : `react-native-worklets`, installé comme pair implicite, tirait
> l'outillage de React Native **0.86** (`metro-config`, `babel-preset`, `codegen`) sous une app en
> 0.85.3 ; tout est réaligné sur 0.85.3.

> **Corrigé en #409** (le 0.10.0 ci-dessus n'est plus vrai) : `react-native-reanimated` est déclaré
> par `@cmv/mobile`, et le couple suit enfin le SDK 56 — **4.3.1 / 0.8.3** au lieu de 4.5.0 / 0.10.0,
> que `auto-install-peers` avait pris faute de déclaration. Les pairs de `react-native-css-interop`
> (`>=3.6.2`) et de `keyboard-controller` (`>=3.0.0`) l'acceptent. Les onze autres modules en retard
> sont montés par `expo install --fix`, qui garde les épinglages exacts là où ils l'étaient.
>
> **L'issue n'en voyait que douze.** `@expo/dom-webview` et `@expo/metro-runtime` étaient eux aussi
> sous le plancher qu'exigent `expo` et `expo-router` (56.0.5 et 56.0.15 contre `^56.0.6` et
> `^56.0.21`) : pairs implicites, le lockfile les gardait à leur première résolution, et `expo
> install --check` ne regarde que ce que le paquet déclare. Ils sont déclarés à leur tour. La règle
> qui en sort : **un paquet que le SDK versionne (`bundledNativeModules.json`) et que l'app installe
> se déclare**, sinon rien ne le surveille.
>
> **Ce que le lockfile garde** : une seconde copie de `reanimated` en 4.5.0, avec un avertissement
> de pair (elle veut `worklets` 0.10.x). Elle vit dans l'arbre Expo que `apps/api` tire par les pairs
> de `@better-auth/expo` — **P7-1**, [#86](https://github.com/Cimavia/cimavia/issues/86). Ni le
> bundle ni l'autolinking ne la voient : l'empreinte liste 4.3.1 et 0.8.3. La forcer demanderait un
> override, que `pnpm-workspace.yaml` réserve aux correctifs de sécurité.
>
> **L'empreinte native change, et le build attend** : #409 est fusionnée sans binaire, le build
> Android et iOS part après #407 et #254, qui la changent aussi. **Rectifié en #92** : #92/#155
> étaient comptées ici, mais n'ajoutent aucun module natif. Entre les deux, un update
> publié depuis un tag qui contient #409 **n'atteint personne**, sans erreur. Un correctif urgent
> pour le binaire installé se publie depuis un tag antérieur.

> **Découvert en #287** (Sentry voit le binaire, pas l'update) : la release Sentry est celle du
> binaire natif (`fr.cimavia.app.preview@1.5.3+N`), même quand le JS qui tourne vient d'un update
> 1.5.4. Ce qui les distingue est le contexte `ota_updates` (identifiant d'update, canal,
> `runtimeVersion`), qu'ajoute `@sentry/react-native` 7.11 sans configuration. La ligne de version
> de l'app, elle, lit le manifeste de l'update : elle affiche 1.5.4. Les sourcemaps sont retrouvées
> par `debugId`, pas par release — c'est ce qui rend `sentry-expo-upload-sourcemaps` suffisant.

---

## Post-MVP — Garde de démarrage des tiers déployés ([#357](https://github.com/Cimavia/cimavia/issues/357))

> **Tranché en #357** (ce qu'un tier déployé exige pour démarrer) : le `ConfigModule` valide
> l'environnement au boot pour que l'API refuse de démarrer mal configurée, mais un secret d'un
> caractère et une URL d'auth en http passaient. Le `superRefine` d'`env.schema.ts` durcit :
> - **Partout** : `BETTER_AUTH_SECRET` de 32 caractères au moins, et `REMINDER_TICK_SECRET` aussi
>   quand il est posé — absent, la route de tick reste fermée (503), comme avant. Better Auth ne
>   fait qu'avertir en dessous de 32.
> - **En `preview` ET en `production`** — l'issue ne visait que la production : `BETTER_AUTH_URL`
>   en https (en http, Better Auth retire `Secure` des cookies de session) et `EXPO_ACCESS_TOKEN`
>   obligatoire. Le NAS est inclus parce qu'il porte les vraies données du Coach bêta et qu'il est
>   joignable publiquement. Le développement local reste permissif : http sur une IP de LAN, et pas
>   de jeton Expo.
> - **La sécurité renforcée des push est activée** sur le compte Expo : sans jeton d'accès, Expo
>   refuse tous les envois, et l'échec ne se lit que dans les tickets. D'où l'obligation au boot
>   plutôt qu'une panne silencieuse. Le jeton appartient à un **robot** (`cimavia-push`, rôle
>   Viewer, suffisant pour envoyer), pas à un compte personnel : un jeton par environnement,
>   révocables séparément.
>
> Conséquence d'exploitation : une version qui durcit ces règles se **vérifie sur le NAS AVANT sa
> promotion** (README du preview) — sinon `pull-preview.sh` remplace l'API par une qui refuse de
> démarrer, et le preview tombe. Le smoke de `api-image.yml` démarre l'image en `preview` : ses
> valeurs factices suivent les mêmes règles.
