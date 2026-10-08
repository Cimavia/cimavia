# Dette technique — Débrief et médias

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P4 — Débrief & Médias

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P4-1 | **Vidéo non transcodée** : le plafond 720p n'est ni appliqué ni vérifié — une vidéo hors plafonds est **refusée**, pas réencodée. | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) |
| P4-2 | **Durée vidéo déclarative** : `durationSeconds` vient du client, le serveur ne décode pas le fichier. | 🟢 | [#81](https://github.com/Cimavia/cimavia/issues/81) |

*Résolues, à l'[archive](archive.md) : P4-3, P4-4, P4-5, P2-1 / P3-2.*

> **Tranché en #92** (la vignette tirée à l'AFFICHAGE, pas à l'envoi) : la stocker à l'envoi
> demandait une migration, un champ de DTO et un second envoi signé — et laissait sans image toutes
> les vidéos déjà envoyées, comme celles déposées depuis le web. Tirée sur l'appareil
> (`shared/lib/video-thumbnail.ts`), elle ne touche ni l'API ni la base, vaut pour l'existant, et ne
> coûte le réseau qu'à la première vue : la suivante lit le JPEG gardé dans le cache.
>
> **Sans module natif de plus** : `generateThumbnailsAsync` (expo-video, #407) rend une image
> NATIVE, que seul l'`Image` d'`expo-image` affiche — d'où la ligne de P4-4 écrite en #407. Mais
> `expo-image-manipulator` accepte cette même référence et l'écrit en fichier, que l'`Image` de
> React Native affiche. L'empreinte native ne bouge pas.
>
> **Ce qui la tient** : une génération à la fois (chacune ouvre un lecteur natif, relâché aussitôt),
> une seule par vidéo affichée deux fois, et une **époque** sur le modèle de `document-cache` :
> `resetAccountData` efface les vignettes au changement de compte, et une demande faite avant la
> déconnexion — en cours ou encore dans la file — n'écrit rien dans le magasin vidé. Tout échec rend
> `null`, et la pastille de #407 reste : une vignette est un confort, jamais une case vide.

> **Résolu en P4** : ~~P3-1~~ (push non envoyé) — `expo-server-sdk` est branché dans
> `NotificationService`, sans que les appelants aient bougé. ~~P3-6~~ côté débriefs — la tuile
> « Débriefs à relire » est connectée (la tuile factures a suivi en P6).

> **Tranché en #90** (prouver l'appareil sans passer par le canal push) : l'issue prescrivait un
> **challenge poussé au token** — l'API émet un nonce, le client renvoie ce qu'il a reçu. Écarté
> pour deux raisons que l'énoncé ne pouvait pas voir. D'abord iOS **étrangle les pushes
> silencieux** : le cas n°1 de la réaffectation est le téléphone de dev qui passe du compte coach
> au compte athlète, et on l'aurait fait dépendre du canal le moins fiable, avec un échec muet.
> Ensuite l'e2e qu'exigeait l'issue serait devenu **malhonnête** — « réaffectation avec challenge
> valide → 2xx » n'est testable sans téléphone qu'en allant lire le nonce en base, c'est-à-dire en
> testant la table plutôt que la preuve.
>
> Ce qui le remplace répond à la même question — « es-tu la même installation ? » — par un
> **secret d'installation** : le client le présente, l'API ne garde que son empreinte
> (`installationSecretHash`, sha256, comparé en temps constant). Qui connaît le token sans être
> sur l'appareil ne l'a pas ; l'appareil qui change de main, lui, l'a toujours et passe. Aucun
> aller-retour push, donc aucun chemin hors-ligne à prévoir, et l'e2e se fait en HTTP pur.
>
> **Le secret est émis par l'API, pas tiré par le téléphone** — l'inverse aurait été plus naturel.
> Le mobile n'a aucune source d'aléa cryptographique : ni `expo-crypto`, ni polyfill
> `crypto.getRandomValues` dans le runtime Expo 56. Le faire tirer côté client coûtait un module
> natif et un rebuild du dev client, pour un aléa que `randomBytes` produit déjà. Le téléphone n'a
> donc qu'à le **conserver**, ce que `expo-secure-store` fait déjà pour la session.
>
> **Le propriétaire n'est jamais refusé** : présenter un mauvais secret sur SA propre ligne
> déclenche une **réémission**, pas un 403. Sa session prouve déjà que la ligne est à lui — le
> secret n'a rien à prouver là. C'est le chemin de reprise d'un trousseau effacé ; sans lui, un
> appareil ayant perdu son secret ne serait plus jamais réaffectable.
>
> **La fenêtre héritée est assumée, et se referme seule** : une ligne d'avant #90 ne porte aucune
> empreinte, personne ne peut donc rien prouver dessus — elle est **adoptée** au premier
> enregistrement, qui la scelle du même geste. La refuser aurait condamné les appareils de la
> bêta. `usePushToken` réenregistrant à chaque montage, chaque appareil ferme sa propre fenêtre
> à la première ouverture de l'app à jour, et rien n'est pire qu'avant entre-temps.
>
> **Ce que l'issue disait de travers** : son déclencheur — « à revoir si un usage multi-comptes
> par appareil apparaît réellement (épic #7) » — était **désamorcé, pas déclenché**. #7 a livré
> les capacités sur un **seul compte** (voir « Tranché en #129 » et « Tranché en #9 ») : un
> coach-athlète a un basculeur d'espace, pas deux comptes. Et l'impact annoncé était doublement
> inexact : le vol est **auto-guérissant** (la victime reprend son token à sa prochaine ouverture
> d'app), mais la bascule faisait aussi afficher les notifications de l'attaquant **sur l'écran de
> la victime** — nuisance, pas fuite. Traité quand même, comme durcissement avant iOS.

> **Tranché en [#284](https://github.com/Cimavia/cimavia/issues/284)** (le texte du débrief effacé
> par le premier média) : ce média CRÉE le débrief, son identité naît, et le champ se
> resynchronisait sur elle. La règle vit désormais dans `draftAfterLoad` (`@cmv/shared`), appelée
> par les deux écrans.
>
> - **La frappe gagne, toujours** — y compris sur un texte écrit depuis un autre appareil pendant
>   la saisie : l'enregistrement l'écrasera, comme l'upsert le fait déjà. Le signaler à l'écran
>   demanderait une mécanique de conflit que le MVP n'a nulle part ailleurs, pour un cas qui exige
>   deux appareils sur la même séance au même moment.
> - **Une comparaison, pas le drapeau que l'issue prescrivait.** Le champ est « touché » quand il
>   diffère du texte chargé au dernier examen. Un drapeau posé à la frappe et remis à zéro par
>   l'enregistrement perdait ce qui avait été tapé PENDANT le premier envoi : le retour du serveur
>   éteignait le drapeau, l'identité naissait, la resynchro passait.
> - **Une autre séance repart d'un formulaire neuf, par une `key` sur la séance** (web et
>   mobile). C'était l'identité du débrief qui l'assurait jusqu'ici ; la frappe gagnant désormais,
>   sans la `key` elle passerait d'un débrief à l'autre quand la route garde l'écran monté.
> - **Même symptôme, autre cause, corrigé ici** : sur mobile, la section de texte changeait de
>   place dans l'arbre à l'arrivée de la séance, et se remontait vide. Un athlète qui écrivait
>   réseau coupé perdait son texte au retour du réseau. Elle ne bouge plus ; seules les coches
>   attendent la séance, comme sur le web.

> **Rattrapages faits en P4** (hors périmètre annoncé, révélés par le test de bout en bout) :
> **p4-5** l'écran mobile « rejoindre un coach » — `POST /invitations/accept` existait et était
> testé, mais aucun client ne l'appelait : la relation ne pouvait s'établir qu'à la main, donc
> l'athlète n'avait ni planif ni séance à débriefer. **p4-6** le rafraîchissement mobile —
> **rien** ne déclenchait de refetch (`refetchOnWindowFocus` s'appuie sur des événements de
> navigateur, absents en React Native) : avec le cache persisté et `staleTime` à 5 min, l'athlète
> pouvait relire un cycle supprimé sans le moindre signe. Manque hérité de P3, invisible en dev
> (on recharge sans cesse), qui aurait mordu en production.

---

## Post-MVP — Envoi découpé des médias (branche `fix/increase-size-video`)

| # | Dette | Statut | Suivi |
|---|---|---|---|
| U-3 | **Pas de progression sur la messagerie mobile** : le fil n'expose que `mediaBusy` (désactivation), sans indicateur chiffré — contrairement au débrief mobile et aux deux surfaces web. | 🟢 | — *(déclencheur : un envoi de vidéo lourde jugé « figé » dans un fil)* |
| U-4 | **Le seuil de découpage est calé sur un plafond d'hébergeur, non vérifié automatiquement** : `MULTIPART_THRESHOLD_BYTES` (80 Mo) tient sa valeur des 100 Mo mesurés au bord Cloudflare. Aucun test ne le confronte à la réalité. | 🟢 | — *(déclencheur : changement de plan Cloudflare ou d'hébergement)* |
| U-5 | **Pas de reprise entre deux LANCEMENTS d'app** : le réessai de #152 couvre l'accroc réseau, pas l'app tuée en cours d'envoi. L'`uploadId` ne vit qu'en mémoire ; après un plantage, les parts montées sont perdues pour le client et l'upload devient orphelin. Le rattraper demanderait de le persister côté serveur. | 🟢 | — *(déclencheur : un athlète qui signale un envoi perdu APRÈS une fermeture d'app, pas après une coupure)* |
| U-6 | **La purge des uploads abandonnés est posée à la main, et rien ne vérifie qu'elle l'est** : la règle vit dans `deploy/prod/bucket-lifecycle.json`, mais c'est un `aws s3api` lancé au doigt le jour de la création du bucket. Mesurée depuis #267 par le contrôle chemins ↔ objets de la procédure de restauration : **19 objets non référencés pour 101 référencés** sur un poste de développement au 2026-09-20. Aucun test, aucun démarrage ne relit la règle — et **ni MinIO ni SILO ne savent l'appliquer** (mesuré sur MinIO, cf. l'encadré ci-dessous, puis sur SILO en #257), donc le dev et le NAS n'ont pas de filet du tout. Garage l'applique : c'est l'un des déclencheurs de son adoption. | 🟢 | — *(déclencheur : bucket cloud créé ou recréé, changement d'hébergeur, ou une facture de stockage inexpliquée)* |

*Résolues, à l'[archive](archive.md) : U-1, U-2.*

> **Mesuré** (les deux faits qui dictent toute la conception, et qu'aucune lecture du code ne
> donnerait) :
>
> **1. Le bord réseau refuse au-delà de 100 Mo.** Corps PUT de taille croissante poussés sur
> `s3-dev` à travers le tunnel : 40, 60, 95 et 100 Mo atteignent MinIO (403 *avec* `x-amz-request-id`),
> **101 Mo revient en 413 sans `x-amz-request-id`** — bloqué à l'edge, jamais arrivé. C'est la limite
> de corps de requête du plan Cloudflare gratuit. La constante `MAX_FEEDBACK_VIDEO_SIZE_BYTES`
> promettait alors 1 Go, soit **dix fois ce que l'infrastructure autorisait** : entre 100 Mo et 1 Go,
> le fichier mourait à l'edge et le mobile n'affichait qu'un « le serveur a refusé ce fichier ».
>
> **2. `File.slice()` n'est pas paresseux sur Android.** Mesuré sur appareil avec une vidéo de
> 398 Mo : `Call to function 'FileSystemFile.bytesSync' has been rejected. → java.lang.OutOfMemoryError:
> Failed to allocate a 418159312 byte allocation`. L'allocation vaut le **fichier entier**, pas la
> tranche — `slice()` matérialise tout puis découpe, contre un tas plafonné à 256 Mo. D'où la lecture
> par plage (`FileHandle.readBytes`) via un fichier de cache, et non le `Blob` que l'API suggère.
> `UploadOptions` d'`expo-file-system` n'offre par ailleurs **aucune** option de plage d'octets.

> **Tranché** (ce que le code ne justifie pas seul) :
>
> **Le client n'envoie aucun ETag.** S3 en produit un par part, que `CompleteMultipartUpload` doit
> citer — mais les lire côté navigateur exigerait que le storage expose l'en-tête `ETag` en CORS, ce
> que MinIO ne fait pas par défaut (vérifié : le préflight ne renvoie **aucun**
> `access-control-expose-headers`). L'API les relit donc elle-même par `ListParts`. Effet de bord
> heureux : web et mobile sont traités à l'identique, et c'est le **serveur** qui constate ce qui a
> réellement atterri au lieu de croire le client.
>
> **`partCount` est obligatoire à la clôture.** S3 recolle sans broncher ce qu'on lui donne : une
> part perdue produirait une vidéo tronquée que **rien ne distingue** d'une vidéo entière — ni le
> storage, ni le rattachement, ni la lecture par le coach. Le serveur compare donc l'annoncé au réel
> et refuse en 409. Sans cette garde, le mode de défaillance le plus probable était aussi le plus
> silencieux.
>
> **Deux modes plutôt qu'un seul chemin découpé.** Sous 80 Mo, le PUT unique est conservé : imposer
> le détour à une photo de 300 Ko ou à une note vocale n'achèterait rien contre des allers-retours
> supplémentaires. Le mode est décidé par l'API à partir de la seule taille — le client n'a pas voix
> au chapitre, le seuil étant une contrainte d'infrastructure et non une préférence.
>
> **Tout échec abandonnait l'upload** — ~~renversé en #152~~, et sur une prémisse à moitié fausse.
> Les parts d'un upload jamais clos sont bien facturées sans apparaître à `ListObjects`, mais
> **`ListMultipartUploads` les liste**, avec leur date d'initiation (vérifié sur MinIO). Elles
> n'étaient donc pas introuvables. Ce qui est vrai, et suffisait à l'arbitrage d'alors, c'est que
> rien ne les ramassait.

> **Tranché en #152** (ce qui jetait 380 Mo n'était pas ce que l'issue croyait) : l'issue posait
> que la reprise était bloquée parce que l'`uploadId` « n'est stocké nulle part ». Faux pour le
> scénario qu'elle décrivait : à la part 38 sur 40, l'`uploadId` est en mémoire et ses URLs signées
> valent encore une heure. Ce qui jetait les parts montées, c'était **notre propre**
> `catch → abort → throw`. Le réessai ne demande donc **aucune** persistance — celle-ci n'achète
> que le cas « app tuée », resté en **U-5**.
>
> **Il n'y avait aucun réessai, nulle part** — ni par part, ni en PUT unique. Un accroc sur la part
> **1** sur 40 tuait l'envoi aussi sûrement que sur la 38ᵉ. Le manque le moins cher à combler ne
> s'appelait pas « reprise ».
>
> **On ne réessaie que ce qu'un réessai peut corriger** : coupure réseau, 408, 429, 5xx. Un 403 de
> signature ou un 400 de taille naît d'une part qui ne CONVIENT pas — la renvoyer coûterait trois
> fois son poids pour se faire redire non. Deux tentatives de plus au maximum, à 1 s puis 3 s :
> ces délais couvrent l'accroc, pas la panne durable, qui doit rendre la main à l'utilisateur.
>
> **Renvoyer une part sous le même `PartNumber` la REMPLACE** (vérifié sur MinIO : `ListParts` n'en
> voit qu'une, l'objet recollé porte les octets de la seconde). Le serveur relisant déjà les ETags
> lui-même, le nouveau est pris sans rien changer à la clôture — c'est ce qui rend le réessai sûr
> sans un seul aller-retour de plus.
>
> **La barre TIENT au lieu de reculer.** Un réessai renvoie la part depuis son premier octet ;
> rapportée telle quelle, la progression reculerait de dix mégaoctets à chaque accroc. Elle est
> donc rendue monotone : l'utilisateur voit une pause, ce qui est exactement ce qui se passe, là
> où un recul lui ferait croire à un envoi qui recommence.
>
> **MESURÉ SUR APPAREIL — le mode de défaillance dominant est un GEL, pas un rejet.** Le premier
> jet du réessai ne se déclenchait que sur une erreur, et il n'en venait aucune : au passage
> wifi → 5G, la requête en cours ne casse pas, elle **s'immobilise**. Le socket reste ouvert sur une
> interface morte, la progression se tait, la promesse ne se règle jamais — l'envoi reste « en
> cours » indéfiniment. D'où le **chien de garde** : sans un octet pendant 20 s, on coupe
> nous-mêmes (`AbortSignal` côté mobile, `xhr.abort()` côté web) et la part repart. Le minuteur est
> remis à zéro à chaque octet, donc un envoi lent mais vivant ne le déclenche pas.
>
> **Le troisième essai, lui, ne prouvait rien** — et c'est une leçon de banc d'essai plus que de
> code. « La 5G ne prend jamais le relais, mais au retour du wifi c'est bon » ressemblait à un
> réessai défaillant ; c'est en réalité le seul résultat possible. Le dev local signe ses URLs avec
> une IP **LAN** (`S3_ENDPOINT=http://192.168.x.x:9000`) : passer en 5G sort du réseau, et il n'y a
> plus rien à joindre. Le chien de garde coupait, réessayait, et retombait sur le même néant. Le
> basculement wifi ↔ cellulaire ne se teste que contre le tier NAS, dont `s3-dev` est public — c'est
> précisément pourquoi le tunnel existe (`deploy/dev/README.md`). Second essai,
> réseau coupé NET des deux côtés : le retour dépassait les 4 s que couvrait l'échelle d'origine, et
> l'envoi était déjà perdu — d'où cinq paliers (1, 3, 8, 20, 30 s) tenant un peu plus d'une minute,
> ce que les URLs signées à une heure permettent largement. **Aucun test de bureau n'aurait donné
> ces deux faits** : jsdom et Vitest rejettent proprement, un vrai téléphone gèle.
>
> **MESURÉ — MinIO accepte la règle de cycle de vie et jette la clause en silence.** `mc ilm rule
> add` n'a aucun drapeau pour les uploads incomplets ; `mc ilm import` perd le champ ; et par le
> SDK, une règle réduite à `AbortIncompleteMultipartUpload` est refusée en 400, tandis
> qu'accompagnée d'une `Expiration` elle est **acceptée puis relue sans la clause** (confirmé par
> le SDK ET par `mc ilm export`, sur `RELEASE.2025-09-07`). Câbler ça dans `docker-compose.yml`
> aurait écrit une garantie fausse. La règle ne vaut donc que pour **Scaleway**, seul tier où des
> parts orphelines se paient — le volume MinIO du dev étant jetable. La règle est rangée dans
> `deploy/prod/bucket-lifecycle.json` avec sa procédure, la prod n'étant pas encore montée ; ce
> qu'aucun automatisme ne relit reste **U-6**.

> **Appris** (le symptôme ne désignait pas sa cause) : le rapport initial était « les vidéos de plus
> de 50 Mo ne passent pas, alors que j'ai augmenté la taille ». Les deux moitiés étaient trompeuses.
> La taille avait bien été relevée (50 Mo → 1 Go), mais `MAX_FEEDBACK_VIDEO_DURATION_SECONDS` était
> **resté à 60 s** — or une vidéo de plus de 50 Mo dure presque toujours plus d'une minute. Le refus
> venait donc de la **durée**, et son message parlait de secondes, ce qui masquait le lien avec la
> modification de taille. Derrière ce premier obstacle en attendait un second, sans rapport : le
> plafond de 100 Mo ci-dessus. Deux causes indépendantes derrière un seul symptôme — d'où la mesure
> systématique avant toute correction.

---

## Post-MVP — Lecture vidéo sur mobile ([#151](https://github.com/Cimavia/cimavia/issues/151))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| V-2 | **URL signée périmée non vérifiée à l'ouverture d'un lien** : le justificatif de facture (mobile **et** web), les documents de séance **côté web** et la photo agrandie du débrief **web** (`<a href>` du panneau coach et de la galerie athlète) ouvrent l'URL du cache telle quelle — l'utilisateur atterrit sur la réponse 403 du storage, en XML brut. Le débrief MOBILE la vérifie depuis #151 (`isSignedUrlUsable`), la messagerie mobile depuis #304 ; les lecteurs audio et vidéo des deux plateformes la re-signent quand elle casse (#304). **Rectifié en #407** : c'était faux de la vidéo mobile, jouée hors de l'app jusque-là (**V-3**) — vrai depuis. **Périmètre réduit en #95** : les documents de séance du MOBILE en sortent, le fichier local passant désormais devant l'URL signée. **Rectifié en [#307](https://github.com/Cimavia/cimavia/issues/307)** : c'était vrai du seul document DÉJÀ sur l'appareil — celui que la passe n'avait pas encore descendu s'ouvrait toujours par l'URL du cache, et une séance ouverte depuis plus de cinq minutes menait au 403. Il passe depuis par une re-signature (`freshDocumentUrl`), avec refus explicite quand elle échoue. **Rectifié en #304** : cette ligne disait « le débrief la vérifie », sans préciser que c'était le mobile seul. | 🟡 | — *(déclencheur : un athlète qui signale un document « qui ne s'ouvre pas »)* |

*Résolues, à l'[archive](archive.md) : V-1, V-3.*

> **Tranché** (le lecteur système plutôt qu'`expo-video`) : lire la vidéo **dans** l'app demande
> `expo-video`, donc un module natif, donc un nouveau **client de dev** en plus de l'APK preview —
> pour une vidéo plafonnée à 3 min. Ce qui départage les deux voies n'est PAS l'absence d'OTA
> (`expo-updates` n'est pas une dépendance : tout changement mobile impose déjà un rebuild pour
> atteindre le coach beta), c'est le blocage de l'itération locale, avec le piège
> `Cannot find native module` documenté en [#92](https://github.com/Cimavia/cimavia/issues/92).
> Le manque résiduel est **V-1**, et la voie B reste ouverte derrière son déclencheur.
>
> **Levé en #407** (la voie B, prise) : le déclencheur est survenu — le coach beta quittait l'app à
> chaque vidéo, sur le média qu'il regarde le plus longtemps. `CmvVideoLink` devient
> `CmvVideoPlayer` : même pastille, même re-signature AVANT ouverture (`resolveUrl`), mais le tap
> ouvre un `Modal` plein écran avec `VideoView` et contrôles natifs, sur le modèle de
> `CmvImageViewer`. Trois choix que le code ne justifie pas seul :
> - **Le lecteur ne vit que dans le Modal ouvert.** La pastille n'en instancie aucun : un fil de
>   vingt vidéos ne coûte aucun lecteur natif, une vidéo ouverte en coûte un, relâché à la
>   fermeture.
> - **Pas de prop `url`, donc une source figée.** Le lecteur démarre sur l'URL rendue par
>   `resolveUrl` au tap, gardée en état local. Le fil sondé toutes les 10 s (#304) n'a aucune prop
>   à lui réécrire : la vidéo ne repart pas de zéro, contrairement à ce qu'aurait donné un lecteur
>   branché sur `media.url`.
> - **La reprise relance TOUJOURS la lecture** (V-3), là où `CmvAudioPlayer` et `CmvMediaPlayer`
>   ne relancent que si ça jouait. Les contrôles sont natifs : l'app ne voit pas le geste de
>   l'utilisateur, et `playing` retombe à faux sur l'erreur. Or après 5 min de pause, seul un geste
>   (lecture, saut) redemande des octets — et ce geste demandait la lecture.
> - **Le bouton plein écran natif reste.** L'app est verrouillée en portrait (`app.json`) : c'est
>   lui qui laisse voir en grand une vidéo tournée en paysage.
>
> **Appris** (l'émulateur ne sait pas vérifier cette feature) : sur l'émulateur Android de Kylian
> (WSL2), la vidéo rend une image grise zébrée, fige l'affichage, puis fait planter l'émulateur
> lui-même — alors que le lecteur, lui, joue (`BUFFERING` → `PLAYING`, aucune erreur). En cause, le
> décodeur `c2.goldfish.h264.decoder`, qui délègue au GPU de l'hôte (`rendring output error -32`).
> Le symptôme est identique en `textureView` et avec la surface par défaut : essayer l'une puis
> l'autre n'a rien départagé, et le composant garde le défaut d'expo-video. **La vérification de
> la lecture vidéo se fait sur un téléphone.**
>
> Échec toujours visible, jamais un écran noir : URL non re-signable → `media.video.refreshError`
> sous la pastille, sans ouvrir ; lecture perdue (re-signature impossible, ou qui rend l'URL qui
> vient d'échouer) → le Modal se ferme sur `media.video.openError`. Le coût natif est payé : dev
> build obligatoire, et nouvel APK preview — `runtimeVersion` en `fingerprint`, aucun update OTA
> n'atteint cette livraison.
>
> **Précisé en #287** : `expo-updates` est désormais une dépendance. La parenthèse ci-dessus dit ce
> qu'on savait alors ; l'argument, lui, tient toujours — `expo-video` est un module natif, il change
> l'empreinte et exige un build quoi qu'il arrive.
>
> **Un composant partagé, pas une copie** : le rendu vidéo vit dans `CmvVideoLink`
> (`shared/component/`), servi par la messagerie **et** les deux surfaces du débrief. Copier la
> pastille de `MessageBubble` était le geste naturel — et exactement celui qui a coûté un refactor
> sous contrainte de gate en #153 (`new_duplicated_lines_density` ≤ 3 %, et `apps/mobile` **est**
> analysé par Sonar). Précédent suivi : `CmvAudioPlayer`/`CmvAudioRecorder`, promus en P5.
>
> **Découvert en route** (ce qu'aucune lecture du code ne donnait) : le `staleTime` de l'app vaut
> **exactement** le TTL des URLs signées — 5 min des deux côtés — et « périmé » ne veut pas dire
> « redemandé » : TanStack ne refetche que sur un déclencheur (montage, premier plan, retour
> réseau). Un coach immobile six minutes sur un débrief ouvrait donc une URL morte, et l'échec est
> **silencieux** : `Linking.openURL` réussit (le navigateur s'est bien lancé), c'est le storage qui
> répond 403 en XML. Le cache étant persisté sept jours, un démarrage à froid ressortait des URLs
> signées la semaine passée. D'où `SIGNED_URL_TTL_SECONDS` et `isSignedUrlUsable` promus dans
> `@cmv/shared` — la valeur est déjà un élément de contrat (`UploadUrlDto.expiresIn`) — et une
> re-signature **avant** ouverture, avec refus explicite quand elle échoue. Le TTL, lui, ne bouge
> pas : sa brièveté est ce qui rend le bucket privé sûr (P3-3). Le même trou subsiste ailleurs, en
> **V-2**.
>
> **Corrigé au passage** (trouvé en vérifiant sur appareil) : les photos de débrief ne
> s'agrandissaient PAS sur mobile — le visionneur plein écran existait, mais dans
> `feature/message/`, et ne servait que la messagerie. Promu en `CmvImageViewer`
> (`shared/component/`) et branché sur les deux surfaces du débrief. Le geste est le même que pour
> la vidéo, et pour la même raison : un composant que la messagerie possédait déjà valait mieux
> qu'un `<Image>` nu recopié.
>
> **Rectifié en #156** : cette entrée affirmait que « le web ouvre la photo en pleine taille depuis
> toujours ». C'était vrai du **panneau coach** seulement — la galerie de l'athlète
> (`FeedbackMediaGallery`) rendait un `<img>` nu, non cliquable, depuis sa création. L'écart entre
> les deux surfaces web n'avait jamais été relevé, et la formule « le web » l'a masqué en le
> traitant comme une plateforme homogène. Corrigé sur le même geste que le coach (un `<a>` vers
> l'URL signée), signalé par le coach beta.
>
> **Corrigé au passage** : la galerie athlète affichait « Vidéo · 0 s » sur un média sans durée
> déclarée (`durationSeconds ?? 0`) — la règle nullable prise à revers. `formatMediaDuration` rend
> désormais `null` sur une durée inconnue, et le rendu n'affiche rien. La messagerie et le débrief
> parlent en outre le même format (`m:ss`), au lieu de secondes brutes d'un côté.

---

## Post-MVP — URLs signées stables sous le lecteur ([#304](https://github.com/Cimavia/cimavia/issues/304))

> **Tranché en #304** (d'où venait la coupure) : l'API signe les médias à CHAQUE lecture — une URL
> neuve par réponse, qui ne diffère de la précédente que par `X-Amz-Date`. Le fil de messages est
> sondé toutes les 10 s, et le débrief se recharge sur les déclencheurs de TanStack (montage,
> retour au premier plan, mutation). Chaque rechargement donnait
> donc une nouvelle source au lecteur : le `<audio>` web rechargeait, `useAudioPlayer` recréait son
> lecteur, et la note repartait de zéro ; les photos, elles, clignotaient. Le **TTL ne bouge pas** :
> sa brièveté est ce qui rend le bucket privé sûr (P3-3). C'est le client qui GARDE une URL tant
> qu'elle est ouvrable.
>
> **Tranché en #304** (une mémoire par app, pas par écran) : `createSignedUrlSharing`
> (`@cmv/shared`) tient une table `média → { url, reçue à }`, une seule par app. Le même média
> arrive par plusieurs requêtes (le fil, le débrief), et toutes doivent voir la même URL. Une URL
> gardée conserve SA date de réception : elle est remplacée dès qu'elle entre dans la marge de
> sécurité d'`isSignedUrlUsable`, et ne vit donc jamais au-delà de son TTL. Un média inconnu de
> la table vaut « périmé » : on re-signe, on ne devine pas.
>
> **Tranché en #304** (le point d'entrée est `structuralSharing`) : c'est par là que passe TOUTE
> donnée qui entre dans le cache TanStack — réponse réseau comme `setQueryData`. Stabiliser à cet
> endroit le fait une fois, avant tout rendu, et `replaceEqualDeep` rend alors l'ancienne
> référence : rien ne se redessine. Seule exception, et elle compte sur mobile : la **restauration
> du cache persisté** n'y passe pas. La table vivant en mémoire, elle est vide au démarrage ; les
> requêtes qui portent des médias (`SIGNED_MEDIA_QUERY_ROOTS`) sont donc invalidées sitôt le cache
> restauré, plutôt que de laisser des URLs vieilles de plusieurs jours à l'écran.
>
> **Tranché en #304** (le résolveur est fourni par l'ÉCRAN) : un composant de message ne sait pas
> de quelle requête il vient — la même bulle sert le fil et les réponses au débrief. C'est l'écran
> qui passe `useFreshMediaUrl(queryKey)`, qui re-signe en rechargeant CETTE requête. Le hook mobile
> du débrief (`useFreshFeedbackMediaUrl`) est devenu ce hook partagé.
>
> **Tranché en #304** (un lecteur en service garde son URL) : garder l'URL dans le cache ne suffit
> pas — une note écoutée plus longtemps que la marge verrait quand même arriver une URL neuve. Les
> lecteurs (`CmvMediaPlayer` web, `CmvAudioPlayer` mobile) n'adoptent donc une nouvelle URL qu'au
> **repos** (ni en lecture, ni en pause à mi-chemin). Si la leur expire en route, ils re-signent
> et reprennent à la même position, en lecture seulement si elle jouait. Quand la re-signature rend
> la MÊME URL, ce n'est pas l'expiration qui a cassé la lecture : ils affichent l'erreur au lieu
> de recharger d'office, ce qui bouclerait sur le même échec. Reste hors d'atteinte : la vidéo
> mobile, jouée hors de l'app (**V-3**). **Levé en #407** : `CmvVideoPlayer` applique la même
> règle, à ceci près qu'il relance toujours la lecture.

---

## Post-MVP — Sélection multiple de médias ([#156](https://github.com/Cimavia/cimavia/issues/156))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| W-1 | **Pas de reprise d'un fichier écarté** : le récapitulatif nomme ce qui n'est pas passé et pourquoi, mais ne propose pas de le renvoyer — il faut rouvrir la galerie et refaire la sélection. Il s'efface au lot suivant. | 🟢 | — *(déclencheur : un athlète qui signale refaire toute sa sélection pour un seul fichier)* |

> **Tranché** (le lot ne s'annule jamais en bloc) : ni quand la sélection dépasse les places
> restantes, ni quand un fichier échoue en route. Six photos pour cinq places envoient les cinq
> premières ; un fichier trop lourd en troisième position n'emporte pas les deux qui le suivent. Ce
> qui reste dehors est **récapitulé fichier par fichier**, avec sa raison — un « 2 sur 5 n'ont pas
> pu partir » ne dirait pas lesquels, ce qui laisserait la sélection entière à refaire. Ce qui est
> effectivement parti ne figure PAS au récapitulatif : c'est déjà dans la galerie ou dans le fil.
>
> **Tranché** (un seul bouton sur mobile) : « Ajouter une photo » et « Ajouter une vidéo »
> deviennent « Ajouter des photos ou des vidéos », avec une sélection mixte. Deux boutons ouvrant
> chacun un multi-select obligeraient à deux allers-retours pour un lot mixte — le cas courant
> après une séance. La ligne « Encore N photo(s), N vidéo(s)… » porte désormais seule la
> distinction entre les deux quotas.
>
> **Tranché** (l'envoi reste immédiat) : on choisit, ça part — contrairement aux pièces jointes
> d'exercice, qui s'empilent jusqu'au save. Un brouillon de médias aurait ajouté un concept à un
> écran qui en porte déjà trois (décompte, texte, médias), pour un gain nul : un débrief se
> complète de toute façon en plusieurs fois.
>
> **Tranché** (le séquentiel n'est pas de la prudence) : le serveur compte les médias déjà attachés
> à **chaque** rattachement et refuse en 409. Un lot envoyé en parallèle passerait entièrement le
> contrôle client, puis se ferait refuser au milieu sans qu'on sache quels fichiers sont passés. La
> file rend l'ordre, et donc le récapitulatif, prévisible. Aucun changement d'API n'a été
> nécessaire.
>
> **Tranché** (`MAX_MESSAGE_MEDIA_BATCH = 10`) : la messagerie n'a **aucun** quota — chaque média y
> est un message — donc rien ne borne naturellement une sélection, et quarante vidéos partiraient à
> la suite. Ce plafond est une borne d'usage côté client, pas une règle métier : le serveur n'en
> sait rien et n'a pas à en savoir. La valeur est **arbitraire**, posée faute de retour d'usage, et
> se change en une ligne. Corollaire : les « places restantes » d'un fil valent ce plafond pour les
> trois familles, si bien qu'un refus y est toujours un lot trop grand, jamais un quota atteint.
>
> **Tranché** (les clés i18n restent dans les apps) : `sendMediaBatch` reçoit les libellés de ses
> refus au lieu de les nommer. Les remonter dans `@cmv/shared` les rendrait invisibles à
> `check:i18n`, qui lit les sources de chaque app — les catalogues entiers seraient passés pour
> morts sous `--strict`, et la garde serait devenue passante. C'est aussi le seul choix correct sur
> le fond : mobile et web ne nomment pas toujours pareil (`photoTooBig` contre `imageTooBig`).
>
> **Ce qui a été factorisé, et pourquoi ça ne pouvait pas rester copié** : le tri, la file et
> l'assemblage du récapitulatif étaient d'abord écrits **deux fois** (débrief web et mobile), et le
> discriminant d'une raison de refus **quatre fois** — dont une expression inline dans le JSX, qu'un
> `grep` sur le nom de la fonction ne montrait pas. Quatre surfaces qui appliquent « on n'annule
> jamais tout » chacune de leur côté auraient divergé au premier correctif appliqué d'un seul côté.
> Tout vit désormais dans `sendMediaBatch` / `mediaRecapText` (`@cmv/shared`, mesurés en
> couverture) ; chaque app ne garde que sa lecture du type (`attachableMediaKind` sur un mime côté
> web, `assetMediaKind` sur `asset.type` côté mobile — les unifier obligerait à convertir l'un vers
> l'autre, la frontière que [#96](https://github.com/Cimavia/cimavia/issues/96) refuse de franchir).
>
> **La classification par FAMILLE, pas par liste blanche** : `mediaKindOfMime` répond à « sur quel
> quota ce fichier compte-t-il, et par quelle préparation passe-t-il », pas à « est-il accepté ».
> Un `image/heic` occupe donc bien une place de photo, quitte à être refusé au format ensuite.
> Classer avec la liste blanche aurait produit un fichier qui n'occupe aucune place mais se prépare
> comme un type qu'il n'est pas — et `prepareWebMedia` a été rebranché dessus pour que les deux
> lectures ne puissent plus diverger.
>
> **Reste dupliqué** : les quatre `failureReason`/`rejectedReason` ont la même forme mais pas le
> même contenu — chacune nomme les clés de sa feature. L'obstacle qu'ajoutait le mobile est **levé
> depuis #96** : ses deux features testaient chacune un `MediaRejectedError` différent, il n'y en a
> plus qu'un, celui de `shared/util/media.util.ts`. Ce qui reste n'est plus un empêchement mais un
> arbitrage : les clés étant propres à chaque feature, unifier demanderait de les passer en
> paramètre — soit le `MediaProfile` déjà là côté mobile, sans équivalent commun aux deux
> plateformes.
>
> **Tranché en beta** (plafonds relevés à **20 photos / 10 vidéos / 20 notes vocales**, depuis
> 5/3/15) : la sélection multiple a rendu visible ce que l'ajout un par un cachait — le picker
> mobile annonce `photosLeft + videosLeft`, soit « 8 éléments maximum » sur un débrief vide, et
> c'est en le lisant qu'on a vu que le **compte** gênait, pas la taille. Un athlète débriefe une
> séance avec dix photos de ses voies. Ce qui garde le stockage prévisible reste la taille PAR
> FICHIER, inchangée (1 Go vidéo, 100 Mo photo/audio) ; la durée non plus n'a pas bougé.
>
> **Deux tests écrivaient ces plafonds en dur** et seraient devenus rouges sans qu'aucune règle
> n'ait changé : les deux e2e de quota (« plafonne à 3 vidéos », « quota (5) ») et l'assertion de
> places restantes du test d'écran web. Tous trois dérivent désormais des constantes, comme le
> faisait déjà le test des notes vocales. C'est le même mode de panne que les six chaînes i18n qui
> citaient les plafonds en dur (P4).
>
> **Corrigé au passage** : le commentaire d'`assertQuotaLeft` annonçait « 3 vidéos, 5 photos,
> **3 notes vocales** (CDC §6) » alors que `MAX_FEEDBACK_AUDIOS` valait **15** depuis P5. Une doc
> fausse dans le fichier même qui applique le quota — remise à jour avec les nouvelles valeurs.

---

## Post-MVP — Documents de séance hors-ligne ([#95](https://github.com/Cimavia/cimavia/issues/95))

> **Tranché en #95** (le quota se compte en CYCLES VISIBLES, pas en Mo) : l'issue proposait les
> deux. Aucune taille n'existe nulle part — ni sur `ScheduledSessionExerciseDocument`, ni dans
> `ExerciseDocumentDto` — alors que l'API la reçoit à l'upload (`requestUploadUrlSchema.size`), la
> valide contre les 20 Mo de `MAX_DOCUMENT_SIZE_BYTES`, et la jette. Un budget en Mo aurait donc
> commencé par une migration, un backfill par `HeadObject`, et un champ de plus au contrat, pour
> arbitrer un volume que le plafond par document borne déjà. La règle retenue tient en une phrase
> qu'on peut dire à l'athlète : **ce que ton coach t'a diffusé et qui n'est pas fini**. Sans cette
> ligne, la première relecture verra une issue qui parlait de Mo et un code qui n'en parle pas.
>
> **Rectifié en [#317](https://github.com/Cimavia/cimavia/issues/317)** : le plafond ne bornait
> rien. L'URL d'upload était signée **sans** la taille — un coach déclarait 1 Ko et poussait ce qu'il
> voulait, que le mobile descendait ensuite d'office. Il borne depuis #317 : la taille entre dans la
> signature, et le rattachement la confronte à l'objet reçu. L'arbitrage en cycles, lui, tient.

> **Tranché en #95** (les fichiers restent EN CLAIR dans le sandbox) : chiffrer aurait durci le
> maillon le moins sensible. AsyncStorage garde déjà, en clair et sept jours durant, les séances,
> messages, factures et coordonnées de l'athlète ; un PDF d'entraînement à côté ne change pas la
> nature de ce qu'un appareil déverrouillé expose. La clé aurait de toute façon vécu sur le même
> téléphone, et l'ouverture externe aurait exigé un déchiffrement vers un fichier temporaire clair
> — soit le même risque, au prix d'un chiffrement en flux sur des fichiers de 20 Mo. À rouvrir si
> le HDS devient une cible, mais alors pour TOUT le stockage local, pas pour les seuls documents.

> **Tranché en #95** (`Paths.document`, pas `Paths.cache`) : l'OS vide le répertoire de cache sous
> pression mémoire, c'est-à-dire potentiellement la veille de la séance, après des jours sans
> ouvrir l'app — exactement le moment que la fonctionnalité existe pour couvrir. Le prix assumé est
> que ces fichiers entrent dans la sauvegarde iCloud de l'appareil.

> **Tranché en #95** (« à la diffusion » se lit « au premier passage de l'app en ligne ») : aucune
> tâche de fond n'est installée, et iOS n'en garantit de toute façon aucune échéance. La passe est
> donc montée sur le PLANNING — l'écran d'accueil de l'athlète, donc son dernier passage en ligne
> avant la salle — et non à l'ouverture d'une séance, où il est déjà trop tard. La notification
> push de diffusion sert de rabatteur : c'est elle qui ramène l'athlète dans l'app.

> **Découvert en route** (ce qu'aucune lecture de l'issue ne donnait) : l'issue affirmait que « le
> cache athlète conserve la structure des séances hors-ligne, mais pas les documents ». C'était
> FAUX de moitié. `PlanWeekDto.sessions` ne porte que des `ScheduledSessionSummaryDto` — un titre
> et un `exerciseCount` ; le déroulé vit dans `ScheduledSessionDto`, chargé par
> `useScheduledSession` à l'ouverture de la séance et **rien ne le préchargeait** (aucun
> `prefetchQuery` ni `ensureQueryData` dans tout le mobile). Le hors-ligne ne tenait donc que pour
> les séances DÉJÀ OUVERTES en ligne : l'athlète qui arrivait en salle sans avoir ouvert la séance
> de mardi tombait sur `CmvErrorState`. La promesse de `query.tsx` — « l'athlète qui ouvre cimavia
> en salle, sans réseau, doit retrouver ses séances » — n'était vraie que par accident. Combler ce
> trou ne coûtait rien de plus : il fallait de toute façon charger chaque `ScheduledSessionDto`
> pour connaître ses documents.

> **Tranché en #95** (OUVRIR n'est pas PARTAGER) : un `file://` du sandbox n'est ouvrable par
> AUCUNE autre application sur Android — `Linking.openURL` y lève `FileUriExposedException`, le
> système exigeant un `content://` délivré par un FileProvider. La première version en a conclu
> que `Sharing.shareAsync` était le passage : il fournit bien ce `content://`, mais **en ouvrant la
> feuille de partage**. On proposait à l'athlète d'envoyer son PDF à ses contacts au lieu de le lui
> montrer — retour du bêta, sur appareil, là où aucun test ne pouvait le voir : le mock répondait
> « partage réussi » et l'assertion portait sur l'appel, pas sur ce que l'utilisateur voyait.
> Le geste juste est l'intention `ACTION_VIEW` (`expo-intent-launcher`), à qui on tend le
> `contentUri` que `File` expose déjà, avec `FLAG_GRANT_READ_URI_PERMISSION` — sans ce drapeau
> l'ouverture échoue APRÈS l'affichage du sélecteur, ce qui se lit comme un bug du lecteur.
> **iOS garde `Sharing`** : `UIActivityViewController` y est la voie documentée, sa feuille porte
> un aperçu Quick Look en tête, et l'asymétrie est assumée faute d'embarquer un visionneur. Reste
> l'écart au cadre 9 de la maquette, qui annonce que « le PDF s'ouvre dans Cimavia » : c'est un
> « ouvrir avec » de l'OS. L'extension du nom d'origine, conservée à l'écriture, sert des deux
> côtés — elle aide Android à trouver un lecteur quand le type MIME manque, et iOS à déduire ce
> qu'il présente.

> **Corrigé en marge de #95** (la passe de téléchargement survivait à la déconnexion) : trouvé en
> testant le changement de compte. La passe est LONGUE — quarante séances tirées l'une après
> l'autre — et rien ne l'arrêtait quand l'athlète se déconnectait au milieu. Elle continuait donc
> d'écrire les séances du compte QUITTÉ dans le cache que `resetAccountData` venait de vider, et le
> persister les recopiait sur le disque : la fuite entre comptes que ce même journal décrit pour le
> cache de requêtes (#198), réintroduite par la porte de derrière et par le code censé la fermer.
> La leçon n'est pas « vider aussi » mais **« un traitement long doit savoir pour qui il
> travaille »** : `purgeAllDocuments` incrémente une ÉPOQUE, la passe capture la sienne au départ
> et abandonne dès qu'elle diverge — avant chaque requête, pas seulement entre deux cycles. Aucune
> connaissance de l'authentification n'entre dans la passe.

> **Corrigé en marge de #95** (l'aiguillage après connexion partait avant la session) : trouvé en
> testant, et SANS rapport avec le hors-ligne. `LoginScreen` et `RegisterScreen` faisaient un
> `router.replace("/planning")` en dur — juste sous un commentaire expliquant pourquoi `/planning`
> en dur est faux, et à trois lignes d'une garde qui dérive déjà la destination de la capacité.
> Ce `replace` partait avant que la session ait repris : `redirectForPath` voyait « aucune
> capacité » (`capabilitiesOf` rend le même vide pour « session absente » et « session inconnue »),
> refusait `/planning` et déposait l'utilisateur sur le premier onglet SANS capacité — Messages —
> avec une barre amputée de la moitié de ses entrées. Le symptôme se lisait « il manque des données
> et des onglets », ce qui envoyait chercher du côté du cache. Les deux `replace` sont retirés : la
> garde suffit, et `app/(app)/_layout.tsx` ne tranche plus tant que la session n'est pas résolue
> **et présente** — `isPending` seul ne suffisait pas, une session tout juste quittée étant résolue
> et vide.

> **Corrigé au passage** (trouvé en lisant le composant, pas en testant) : `ImageBlock` de
> `CmvRichDocument` posait un état `"failed"` sur `onError` et ne le rendait **nulle part**. Sur
> échec, le spinner disparaissait en laissant un rectangle gris de 224 px, muet — ce que le
> docstring du composant, deux lignes plus haut, désigne lui-même comme « lu comme un bug ». Le
> cadre **11c · SANS RÉSEAU** de `athlete_seance_lecture.dc.html` prescrivait ce cas depuis
> toujours. Il est rendu, et il DIT sa cause : hors réseau l'image reviendra, en ligne elle est
> perdue pour cette lecture — annoncer « hors ligne » à un athlète connecté l'enverrait vérifier
> une connexion qui marche. Le composant n'avait jusque-là aucun fichier de test.

> ⚠️ **Écart de maquette non traité** : le cadre 9 affiche « progression-charge.pdf · **1,1 Mo** ·
> PDF ». La taille n'existant nulle part (cf. le premier encadré), elle n'est pas rendue — la
> pièce jointe montre son nom seul. Le jour où un budget en Mo se justifiera, la migration servira
> les deux besoins d'un coup.

---

## Post-MVP — Débrief d'une séance sans exercice ([#276](https://github.com/Cimavia/cimavia/issues/276))

> **Tranché en #276** (une séance sans exercice garde son débrief — l'inverse de #166 et #167) :
> les deux clients RETIRAIENT le bouton, au motif que « la séance vide est l'anomalie du coach » et
> qu'« un bouton mort se tape quand même ». La seconde moitié est vraie, la première est fausse
> deux fois. **Le bouton n'était pas mort** : aucune garde serveur ne regarde la composition sur le
> chemin du débrief — `getPublishedSessionOrThrow` ne filtre que le cycle diffusé, et
> `getOrCreateWritable` crée le débrief et passe la séance en `DONE` sans rien demander d'autre. Et
> **une séance sans structure n'est pas forcément un oubli** : « footing, repos actif » se compose
> comme ça, sans qu'aucun `min(1)` du schéma partagé ne s'y oppose. Même forme d'erreur que celle
> corrigée en #172, où deux cycles diffusés la même semaine étaient un cas d'usage et non une
> anomalie à empêcher — et même mouvement que « une séance À VENIR se coche et se débriefe »
> ci-dessus : une garde posée sur une prémisse que rien ne vérifiait.
>
> La garde était **purement cliente**, des deux côtés. Rien n'a bougé côté serveur, et l'écran de
> débrief tenait déjà sans exercice : `FeedbackTrackingSection` rend `null` quand rien n'est
> décomptable. Un débrief texte-seul est un état légitime par décision écrite
> (`CONTEXT.cimavia.md` § `SessionFeedback`).
>
> **Ce qui reste conditionnel côté web** : le sommaire du rail et la progression. Sans exercice, il
> n'y a rien à sommer ni à compter — c'est le bouton seul qui sort de `hasExercises`.
>
> **L'état vide devient NEUTRE.** Il accusait le coach (« Ton coach n'y a pas encore mis
> d'exercice ») au-dessus d'un bouton désormais actif, ce qui ferait dire deux choses contradictoires
> au même écran. Rien dans le modèle ne sépare le voulu de l'oublié, donc le texte ne tranche pas :
> il constate l'absence de déroulé et rappelle que le débrief reste ouvert. Marquer une séance comme
> **volontairement libre** — champ sur `ScheduledSession`, UI de composition, propagation à la copie
> de semaine (#4) — a été examiné et **écarté ici** : c'est un chantier qui demande sa validation,
> et #276 reste vraie de toute façon.
>
> **Écart assumé** : le coach n'est toujours pas prévenu qu'il diffuse une séance sans exercice, et
> ça ne change pas ici — on ouvre le débrief à l'athlète, on ne touche pas au geste du coach.
> L'oubli réel, celui que #166 voulait attraper, reste silencieux des deux côtés. C'est le prix de
> ne pas savoir distinguer les deux cas, et il se paie du bon côté : un athlète qui débriefe une
> séance que son coach a oublié de composer le lui dit mieux qu'un état vide ne le ferait.

> **Découvert en #276** (la décision vivait dans une doc que l'issue ne citait pas) : #166 et #167
> ne laissaient aucune trace ici — ni ligne, ni encadré. Leur raisonnement vivait dans quatre
> commentaires de code, les corps des deux issues, et surtout `docs/maquettes/README.md`
> § « Ce qui est tranché », lu avant de coder. Rien ne s'opposait donc à ce qu'on l'inverse par
> inadvertance. Le README des maquettes est repris dans la même PR ; l'écran 7 de
> `shared/coach_athlete_etats_vides.dc.html` est **périmé** et le dit désormais.

> **Couverture ouverte en #276** : `SessionDetailScreen` (mobile) n'avait **aucun** fichier de test
> — l'écran de séance de l'athlète, chrono compris, n'était tenu par rien. Il passe de 0 à ~70 % de
> statements. La carte d'exercice y est réduite à un stub : elle a son propre test, et la monter
> ferait entrer documents et réseau dans un test d'écran. Les segments du déroulé sont bâtis **dans**
> la fabrique `vi.mock`, hissée au-dessus des imports : y citer `SegmentKind` lèverait au chargement.

> **Tranché en #263** (un environnement déclare qui peut s'y inscrire, sinon l'API ne démarre pas) :
> l'inscription était ouverte partout, et `/docs` publiait la carte de l'API sur tous les
> environnements. Quatre conséquences que le code ne justifie pas seul.
>
> - **`SIGNUP_MODE` n'a AUCUN défaut**, seule variable non secrète de `env.schema.ts` dans ce cas
>   (règle dure n°5) : un défaut choisirait à la place de l'exploitant, et le jour de l'oubli il
>   choisirait en silence. Le compose du NAS, lui, ferme de son côté (`${SIGNUP_MODE:-invitation}`).
>   Les deux ne se contredisent pas : le schéma refuse un environnement **muet**, le compose donne
>   sa politique à un **tier précis**, et un `.env` incomplet ne doit pas empêcher un déploiement
>   tout en n'ouvrant jamais la porte.
> - ~~**Un lien générique n'autorise personne.**~~ **Caduc en #390** : le lien générique n'existe
>   plus, toute invitation porte une adresse.
> - **Le formulaire reste visible sur un environnement fermé**, et le refus n'arrive qu'à l'envoi.
>   Le client n'a aucun moyen de connaître le mode : il faudrait que l'API le publie sur une route
>   non authentifiée, donc qu'elle annonce sa politique à qui la sonde. Le coût est un aller-retour
>   pour l'athlète ; l'alternative renseigne l'attaquant.
> - **Swagger se coupe sur `NODE_ENV`, donc en production aussi.** `APP_ENV` aurait laissé `/docs`
>   ouvert exactement là où on ferme la porte (le NAS tourne une image, donc `NODE_ENV=production`,
>   avec `APP_ENV=development` comme simple étiquette), et sa valeur par défaut aurait rouvert la
>   carte au premier oubli. Le seul environnement qui la garde est celui qui tourne depuis les
>   sources.

> **Appris en #263** (`ConfigModule.forRoot()` valide à l'IMPORT, pas au montage) : la suite e2e du
> mode fermé passait **au vert contre une app ouverte**. `forRoot()` s'exécute à l'évaluation du
> décorateur de `AppModule`, c'est-à-dire au premier `import` du fichier — bien avant
> `Test.createTestingModule`. Poser `process.env.SIGNUP_MODE` dans un `beforeAll` arrivait donc
> toujours trop tard, et six tests affirmaient des refus qui ne pouvaient pas se produire. Tout
> test qui veut un AUTRE environnement que celui de `vitest.config.e2e.ts` doit poser ses variables
> puis importer `AppModule` **dynamiquement**.

> **Tranché en #269** (le tier dev écrit à de VRAIES adresses, et n'a plus de filet) : ses e-mails
> s'arrêtaient dans une boîte Mailpit que seul le dev pouvait lire — le Coach bêta et ses Athletes
> ne recevaient ni invitation, ni lien de réinitialisation, ni notification, et `mail-dev` gardait
> en clair des chemins de connexion vers des comptes réels. Cinq conséquences que le code ne
> justifie pas seul.
>
> - **Aucun repli après le retrait de Mailpit.** Une variable `SMTP_*` oubliée laisse l'envoi
>   ÉTEINT, ce que `MailService` journalise à chaque tentative. Un repli sur une boîte locale
>   rendrait l'oubli invisible : tout aurait l'air parti, et rien ne serait arrivé.
> - **Port 465, donc TLS implicite.** `MailService` déduit le chiffrement du seul numéro de port
>   (465 = TLS dès le premier octet, STARTTLS ailleurs). 587 fonctionnerait ; ce qu'il ne faut pas
>   faire, c'est inventer un troisième port en croyant ne choisir qu'une route.
> - **Le login SMTP n'est pas une adresse** : c'est l'ID du PROJET Scaleway — et chez Scaleway le
>   projet par défaut porte le MÊME UUID que l'organisation, ce qui fait douter de la bonne valeur
>   quand elle est déjà posée. Le mot de passe est la clé secrète d'une application IAM portant la
>   seule permission `TransactionalEmailEmailSmtpCreate` : envoyer par SMTP, ni relire les messages
>   partis ni toucher au domaine. C'est la clé qui vit sur le NAS, donc celle qui peut fuiter.
> - **Deux permissions d'envoi, et le mauvais nom coûte une heure** : `…EmailApiCreate` ne couvre
>   que l'API HTTP, `…EmailSmtpCreate` le relais SMTP. Avec la première, l'authentification réussit
>   et le serveur répond `535 5.7.8 Permission denied` — indiscernable d'un mauvais mot de passe.
>   L'envoi par l'API HTTP, lui, passait : c'est ce qui a permis de séparer identifiants et droits.
> - **Elle expire au bout d'un an** (plafond Scaleway, le 2027-09-20 pour celle-ci). Ce jour-là les
>   envois s'arrêtent, et le seul symptôme est un échec d'authentification SMTP dans les logs. Noté
>   dans `deploy/dev/README.md`, faute d'un endroit où une date s'impose d'elle-même.
> - **Recevoir du courrier passe par Cloudflare Email Routing, pas par le MX « blackhole »** que
>   l'issue prévoyait : sans adresse sur le domaine, le `rua` de DMARC n'a nulle part où arriver, et
>   l'effacement RGPD ([#285](https://github.com/Cimavia/cimavia/issues/285)) demandera de toute
>   façon une adresse joignable. Conséquence apprise en le posant : un domaine ne porte qu'**un
>   seul** enregistrement SPF, celui de Scaleway et celui de Cloudflare ont donc dû être fusionnés
>   en une ligne (`include:_spf.tem.scaleway.com include:_spf.mx.cloudflare.net -all`). `no-reply@`
>   n'est délibérément pas routée : ce qui lui répond doit rebondir.

> **Appris en #269** (une recréation à la main fait RECULER preview, sans rien dire) : le compose du
> NAS lit `${API_IMAGE}`, que `pull-preview.sh` exporte au digest de la version promue — une
> variable du shell l'emportant sur le `.env`. Un `docker compose up -d api` lancé à la main n'a pas
> cet export : il retombe sur la valeur du `.env`, celle du bootstrap, et remplace la version
> promue par une plus ancienne. Le script ne le rattrape pas — son marqueur `deployed` dit que le
> tag `preview` n'a pas bougé, donc il sort sans rien faire. Constaté le 2026-09-20, une 1.5.0
> promue depuis quinze minutes tournant déjà en 1.4.1 : le seul symptôme était `/docs` encore
> ouvert. D'où la consigne du README — **pour appliquer un changement du `.env`, effacer
> `pull-preview/deployed` et relancer le script**, jamais `up -d` à la main.

> **Tranché en #271** (un environnement porte un seul nom — mais ses volumes gardent l'ancien) : le
> NAS s'appelait `dev` du tunnel Cloudflare jusqu'au nom de ses conteneurs, alors que #261 avait
> déjà fait exister le mot `preview` dans le code. Cinq conséquences que le code ne justifie pas
> seul.
>
> - **Les deux volumes sont épinglés à leur nom RÉEL** — `cimavia-dev_postgres_data` et
>   `cimavia-dev_minio_data`. Renommer un projet compose renomme ses volumes : PostgreSQL et SILO
>   auraient démarré VIDES, pendant que les données du Coach seraient restées à côté, intactes et
>   invisibles. C'est le seul endroit où `dev` survit, et il doit y survivre.
> - **`APP_ENV` perd son repli.** `development` par défaut rangeait les déploiements de preview,
>   dans Sentry et dans les logs, avec ceux qu'on jette. Un tier qui ne se déclare pas empêche
>   désormais le démarrage.
> - **Une origine de confiance supplémentaire passe par le compose**, vide en régime normal. Elle
>   existe pour la transition : un APK déjà installé demande sa réinitialisation de mot de passe
>   avec un `redirectTo` vers l'ANCIENNE origine web, que Better Auth compare à cette liste. Une
>   redirection 301 n'y changerait rien — la vérification porte sur la chaîne, pas sur la requête.
> - **L'alias réseau `minio` disparaît.** Il n'existait que pour ne pas couper le tunnel pendant
>   #257. L'ordre compte, et c'est le seul de cette issue qui casse quelque chose s'il est inversé :
>   le tunnel doit viser `silo:9000` AVANT la promotion, sinon plus aucun média ne se charge.
> - **CloudBeaver passe en `restart: "no"`.** Une interface d'administration de base de données qui
>   se rallume à chaque redémarrage du NAS, sur de vraies données, n'est pas un outil de dev : c'est
>   une porte laissée ouverte.

> **Appris en #271** (une règle périmée se recopie plus vite qu'elle ne se corrige) : l'en-tête de
> `deploy/dev/docker-compose.yml` affirmait encore « données synthétiques uniquement », alors que
> #260 l'avait renversée et que ce journal le disait depuis #268. En #263, je m'y suis fié pour
> justifier la fermeture des inscriptions, et la phrase a essaimé dans **cinq fichiers** : deux
> commentaires de code, le compose, le `.env.example` et le runbook. Toutes corrigées ici. Le
> journal avait raison, c'est le fichier qui mentait — et c'est le fichier qu'on lit en codant.

---

## Post-MVP — Clé objet venue du client ([#293](https://github.com/Cimavia/cimavia/issues/293))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| S-1 | **Le rattachement croit le `type`, le mime et la taille déclarés**, pas ceux de l'objet envoyé : une vidéo d'1 Go rattachée en `IMAGE` échappe au plafond de 10 vidéos par débrief. La clé, elle, est vérifiée depuis #293. Pas besoin de mémoriser le ticket comme #293 l'annonçait : le storage garde le type et la taille signés, un `HeadObject` au rattachement suffit. **Périmètre réduit en [#317](https://github.com/Cimavia/cimavia/issues/317)** : le document d'exercice en sort, confronté par `StorageService.assertUploadedAsDeclared` ; restent le débrief, la messagerie et le justificatif de facture, qui n'ont qu'à l'appeler. | 🟢 | [#468](https://github.com/Cimavia/cimavia/issues/468) |

> **Tranché en [#293](https://github.com/Cimavia/cimavia/issues/293)** (la forme exacte, et 403) :
> `assertKeyUnder` (`infra/storage/object-key.ts`) exige `<préfixe><uuid>-<nom assaini>`, la forme
> que produit `buildObjectKey` — pas seulement le préfixe. Un `startsWith` laissait passer
> `<préfixe>../../ailleurs`, qui vise un autre tenant dès qu'un maillon normalise le chemin. Le
> préfixe est toujours recalculé côté serveur. Le refus est un **403**, pas le 400 du piège n°3
> (`architecture-choice.md` §6) : c'est ce que rendait déjà la garde de clôture d'un envoi
> découpé, testée en e2e, et la ressource visée existe bien — c'est la clé qui n'est pas à
> l'appelant. Dans `FeedbackMediaService.attach`, la garde passe AVANT `getOrCreateWritable` : un
> refus ne crée pas de débrief et ne passe pas la séance en DONE.

---

## Post-MVP — Taille signée d'un document d'exercice ([#317](https://github.com/Cimavia/cimavia/issues/317))

> **Tranché en #317** (le document passe avant les trois autres rattachements de #468) : c'était le
> seul envoi signé sans sa taille, et le seul que l'appareil d'un autre télécharge d'office (#95). La
> signature suffisait à fermer le trou ; la confrontation au rattachement est venue avec, pour que la
> ligne en base désigne un objet réellement reçu — sans quoi le mobile chercherait à descendre un
> fichier absent. La vérification vit dans `StorageService`, pas dans le service des documents :
> #468 l'appelle telle quelle sur le débrief, la messagerie et la facture. `size` est **exigée** au
> rattachement : le web est le seul client, livré avec l'API.

> **Tranché en #317** (une clé absente répond 404, sur SILO seulement — vérifié) : sans le droit de
> lister le bucket, que la clé de l'API n'a pas (#267), S3 répond **403** sur un objet absent, là où
> SILO répond `NotFound`. Sur un storage qui suit S3, rattacher une clé jamais envoyée finirait en
> 500 : refusé quand même, mais sous le mauvais code. Ni `s3:ListBucket` ajouté à la policy (il
> donnerait à l'API l'inventaire du bucket pour corriger un code d'erreur), ni 403 lu comme absent
> (il maquillerait une vraie panne de droits). À revoir avec le choix du stockage de prod (#259).

---

## Post-MVP — Séance débriefée ([#313](https://github.com/Cimavia/cimavia/issues/313))

> **Tranché en [#313](https://github.com/Cimavia/cimavia/issues/313)** (une séance débriefée se
> refuse à la suppression, on ne purge pas) : `DELETE /scheduled-sessions/:id` cascadait le débrief
> de l'athlète, ses médias en base et son suivi d'exécution, sans rien purger du bucket et sans
> qu'il en sache rien. Deux voies : refuser, ou supprimer en purgeant. **Refuser**, parce que :
>
> - **la purge ne tient pas dans la transaction** — le storage n'en fait pas partie, elle ne
>   pourrait venir qu'après le commit, au mieux, et un échec redonnerait l'orphelin de #72 ;
> - **le débrief n'est pas au coach** : il emporterait aussi le suivi d'exécution (#168) et le
>   contexte des messages qui y répondent (`sessionFeedbackId` en `SetNull`) ;
> - **corriger un cycle n'en a pas besoin** : l'édition garde le suivi et le débrief.
>
> La garde porte sur `status = DONE`, pas sur l'existence d'une ligne `SessionFeedback`, et elle
> vit DANS le `deleteMany` plutôt que dans une lecture préalable. `DONE` n'est posé que dans la
> transaction qui crée le débrief, qui ne se supprime jamais : les deux disent la même chose. Mais
> un débrief créé au même instant met à jour la ligne de séance, et Postgres revérifie la condition
> sur cette ligne avant de la supprimer ; une lecture séparée laisserait passer ce cas.
>
> Le web grise le bouton avec la raison, et annonce « l'athlète sera prévenu » avant de retirer
> une séance d'un cycle diffusé — c'est le seul effet de bord qu'une suppression permise garde.
> Semaine et cycle diffusés restent à [#312](https://github.com/Cimavia/cimavia/issues/312) et
> [#85](https://github.com/Cimavia/cimavia/issues/85) : leur règle est plus large (plus aucune
> suppression sur un cycle diffusé, débriefé ou non).

---

## Post-MVP — Un seul suivi local par séance ([#346](https://github.com/Cimavia/cimavia/issues/346))

> **Tranché en [#346](https://github.com/Cimavia/cimavia/issues/346)** (le suivi local vit dans
> un magasin au niveau du module, lu par `useSyncExternalStore`) : l'écran de séance reste monté
> sous le débrief, et chacun tenait sa propre copie, lue sur le disque au montage. Le débrief
> corrigeait 3/4 en 4/4 et vidait le disque à l'enregistrement ; l'écran du dessous gardait 3/4,
> qui l'emportait sur le serveur et revenait sur le disque à la coche suivante. Une **relecture au
> focus** a été écartée : elle laisse deux copies, d'accord au seul moment du retour, et chaque
> nouvel écran d'une séance devrait penser à la faire. Même montage que le presse-papier de semaine (#4), avec trois règles
> propres au suivi (`feature/plan/lib/local-tracking-store.ts`) :
>
> - **une entrée n'existe que tant qu'un écran la lit** : le dernier parti, elle est oubliée, et le
>   prochain montage relit le disque. La mémoire ne survit jamais aux écrans qu'elle sert ;
> - **le disque n'est lu qu'au premier lecteur**, et sa réponse est ignorée si une coche l'a
>   précédée — cette coche l'a déjà écrasé. Avant, la mémoire reprenait l'ancienne valeur pendant
>   que le disque gardait la coche ;
> - **chaque coche part de la valeur du magasin**, lue sans attendre de rendu : le rattrapage du
>   déroulé (#306) tient sans le `useRef` qui le portait.
>
> Effacer le local rend les écrans au distant **en cache**, qui portait encore le décompte d'avant
> la séance le temps que sa relecture réponde. Une coche posée dans cette fenêtre le ressuscitait.
> L'enregistrement du débrief écrit donc le suivi envoyé dans la séance en cache **avant** de vider
> le local (`withSentTracking`), et la relecture reste lancée. Le web n'a pas le problème des deux
> copies : séance et débrief y sont deux routes sœurs, l'une démonte l'autre. Il avait en revanche
> la même fenêtre de cache, fermée de la même façon en
> [#499](https://github.com/Cimavia/cimavia/issues/499) : `withSentTracking` vit depuis dans
> `@cmv/shared`. Tout l'enregistrement du débrief l'a suivi (`feedbackSaveMutation`) : écrit dans
> chaque client, il avait déjà divergé — le mobile n'invalidait pas la liste coach, le web ne
> relisait pas la séance sur un refus — et SonarCloud le comptait en duplication.

> **Tranché en [#499](https://github.com/Cimavia/cimavia/issues/499)** (le local ne s'efface que
> s'il dit encore ce qui est parti) : les cases restent actives pendant l'envoi du débrief, et la
> réponse effaçait le local sans le regarder — une case décochée pendant l'enregistrement revenait
> cochée, sans un mot. `onSaved` reçoit désormais le suivi PARTI, et `clearIfSent` le compare au
> local passé par le même filtre que l'envoi (`isTrackingSent`, `@cmv/shared`) : identique, on
> efface ; différent, le local reste, « Enregistrer » se rouvre sur ce qui a changé. **Griser les
> cases pendant l'envoi** a été écarté : en salle, sur un réseau lent, l'écran resterait figé le
> temps de la requête. Même règle, en passant, quand l'envoi ne portait **aucun** suivi (séance
> non chargée) : rien n'a quitté l'appareil, le local n'est plus effacé — il l'était avant.

---

## Post-MVP — Hors-ligne qui se resynchronise ([#307](https://github.com/Cimavia/cimavia/issues/307))

> **Tranché en [#307](https://github.com/Cimavia/cimavia/issues/307)** (la fraîcheur se juge
> entre deux dates du SERVEUR) : `ScheduledSessionSummaryDto` porte désormais l'`updatedAt` de la
> séance, et c'est lui qui dit au mobile si son déroulé hors-ligne est encore le bon. Retoucher,
> ajouter ou retirer une séance ne touche pas la ligne `Plan` : la signature de la passe qui ne
> regardait que `PlanDto.updatedAt` ne voyait rien, et l'athlète s'entraînait sur la version
> d'avant. La signature cite donc chaque séance, et une séance du cache n'est resservie que si son
> `updatedAt` est ÉGAL à celui du résumé. Comparer `dataUpdatedAt` (l'heure du téléphone à la
> réception) à une date serveur aurait fait dépendre la décision d'une horloge qu'on ne maîtrise
> pas ; l'égalité de deux valeurs émises par le même mapper n'en dépend pas.

> **Tranché en #307** (une passe n'est retenue que COMPLÈTE) : la signature était posée avant la
> passe, qui avalait ses échecs — une passe coupée n'était reprise qu'au démarrage à froid suivant.
> Elle n'est plus retenue qu'après une passe sans échec, et une passe incomplète repart au retour
> du réseau ou de l'app au premier plan, **pas en boucle** : une API en panne ferait enchaîner les
> échecs tant que l'app reste en ligne. Le `{}` que rend `useNetworkState()` au premier rendu reste
> lu « en ligne », comme partout ailleurs : une passe lancée à tort échoue, n'est pas retenue, et
> repart quand le réseau revient.

> **Corrigé en marge de #307** (les liens externes passaient pour « manquants ») :
> `missingDocuments` disait en commentaire que les liens n'ont jamais d'octets à descendre, mais
> ne les filtrait pas — `localDocumentUri` rend `null` pour un lien. Une séance portant un lien
> était rechargée à chaque passe, et une passe qui doit être complète pour être retenue ne l'aurait
> jamais été.

> **Tranché en #307** (le bandeau hors-ligne DATE la séance, et elle seule) : l'issue demandait
> s'il fallait dire à l'athlète de quand date ce qu'il lit — « ton dernier passage » ne distinguait
> pas une séance récupérée la veille d'une séance de la semaine passée. Décision de Kylian : oui.
> Sur l'écran de séance, `OfflineBanner` affiche l'instant où CETTE séance a été récupérée
> (`dataUpdatedAt`, donc l'horloge du téléphone — c'est bien « quand tu l'as eue » que l'athlète
> veut savoir). Les autres écrans gardent le message générique : le planning agrège plusieurs
> requêtes, et une date unique y mentirait. Inconnue (`dataUpdatedAt` à 0), la date n'est pas
> inventée : le bandeau retombe sur le message générique.
>
> ⚠️ **Écart de maquette** : le cadre **11c · SANS RÉSEAU** de `athlete_seance_lecture.dc.html`
> n'affiche que « Hors ligne », sans date.
