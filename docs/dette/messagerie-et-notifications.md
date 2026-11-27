# Dette technique — Messagerie et notifications

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P5 — Messagerie & débrief vocal

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P5-2 | **Audio non transcodé, durée déclarative** (comme la vidéo, P4-1/P4-2). | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) · [#81](https://github.com/Cimavia/cimavia/issues/81) |
| P5-3 | **Interop note vocale web → iOS** : l'enregistreur web demande l'AAC en MP4, lu sur iPhone depuis Chrome (#394). Restent deux cas que la recette n'a pas vus : un Chromium sans encodeur AAC (Linux, sans doute Android) met de l'**Opus dans le MP4**, dont la lecture sur iOS n'est pas vérifiée ; Firefox n'a que le webm, refusé au débrief mais accepté en messagerie, où l'app iOS affiche la note « indisponible ». | 🟢 | — *(déclencheur : une note « indisponible » signalée sur iPhone, ou un Coach qui enregistre depuis Firefox ou Chromium sous Linux)* |

*Résolues, à l'[archive](archive.md) : P5-1, P5-4, P5-5, P2-1 / P3-2.*

> **Tranché en #190** (répondre à un débrief) : la réponse est un **`Message` rattaché**
> (`Message.sessionFeedbackId`), pas une entité nouvelle — le champ était au schéma et validé
> côté serveur depuis P5, sans aucune UI. Elle hérite ainsi des médias, des non-lus, du push, du
> throttle et de la pagination à venir. Écartés : une entité `FeedbackReply` (il faudrait tout
> reconstruire, et `sessionFeedbackId` deviendrait du code mort) et un `coachComment` unique sur
> `SessionFeedback` (ni aller-retour, ni média). Quatre conséquences que le code ne justifie pas
> seul : **« répondu » est dérivé** (premier message dont `senderId === coachId`), jamais stocké —
> même dispositif que `resolveInvoiceState` et `isReminderDue` ; **la lecture du débrief ne bouge pas**,
> « lu » et « répondu » étant deux axes ; **aucun nouveau `NotificationType`**, l'athlète reçoit
> `MESSAGE_RECEIVED` et la notification ouvre la conversation ; et **lire une réponse depuis le
> débrief ne marque rien lu** — `markRead` est par FIL, l'appeler là éteindrait des non-lus que
> personne n'a vus. Le rattachement est **résolu à la lecture** par une requête scopée à part
> (`MessageAttachmentResolver`), jamais par un `include` imbriqué, qui ferait fuir le libellé
> d'une cible hors relation sans rien signaler.

> **Promu en P5** : l'enregistreur et le lecteur audio (`CmvAudioRecorder`/`CmvAudioPlayer`) sont
> dans `shared/component/` côté mobile, construits pour la messagerie **et** réutilisés tels quels
> par le débrief vocal — l'ajout au débrief a coûté quelques heures, comme anticipé (CDC §4).

> **Correctif réseau (dev) consigné en P5** : sous WSL2 (mode NAT), Metro annonce son IP interne
> `172.x`, injoignable du téléphone. `REACT_NATIVE_PACKAGER_HOSTNAME` = IP LAN Windows, dans
> `apps/mobile/.env.local` (SDK 56 refuse les variables non-`EXPO_PUBLIC_` hors `.env.local`).
> Voir README §WSL2.

---

## Post-MVP — Centre de notifications ([#39](https://github.com/Cimavia/cimavia/issues/39))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| N-1 | **Pas de pagination** : `GET /me/notifications` renvoie les 50 plus récentes, sans moyen de remonter au-delà. Depuis #694 la borne tombe **après** le filtre `?category=` : le curseur devra se composer avec lui. | 🟢 | [#78](https://github.com/Cimavia/cimavia/issues/78) |
| N-3 | **Une entrée par rafale de messages**, pas une par message : la trace garde le throttle « first-unread » que le push a quitté en #537. | 🟢 | — *(comportement voulu, déclencheur : aucun)* |
| N-4 | **`entityId` sans clé étrangère** : la cible est polymorphe, rien ne garantit qu'elle existe encore. L'effacement d'un compte purge les siennes (#256), et la rupture d'un lien ne supprime rien (Tranché en [#213](https://github.com/Cimavia/cimavia/issues/213)) : aucun chemin connu ne laisse de notification orpheline. | 🟢 | — *(déclencheur : un nouveau chemin qui supprime un cycle, une facture, un débrief ou un fil ; il purge alors ses notifications dans sa transaction)* |
| N-5 | **Réglage limité au canal e-mail** : l'épic [#61](https://github.com/Cimavia/cimavia/issues/61) a livré l'opt-in par type et ses deux écrans, **pour l'e-mail seul**. Le push et le centre restent non réglables — on ne peut ni couper un type en push, ni se taire complètement. Un utilisateur qui coupe tout par e-mail continue donc de recevoir les push. | 🟡 | — *(déclencheur : un retour beta demandant à couper le push ; l'ouvrir demanderait un second axe dans le modèle, `channel` en plus de `type`)* |
| N-6 | **Aucun groupement des ajustements de cycle** : ajouter trois séances à un cycle diffusé produit trois notifications. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-7 | **Les receipts Expo ne sont pas relus** : un échec de livraison **tardif** n'est jamais remonté. | 🟢 | [#99](https://github.com/Cimavia/cimavia/issues/99) |
| N-8 | **L'e-mail suit le rythme de la trace** (N-3) : une rafale de messages produit UN e-mail, qui annonce « un message » là où il y en a cinq. La relance attendue de #91 n'a plus d'objet depuis #537 : le push prévient de chaque message. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-9 | **Aucun lien vers l'entité dans l'e-mail de notification** : seul le pied « gérer mes notifications » est cliquable. Ouvrir le cycle ou la conversation demande de retrouver l'application à la main. | 🟢 | — *(déclencheur : un retour beta disant que l'e-mail ne sert à rien sans lien — voir « Tranché en #65 »)* |
| N-10 | **Le filtre par catégorie n'a pas d'index dédié** (#694) : `type IN (…)` trié par date parcourt l'index `(recipientId, createdAt)` jusqu'à trouver 50 lignes du type demandé. Pour une catégorie rare chez un destinataire qui a beaucoup reçu, c'est toutes ses lignes — quelques milliers au plus aujourd'hui, et la purge des lues à six mois ([#76](https://github.com/Cimavia/cimavia/issues/76)) borne désormais ce qu'il garde. | 🟢 | — *(déclencheur : une lecture filtrée lente en observabilité ; la sortie est un index `(recipientId, type, createdAt)`)* |
| N-11 | **Le push Android s'affiche sous un canal nommé en anglais** (règle dure n°6) : l'API n'envoie pas de `channelId`, et `expo-notifications` range la notification dans son canal de repli, « Miscellaneous » — le nom que montre Réglages › Cimavia › Notifications, à côté de « Minuteurs ». Trouvé en #348, même famille que NV-1, mais ici le canal est à nous. | 🟢 | [#891](https://github.com/Cimavia/cimavia/issues/891) |
| N-12 | **La purge des notifications lues parcourt toute la table** (#76) : `readAt < seuil`, chez tous les destinataires, ne s'appuie sur aucun index — `(recipientId, readAt)` commence par le destinataire. Un parcours séquentiel par tick horaire, sans conséquence au volume de la bêta. | 🟢 | — *(déclencheur : un tick qui ralentit, ou une table `notification` volumineuse ; la sortie est un index partiel sur `readAt` des seules lues)* |
| N-13 | **Le push n'a pas de délai maximum** : `expo-server-sdk` appelle le `fetch` d'undici sans délai réglé, jusqu'à ~300 s avant les en-têtes. Depuis #350, aucune requête d'utilisateur ne l'attend plus ; restent le tick des rappels, qui attend chaque push — le `curl` du cron abandonne à 60 s et le job sort en échec —, et l'arrêt de l'API, que seul l'arrêt forcé du conteneur borne alors. | 🟢 | — *(déclencheur : un tick ou un arrêt bloqué sur Expo en observabilité ; la sortie est un `httpAgent` undici à délais courts passé au client Expo)* |

*Résolues, à l'[archive](archive.md) : N-2.*

> **Tranché en [#350](https://github.com/Cimavia/cimavia/issues/350)** (la requête n'attend que la trace) : push et e-mail d'une notification
> partent **après** la réponse (`deliverLater`). Les attendre faisait payer au client chaque
> aller-retour vers Expo et le fournisseur SMTP, et une panne de l'un tenait la requête des minutes
> durant : le message, déjà enregistré, revenait en erreur et repartait en double. Quatre
> conséquences que le code ne justifie pas seul :
>
> - **La trace reste attendue.** C'est une écriture en base, et le centre que le client relit
>   juste après doit la porter. Le **tick des rappels** attend aussi ses push : sa réponse,
>   personne ne l'attend qu'un automate — le cron `reminder-tick.yml`, borné à 60 s —, et c'est
>   voulu. Un Expo muet y fait sortir le job en échec, la panne se voit, pendant que le serveur
>   finit le tick (**N-13**) ; détaché, le push aurait tu cette panne derrière un 200.
> - **L'arrêt laisse finir ce qui est en route.** Chaque envoi est suivi jusqu'à son terme ;
>   `onModuleDestroy` attend ceux déjà partis — un instantané, pour ne pas tourner sans fin sous
>   trafic — avant que Prisma se déconnecte, l'e-mail lisant encore la préférence et l'adresse. Ça
>   tient à l'ordre de Nest, que vérifie `shutdown.e2e-spec.ts` sur l'app montée : les deux
>   modules sont globaux, ils se détruisent dans l'ordre inverse de leur import, et `PrismaModule`
>   est importé avant. La borne reste le délai de grâce du conteneur (10 s chez Docker) : un fournisseur en
>   panne au même moment y perd son envoi.
> - **Un test lit après `settled()`**, jamais dès la réponse. Unitaires comme e2e
>   (`deliveredMails`) : sinon un « aucun e-mail » passe au vert avant que l'e-mail soit parti.
> - **Délais SMTP courts, pas de pool.** `MailService` borne le DNS, la connexion et l'accueil à
>   10 s, l'inactivité de la socket à 30 s, contre 2 et 10 min par défaut chez nodemailer — ce
>   qui protège aussi les envois encore attendus par leur requête (invitation, réinitialisation,
>   vérification, effacement). Un pool n'aurait servi qu'à épargner la poignée de main TLS, que seuls les
>   envois directs attendent encore — une invitation, une réinitialisation, des gestes uniques
>   et non des rafales ; au volume de la bêta il n'économise rien, et il fallait le fermer à l'arrêt et
>   survivre aux connexions que le serveur coupe.

> **Tranché en #537** (le push suit chaque envoi, la trace chaque série) : retour du Coach bêta,
> sur iPhone — des messages et des compléments de débrief qui ne le prévenaient pas. Le throttle
> « first-unread » (**P5-4**) et « seule la création notifie » (**P4-5**), posés pour ne pas
> harceler, cèdent pour le **push** : il part à chaque message, et à chaque envoi de l'athlète sur
> un débrief déjà déposé. Un coach qui rate des messages coûte plus cher qu'un téléphone qui
> vibre, et le système regroupe déjà les notifications d'une même app. Quatre conséquences que le
> code ne justifie pas seul :
>
> - **La trace garde son rythme.** L'entrée du centre et l'e-mail ne partent qu'à l'ouverture
>   d'une série (**N-3**, **N-8**) : une boîte mail remplie d'un e-mail par message, elle, serait
>   du harcèlement. `emit` reçoit donc ses **canaux** (`push`, `trace`) de l'appelant, seul à
>   connaître le fil ; la garde anti-auto-notification (#14) passe avant les deux.
> - **Les avis de débrief ne comptent pas dans la série.** Posés au nom de l'athlète, ils
>   restaient non lus chez un coach qui travaille depuis la page Débriefs (`markRead` est par fil,
>   #190) — et rendaient muet tout ce que l'athlète écrivait ensuite. C'était le vrai bug du retour.
> - **Un lot de médias fait un push, celui du premier envoi abouti.** Le serveur reçoit les
>   médias un par un ; les suivants portent `continuesBatch`, calculé par `sendMediaBatch` pour
>   les quatre surfaces. Écartés : un signal en fin de geste, qui doublait le push du premier dépôt
>   — l'appel qui crée le débrief ne sait pas qu'un autre suivra — et se perdait si le lot cassait ;
>   une fenêtre de temps côté serveur, seuil arbitraire. Une app pas encore mise à jour n'envoie
>   pas le drapeau : elle pousse à chaque média jusqu'à sa mise à jour.
> - **Le complément d'un débrief pousse sans trace.** L'entrée « nouveau débrief » ouvre déjà
>   l'état courant, et le débrief repasse « à relire » — un média joint seul compris, ce qu'il ne
>   faisait pas. Même destination que `FEEDBACK_RECEIVED`, aucun nouveau type. Et l'annonce part
>   **après** l'écriture (`FeedbackService.markSent`) : la création prévenait avant que le texte
>   soit écrit.
>
> **[#538](https://github.com/Cimavia/cimavia/issues/538) n'avait pas de cause propre** : le push iOS est livré — le coach reçoit
> « nouveau débrief ». Les messages muets étaient ceux de #539, et le lien avec la case e-mail une
> coïncidence : le code ne relie les deux canaux nulle part. **[#91](https://github.com/Cimavia/cimavia/issues/91)** (relancer ce qui
> reste non lu) perd son objet et se ferme avec elles.

> **Tranché en #66** (les réglages sont une SECTION, pas un écran) : l'issue annonçait, côté
> mobile, de « donner enfin une destination à la ligne Notifications » de la maquette
> `athlete_profile.dc.html` — donc un écran à part, atteint par un lien. Quatre interrupteurs
> tiennent dans la page : ils sont posés **sur place**, dans le profil, comme au web dans l'écran
> Compte. Une navigation vers un écran qui n'aurait contenu qu'eux se serait payée à chaque
> consultation, et la maquette datait d'avant qu'on sache combien de lignes il y aurait.
>
> Deux conséquences que le code ne justifie pas seul. **La bascule enregistre immédiatement**, sans
> bouton — l'API attendant l'ENSEMBLE des types activés, chaque geste envoie un état complet et
> idempotent ; l'écart est assumé avec la section « casquettes » juste au-dessus, qui garde son
> bouton parce qu'elle édite un état cohérent à valider d'un bloc. Et le mobile emploie le
> **`Switch` de React Native** là où les capacités utilisent un `Pressable` habillé : c'est le seul
> contrôle dont l'état soit visible du harnais de rendu, `accessibilityState` étant ignoré par
> `react-native-web` (dette **Q-6**) — un interrupteur maison n'aurait pas été éprouvable.

> **Tranché en #65** (l'e-mail est un canal, pas un déclencheur) : l'envoi part de `emit()`, au
> MÊME point que la persistance et le push, et jamais d'un appelant métier. Cinq conséquences que
> le code ne justifie pas seul.
>
> - **L'opt-in est l'absence de ligne**, pas un booléen. « Jamais réglé » et « explicitement
>   coupé » commandent la même chose ; un troisième état inventerait une distinction que rien ne
>   lit, et aurait exigé une migration de données pour tout le parc. Couper un type SUPPRIME sa
>   ligne — la table ne contient que ce que quelqu'un a demandé. Côté Prisma, « je coupe tout »
>   est un `notIn: []`, que Postgres rend toujours vrai : **ne pas y ajouter de cas particulier**,
>   il serait mort donc jamais éprouvé.
> - **Quatre types seulement** (`EMAILABLE_NOTIFICATION_TYPES`), et c'est une LISTE, pas un
>   `Exclude<>` comme `PersistedNotificationType` : la frontière est un choix produit révisable,
>   pas une conséquence du modèle. Les trois ajustements de cycle en sont exclus tant que **N-6**
>   n'est pas traitée — trois séances ajoutées produiraient trois e-mails. Élargir la liste ne
>   compile plus tant que les gabarits manquent, dans les deux langues.
> - **Canal indépendant du push.** L'e-mail part que le push soit arrivé ou non. Le conditionner à
>   l'absence d'appareil aurait produit un comportement qui change tout seul le jour où
>   l'utilisateur installe l'app — et Expo ne confirme la livraison qu'en différé (**N-7**).
> - **La préférence est lue AVANT le destinataire.** En opt-in, le cas courant est « personne n'a
>   rien activé » : lire l'adresse d'abord coûterait deux requêtes à chaque notification du parc.
> - **Ni contenu de message, ni montant de facture** dans l'e-mail, et des tests le figent. Une
>   conversation est une donnée de santé au sens du CDC, et une somme apparaîtrait dans l'aperçu
>   d'un téléphone posé sur une table. Le gabarit n'a d'ailleurs pas de quoi le faire :
>   `Notification` ne persiste que `actorName` et `subjectLabel` (#48).
>
> **Écart assumé (N-9)** : aucun lien vers l'entité. L'API devrait pour cela porter la table de
> routage des clients, qui diffèrent (le builder est web-only, le planning de l'athlète est
> mobile) et qui changent sans elle. Le seul lien est celui des réglages, et il n'existe que si
> `WEB_URL` est configurée — absente, le pied disparaît et le message part quand même.

> **Tranché en #48** (le modèle) : une `Notification` ne stocke **aucun libellé rendu**, seulement
> son `type`, sa cible et les paramètres d'interpolation (`actorName`, `subjectLabel`). Deux
> conséquences assumées : **(1)** le rendu vit dans les apps (`NOTIFICATION_LABEL_KEY` + i18next),
> donc une notification écrite en juillet s'affichera en anglais le jour où `en.json` arrivera —
> c'était la raison d'être du choix ; **(2)** les paramètres sont des **instantanés**, renommer un
> cycle ne réécrit pas l'historique. Le libellé du **push**, lui, reste rendu côté serveur et en
> français en dur — il n'y a pas de client pour le traduire au moment de la livraison. Son i18n
> suivra le catalogue serveur de [#63](https://github.com/Cimavia/cimavia/issues/63).

> **Tranché en #694** (filtrer le centre par catégorie) : le filtre se fait **dans l'API, avant
> la borne** — la liste est bornée à 50 après fusion de ses deux sources, et un filtre client sur
> ces 50 lignes ferait paraître vide une catégorie dont les entrées sont plus anciennes. La
> catégorie d'un type est une **table** (`NOTIFICATION_CATEGORY`, `satisfies Record<…>`), pas un
> `switch` : un type ajouté sans elle ne compile plus. Quatre écarts assumés : **(1)** le filtre
> **n'est pas mémorisé** — il revient à « Toutes » à la réouverture du panneau web, et à chaque
> retour sur l'onglet mobile, qui reste monté — y compris au retour d'une notification ouverte,
> comme le panneau web se referme au clic : le badge compte toutes les catégories, un filtre retenu
> afficherait « 3 » sur la cloche et une liste vide ; **(2)** aucun compteur de non-lues par
> catégorie, `unread-count` reste ventilé par espace (#176) ; **(3)** « Tout marquer lu » suit le
> filtre, et hors « Rappels » il n'éteint **aucun** rappel dû ; **(4)** « Invitations » réunit les
> deux côtés de la relation (l'invitation reçue en athlète, ses réponses en coach) — c'est un même
> fil, et deux pastilles pour deux ou trois lignes par an n'aideraient personne. Le filtre croise
> l'espace actif (#129) sans le remplacer. Sous un filtre, « Tout marquer lu » suit la liste reçue :
> une catégorie dont les 50 plus récentes sont lues ne l'offre plus, même si des plus anciennes ne
> le sont pas — elles sont aussi hors d'atteinte que dans la liste, ce que N-1 couvre.

> **Tranché en #695** (panneau web réglable) : le contenu du centre est écrit **une fois**
> (`NotificationCenter`) et rendu par deux conteneurs — le panneau déroulant, redimensionnable par
> son **coin bas-gauche** (ancré à droite, la poignée native de `resize: both` l'aurait fait
> grandir à l'opposé du geste), ou un `CmvPanel` pleine hauteur dont seule la largeur se règle.
> `CmvPanel` gagne deux props que ses usages existants ne passent pas : `width` + `onWidthChange`
> (la poignée de son bord gauche) et `flush` (corps sans marge, pour une liste à filets) ; son titre
> remplace celui de la barre. Les **deux** conteneurs sont rendus **par un portail** : dans le
> bandeau `sticky z-20`, un en-tête de tableau collant plus bas dans la page passait par-dessus ; le
> panneau déroulant y est donc en `fixed`, recalé par `useAnchoredPosition` ; posé en fin de page,
> il prend le focus à l'ouverture et le rend à la cloche à la fermeture. Pendant un glisser, la
> taille vit dans le conteneur seul : la cloche — et sa liste — ne l'apprennent qu'au relâchement.
> Le mode et les tailles sont retenus dans `localStorage` (`shared/lib/local-storage`, partagé avec
> le suivi local des séances) — **pas** dans `resetAccountData` : une préférence du poste, qui ne
> nomme aucun tenant. Une taille trop grande pour la fenêtre s'y ramène **au rendu**,
> sans être réécrite : revenu sur le grand écran, on retrouve la sienne. Le latéral garde toujours
> une bande de fond où cliquer : dans une fenêtre trop étroite, c'est son minimum qui cède. Quatre
> écarts assumés :
> **(1)** le panneau reste **modal** — pas de panneau épinglé ouvert pendant qu'on travaille ;
> **(2)** tant qu'il n'a jamais été redimensionné, le panneau déroulant suit son contenu, et le
> premier geste part de sa taille d'origine (320 × 384 px), qui est aussi son minimum : une liste
> courte grandit donc d'un coup jusqu'à 384 px ; **(3)** la poignée d'angle annonce sa largeur en
> `aria-valuenow` — un séparateur n'en porte qu'une — et les deux dimensions en `aria-valuetext`
> (Sonar `S6847` écarté sur ce seul fichier : un séparateur focusable est un widget en ARIA 1.2) ;
> **(4)** changer de conteneur **remonte** le contenu : la liste est relue (`staleTime: 0`), un
> « Repousser » déplié se replie et le défilement repart du haut. Seul le filtre survit, tenu par la
> cloche — un geste rare, qui ne vaut pas un contenu monté hors de ses deux conteneurs.
> Le mobile n'est pas concerné : son centre est déjà un écran plein.

> **Appris en test (session de recette #39)** : une notification n'est pas un lien, c'est le
> **signal que l'état serveur a changé**. L'ouvrir invalide donc tout le cache client avant de
> naviguer — sans quoi cliquer « nouveau débrief » depuis l'écran des débriefs ne fait
> littéralement rien (navigation no-op + `staleTime`), et arriver par un push mobile affiche la
> version d'avant l'événement annoncé (cache persisté, frais 5 min). L'invalidation est **globale
> et non ciblée** : une table `entityType → clés de requête` couplerait la feature notification à
> toutes les autres et se périmerait en silence au premier changement de route.

> **Tranché en #351** (une méthode par événement, deux tables pour la cible) : la revue demandait un
> `notify(type, …)` unique pour que le type ne puisse plus diverger de la charge utile du push. Ce
> qui divergeait n'était pas la méthode mais trois saisies à la main — le `type` de la ligne, son
> `entityType`, puis le `type` et la clé d'id du push — que rien ne liait. Elles se déduisent
> désormais du type, par deux tables de `@cmv/shared` : `NOTIFICATION_ENTITY_TYPE` (type → entité)
> puis `PUSH_ID_KEY` (entité → clé), rangée par entité pour que deux types qui visent la même cible
> ne puissent pas porter deux clés ; `emit` les écrit seul. Les quinze `notifyX` restent : chacune a
> sa charge, ses noms à résoudre et ses canaux, et dix-neuf appels les nomment, dans neuf services —
> un `notify` unique les aurait tous fait bouger sans rien garantir de plus. Les tables sont
> **partagées** parce qu'elles sont un contrat avec les apps **déjà installées** : le mobile les
> redéclarait à la main pour relire le push (`routeForPushPayload`), où un type oublié tombait sans
> bruit dans le `default`. Il les relit maintenant par `pushTargetOf`, qui rend une cible `null`
> (indisponible) plutôt que de deviner — le rappel dû, poussé sans elle, prend ainsi le repli de la
> cloche — et `null` sur un type qu'il ne connaît pas.

---

## Post-MVP — Rappels ([#38](https://github.com/Cimavia/cimavia/issues/38))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| R-2 | **Pas de pagination** sur `GET /reminders` : deux segments bornés à 100 (à traiter / traités). | 🟢 | [#106](https://github.com/Cimavia/cimavia/issues/106) |
| R-4 | **`entityId` sans clé étrangère**, comme N-4. La purge couvre la suppression d'un cycle **et de sa facture**, l'effacement d'un compte purge les siens (#256), et la rupture d'un lien ne supprime rien (Tranché en [#213](https://github.com/Cimavia/cimavia/issues/213)) : aucun chemin connu ne laisse de rappel orphelin. | 🟢 | — *(déclencheur : un nouveau chemin qui supprime un cycle ou une facture ; il purge alors ses rappels dans sa transaction, comme `PlanService.delete`)* |
| R-6 | **Les rappels traités d'un ancien coach ne sont plus purgés** (#107) : la purge passe par le client scopé, dans le contexte de chaque coach balayé, et le tick ne balaie que les comptes `isCoach`. Un compte qui a rendu sa capacité coach garde donc ses rappels traités — sans croissance, puisqu'il n'en crée plus. | 🟢 | — *(déclencheur : aucun en vue ; la sortie serait de balayer aussi les comptes qui ont des rappels sans être coach)* |

*Résolues, à l'[archive](archive.md) : R-1, R-3, R-5.*

> **Tranché en #44** (le modèle) : un rappel est l'**outil privé du coach** — la seule entité métier
> scopée `coachId` **seul**, qu'aucun athlète ne voit sous aucune forme. Quatre conséquences
> assumées : **(1)** la `note` est **obligatoire**, parce qu'elle EST le contenu du rappel et le
> libellé de sa ligne ; c'est du texte du coach, pas un libellé système, donc la stocker ne contredit
> pas la règle des notifications. Corollaire pour #47 : un rappel **auto-généré** ne devra pas
> fabriquer de note mais porter un `reason` rendu côté client, sinon on réintroduit le libellé figé
> en français. **(2)** `readAt` (« vu dans le centre ») est **distinct** du statut (« traité ») —
> sans ce dédoublement, un coup d'œil vaudrait « fait », ou le badge ne se viderait jamais.
> **(3)** `DISMISSED` est la suppression douce : pas de `DELETE`, et les trois transitions sont
> réversibles. **(4)** `ReminderEntityType` est **volontairement plus étroit** que
> `NotificationEntityType` (ce qu'on peut *rappeler* ≠ ce vers quoi une notification *pointe*) ; les
> fondre aurait obligé l'API à refuser `CONVERSATION` et `SCHEDULED_SESSION` applicativement — soit
> ce sous-ensemble, réécrit à la main. Le pont est une table `satisfies Record<…>`, donc
> `routeForNotification` n'a rien eu à changer, ni côté web ni côté mobile.

> **Tranché en #51** (le rappel dû dans le centre) : l'entrée est **calculée à chaque lecture**,
> jamais persistée — `REMINDER_DUE` est le seul `NotificationType` **absent de l'enum Prisma**, et
> son absence documente le fait que la base ne peut pas le stocker (le typecheck l'impose via
> `PersistedNotificationType`). Deux conséquences : son `id` porte le préfixe `reminder:`, ce qui
> garde **une seule** route `PATCH /me/notifications/:id/read` et laisse les deux UI ignorer qu'il y
> a deux sources ; et son `createdAt` vaut le `dueAt` du rappel — daté de sa création, un rappel posé
> longtemps à l'avance serait enterré sous des semaines de notifications le jour où il compte.
> **Le jour où #47 poussera un rappel dû, il devra choisir entre persister et calculer**, jamais les
> deux, sinon le même rappel apparaîtra en double.

> **Tranché en #47** (le support d'exécution, et pourquoi ce n'était pas une question de code) : un
> cron in-process ne se déclenche **pas** sur du scale-to-zero — aucun process ne tourne pour tirer
> le tick. Il aurait marché sur le NAS et serait mort en silence en production, le pire des deux
> mondes puisque tout test manuel passait. Retenu : **déclencheur externe** (workflow `schedule`)
> appelant une route à secret partagé, contre un conteneur always-on, pour trois raisons — c'est
> gratuit là où `min-scale=1` sort du palier ; c'est **testable par la porte e2e** devenue requise en
> #130, alors qu'un tick interne ne se déclenche pas sous test ; et sa panne est **bruyante** (job
> rouge) là où le scale-to-zero avale le tick sans un mot.
>
> Deux contreparties écrites dans le workflow : GitHub désactive les `schedule` d'un dépôt public
> après **60 jours sans commit**, et ses crons ont plusieurs minutes de retard. La seconde est sans
> effet — les échéances sont dérivées de la donnée, pas de l'heure du tick. La première ferait
> cesser les rappels en silence sur un projet en pause ; le jour où ça mord, le même appel se
> déplace sur un cron Cloudflare, la route ne bouge pas.

> **Tranché en #47** (le scope tenant hors requête) : un tick n'a ni session ni acteur, là où
> l'extension Prisma refuse tout modèle sans scope. **On ne la contourne pas, on lui donne un
> acteur** : le balayage ouvre un contexte CLS par coach (`cls.run` + `set`, le même contrat que
> `TenancyInterceptor`), si bien que les lectures restent filtrées et que le `coachId` des rappels
> créés est **injecté**, jamais écrit par le service. Une seule lecture reste hors scope et elle est
> nommée — la liste des coachs, `User` n'étant pas dans `TENANT_SCOPES` — via le `PrismaService` de
> base, précédent de `UserDirectoryService`. Un e2e le fige sur le chemin qui n'a aucun acteur : ce
> que le tick génère pour un coach n'atterrit jamais chez un autre.

> **Tranché en #47** (persister ou calculer, la question laissée ouverte par #51) : **calculer**.
> Le tick pousse un rappel dû mais n'écrit **aucune ligne `notification`** — en écrire une le ferait
> apparaître deux fois dans le centre, une fois persistée et une fois calculée depuis la table
> `reminder`. `REMINDER_DUE` reste donc absent de l'enum Prisma, et `PersistedNotificationType`
> l'interdit à la compilation. Ce qui est persisté, c'est **`pushedAt`** : un marqueur de livraison,
> même famille que `readAt`, qui rend le tick idempotent (deux passages rapprochés ne poussent pas
> deux fois, un tick manqué rattrape au suivant). L'estampille est posée **après** l'envoi : un
> arrêt brutal entre les deux repousse au tick suivant, et un doublon vaut mieux qu'un silence.
>
> Corollaire assumé sur l'**idempotence de la génération** : elle vit dans l'index unique
> `(coachId, entityType, entityId, reason)` plus `skipDuplicates`, pas dans le code — une
> vérification préalable en JavaScript laisserait une fenêtre entre la lecture et l'écriture. Les
> rappels **manuels** y échappent sans qu'on l'écrive, PostgreSQL traitant deux `NULL` comme
> distincts. Et un rappel généré puis **traité n'est jamais régénéré**, même si la facture reste
> impayée : le coach a tranché, on ne le relance pas. Un e2e le fige, sans quoi l'index passerait un
> jour pour un oubli.

> **Tranché en #105** (ce que devient `readAt` au report) : il est remis à **`null` dès que `dueAt`
> bouge**, et seulement alors. `readAt` dit « vu à CETTE échéance-là » — une nouvelle échéance est
> une nouvelle occurrence. Le laisser en place produisait le scénario suivant : un rappel dû, vu
> dans le centre, repoussé à la semaine prochaine, en sort (il n'est plus dû) et y revient huit
> jours plus tard **déjà lu** — son badge ne s'allume jamais, le jour même où il devient utile.
> C'est la règle que `markAllDueRead` applique par l'autre bout en épargnant les rappels à venir.
> Trois corollaires : la comparaison porte sur les **valeurs** et non sur la présence du champ
> (réenregistrer un formulaire sans changer la date ne rallume pas un badge éteint) ; corriger la
> **note seule** ne touche pas `readAt` (rectifier une faute de frappe n'est pas une nouvelle
> occurrence) ; et le `PATCH` est **idempotent** comme `updateStatus`, l'historique étant trié par
> `updatedAt`.

> **Tranché en #295** (ce que devient `pushedAt` au report) : la règle de #105 vaut mot pour mot —
> **remis à `null` dès que `dueAt` bouge**, avec les trois mêmes corollaires. L'oubli était silencieux :
> le tick ne sélectionne que `pushedAt: null`, donc un rappel poussé puis repoussé à demain sortait
> **définitivement** de sa vue, et demain rien ne partait. Corollaire côté tick : l'estampille ne vaut
> que pour l'échéance **lue** — `pushedAt` est posé sur le couple `(id, dueAt)` et non sur l'`id` seul,
> sans quoi un report tombé pendant les envois verrait sa nouvelle échéance marquée « poussée » sans
> qu'aucun push ne soit parti pour elle. Ce que la remise à zéro ne fait **pas** : compter deux fois.
> L'entrée du centre et la ligne d'historique restent celles de l'unique ligne `reminder`, et
> `markAllDueRead` ne regarde que `readAt`.

> **Conséquence sur #51, assumée** : l'entrée du centre étant datée du `dueAt` du rappel, **reporter
> un rappel le déplace dans le tri du centre**. C'est exactement l'intention de #51 (« il se range au
> moment où il commence à compter »), et l'e2e qui fige cet invariant n'a pas eu à changer — il
> teste la règle, que le report préserve par construction. Le statut, lui, n'est **pas** modifiable
> par cette route (`.strict()` refuse `status`) : il garde la sienne, pour qu'il n'existe qu'un seul
> chemin vers une transition.

> **Tranché en #349** (ce que devient le rappel d'une facture réglée ou annulée) : il est **clos**
> (`DONE`) dans la transaction qui change le statut de la facture — pas purgé. La cible existe
> toujours, seule la raison de relancer a disparu : ce n'est pas le cas de **R-4**, qui reste
> limité aux cibles supprimées. Trois bornes : **(1)** seul le rappel **généré**
> `(INVOICE, id, INVOICE_OVERDUE)` encore `PENDING` est visé — un rappel manuel posé sur la même
> facture est du texte du coach, il le traite lui-même, et un rappel déjà écarté garde son statut ;
> **(2)** remettre une facture payée **à régler ne rouvre pas** son rappel, et le tick ne le
> régénère pas : c'est le corollaire de #47 (« traité n'est jamais régénéré ») appliqué tel quel.
> La facture s'affiche de nouveau en retard, et le coach peut rouvrir le rappel depuis
> l'historique ; **(3)** une course est acceptée — un tick qui lit la facture juste avant que le
> paiement soit validé peut encore insérer un rappel `PENDING`. La fenêtre dure quelques
> millisecondes pour un tick horaire, et le rappel se ferme d'un clic. Côté clients, depuis
> [#485](https://github.com/Cimavia/cimavia/issues/485), changer le statut d'une facture ou
> l'annuler périme aussi les rappels et le centre de notifications, sur le web comme sur
> mobile : liste, tuile « à traiter » et badge suivent sans attendre le polling. Ce dispositif
> joue à **chaque** transition, même la remise à régler, qui ne rouvre rien : sinon le client
> devrait savoir quelle transition touche un rappel, et cette règle est au serveur. La
> suppression d'un cycle, qui purge ses rappels (**R-4**), périme les mêmes caches côté web
> (le mobile ne supprime pas de cycle).

> **Tranché en [#107](https://github.com/Cimavia/cimavia/issues/107)** (la rétention des rappels traités, et celle des notifications lues de
> [#76](https://github.com/Cimavia/cimavia/issues/76)) : six mois, au passage du tick existant — pas de second cron.
>
> - **Une durée pour les deux tables**, `HANDLED_RETENTION_DAYS` (180 jours de 24 h) : elles
>   répondent à la même question, combien de temps garder ce que son destinataire a déjà vu ou
>   réglé. Ce qui n'est pas traité — rappel `PENDING`, notification non lue — n'est **jamais**
>   purgé : son ancienneté est le signal.
> - **Rappels : `updatedAt` fait foi**, faute de date de traitement. C'est le dernier geste du
>   coach ; une retouche après coup repousse la purge, le sens sûr. Les statuts purgés sont nommés
>   (`DONE`, `DISMISSED`) : un statut ajouté demain ne partira pas sans décision.
> - **Notifications : `readAt` fait foi**, pas `createdAt` — six mois depuis la lecture.
> - **Rappels par le client scopé**, coach par coach (d'où **R-6**), dans une seconde passe une
>   fois les rappels de tous les coachs partis : une purge qui lève n'en prive aucun ; **notifications par le
>   client de base**, chez tous les destinataires : le scope `recipientId` suppose un acteur, et en
>   ouvrir un par compte n'ajouterait rien à un prédicat qui ne dépend d'aucun tenant (**N-12**).
> - **Une fenêtre de génération de 30 jours**, et c'est le point qui ne se voit pas. « Traité n'est
>   jamais régénéré » (#47, #349) tenait à l'index unique, donc à la ligne : purgée, rien
>   n'empêchait plus un cycle diffusé — candidat à vie, `PlanStatus` n'a pas d'état « terminé » —
>   de relancer le coach au tick suivant. Le tick ne génère donc plus que si l'échéance dérivée
>   **ou** l'émission de la cible (`publishedAt`, `issuedAt`, posés une seule fois) date de moins de
>   30 jours. Les deux précèdent la création du rappel, qui précède sa dernière retouche : un
>   rappel purgé est hors fenêtre tant qu'elle reste plus courte que la rétention, ce qu'un test
>   vérifie. L'émission compte pour la facture de rattrapage, échue avant même d'être émise : l'écran
>   des factures la dit en retard, la liste des rappels ne doit pas se taire.
> - **Une échéance qui bouge fait naître un nouveau rappel**, une fois l'ancien purgé : un cycle
>   diffusé qu'on allonge, une facture dont on reporte l'échéance. C'est une nouvelle fin, ou un
>   nouveau retard ; tant que l'ancienne ligne existe, l'index l'empêche encore. La différence
>   tient au délai de rétention, et elle est assumée.
> - **Contrepartie assumée** : un tick en panne plus de 30 jours perd les rappels de cette période.
>   Sa panne est bruyante — le job rouge à chaque passage horaire — bien avant.

> **Appris en construisant #44/#51** (le coût réel d'un scope à un seul rôle) : un modèle absent de
> `TENANT_SCOPES` **pour un rôle** est refusé par une *erreur*, pas par un 403 ni par une liste vide.
> Lire la table `reminder` depuis le centre de notifications — écran servi aux **deux** rôles —
> aurait donc renvoyé un **500 à tout athlète**, sur une page qui ne parle même pas de rappels. Toute
> future entité mono-capacité devra porter les deux gardes : la capacité exigée sur le contrôleur
> (`@RequireCapability` depuis #10), et un branchement explicite partout où un chemin partagé la
> touche — `runAsCapability` qualifiant alors la lecture, pas la route (cf. #14).

> ~~**Écart de promotion assumé**~~ **RÉSOLU en #46** : `REMINDER_BADGE` et
> `REMINDER_TARGET_LABEL_KEY` vivaient dans `apps/web/src/feature/reminder/`, faute d'un second
> client (règle : 2+ apps → package). L'écran mobile est arrivé, elles ont rejoint
> `INVOICE_STATE_BADGE` dans `@cmv/shared`. Une **troisième** chose est montée au passage, qui n'y
> était pas prévue : `reminderBadgeState`, parce que les deux clients allaient écrire
> `isReminderDue(…) ? "OVERDUE" : status` chacun de son côté — c'est la dérivation, pas du rendu.

> **Tranché en #46** (où se pose un écran coach sur mobile) : **ni onglet, ni entrée du Profil** —
> un **sous-écran du tableau de bord** (`app/reminders/`), sur le patron de `/feedbacks` (#33) et
> `/athlete/[id]`. Les deux alternatives examinées quand l'issue a été reportée (2026-08-07) sont
> caduques pour des raisons révisées : l'onglet conditionné par le rôle ne préempte plus rien
> (`tabs.ts` sait le faire depuis #35), mais ferait un **6ᵉ onglet** pour un écran hebdomadaire ; le
> Profil enterrerait toujours un outil de travail dans les réglages de compte. Le dashboard, lui,
> réservait déjà la tuile.
>
> Deux écarts au web en découlent, tous deux issus de la même règle appliquée à une plateforme qui a
> moins d'écrans — pas d'un périmètre rogné : **(1)** la création est contextuelle, donc offerte sur
> la **facture seulement**, un rappel de cycle se posant depuis le builder (web-only) ; **(2)**
> l'échéance se choisit parmi les raccourcis de `snoozedDueAt`, faute d'équivalent mobile à
> `<input type="datetime-local">` — l'heure précise reste réglable depuis le web.

> **Tranché en #46** (le repli de `REMINDER_DUE`, et pourquoi le web n'en a pas) : un rappel dû est
> le **seul** type du centre dont la cible ait une seconde maison — l'écran « Mes rappels », où
> vivent les gestes. Sur mobile, `PLAN` rendant `null` côté coach, un rappel dû sur un cycle ne
> menait **nulle part** ; l'écran devient donc le repli **quand la destination est absente**, sans
> jamais remplacer celle qui existe (`INVOICE` continue de mener à `/invoices`). Côté **web**, aucune
> entrée n'est ajoutée et ce n'est pas un oubli : les deux cibles y résolvent déjà pour un coach, un
> repli y serait du code mort, et brancher le type ferait **perdre l'accès direct au builder** —
> une régression, pas un alignement.

---

## Post-MVP — Messagerie sans interlocuteur ([#198](https://github.com/Cimavia/cimavia/issues/198))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| MI-2 | **`landingTab` a une valeur par défaut pour les contreparties** : `LoginScreen`, `RegisterScreen` et `CmvCapabilityGate` l'appellent avant qu'une requête ait pu partir. Sans conséquence tant qu'aucun onglet conditionnel n'est en tête de table — `dashboard` et `planning` y sont, et ni l'un ni l'autre ne dépend d'un interlocuteur. | 🟢 | — *(déclencheur : un onglet conditionnel passe en tête ; le commentaire de `tabs.ts` le dit)* |

*Résolues, à l'[archive](archive.md) : MI-1.*

> **Tranché en #198** (« quelqu'un en face » est une question sur le SCOPE, pas une lecture scopée) :
> la nav doit savoir s'il y a un interlocuteur **avant** de savoir à quel titre elle s'affiche. Les
> deux routes qui portent déjà l'information — `GET /athletes` et `GET /me/coach` — sont gardées par
> capacité : les interroger donnerait un 403 à un compte mono-capacité sur chaque écran, exactement
> la dérive que `CmvRoleGate` existe pour éviter. D'où `GET /me/counterparts`, **sans capacité
> exigée**, et un `CounterpartService` sur le client Prisma de BASE, jumeau de `CapabilityService`.
> Ce n'est pas une capacité : `isCoach` dit ce qu'un compte a le droit de faire, `asCoach` s'il a
> quelqu'un à qui le faire — un coach sans athlète porte l'une sans l'autre.

> **Tranché en #198** (« pas encore su » ne vaut jamais « absent ») : `UNKNOWN_COUNTERPARTS`
> — `{ asCoach: true, asAthlete: true }` — est ce que rendent les deux clients tant que la réponse
> n'est pas là. Le pari est délibérément permissif : une entrée qui apparaît après coup se remarque
> à peine, une entrée absente le temps d'un aller-retour envoie ailleurs quiconque visait la
> messagerie. La constante vit dans `@cmv/shared` et non dans chaque client : deux copies
> divergeraient sans que rien ne devienne rouge — l'une se mettrait à cacher au démarrage ce que
> l'autre montre.

> **Tranché en #198** (web par ESPACE, mobile par COMPTE — et c'est voulu) : le web a une entrée de
> nav par espace, chacune conditionnée par son propre côté du signal ; le mobile n'a qu'UN onglet
> Messages, servi aux deux titres, avec le sélecteur d'espace **à l'intérieur** de l'écran. Le
> conditionner par titre exercé le ferait apparaître et disparaître au gré du sélecteur qu'il
> contient. Il reste donc dès qu'il y a quelqu'un d'un côté, et l'écran dessous montre « aucun
> coach » si on bascule. Corollaire assumé : sur mobile, `href: null` rend aussi la route
> **inatteignable**, là où le web laisse `/messages` joignable par son URL. La garde est l'API dans
> les deux cas ; sur mobile il n'y a pas d'URL à taper, et rien à voir au bout.

> **Tranché en #198** (se viser soi-même est un état IMPOSSIBLE, pas un athlète inconnu) :
> `resolvePair` rendait 400 « Athlète inconnu » à un coach qui ouvrait un fil avec lui-même — le
> filtre tenant ajoute `coachId = moi`, donc chercher `athleteId = moi` ne trouve rien et le refus
> retombait sur le cas générique. C'est faux : l'athlète est parfaitement connu, c'est soi, et le
> CHECK `coach_athlete_not_self` (#11) interdit la relation pour toujours. Un test explicite, posé
> **avant** la lecture de la relation, rend donc 409 — le même code que le refus d'auto-relation, et
> pour la même raison. Les deux autres refus gardent leur 400 : viser l'athlète d'un tiers, et
> l'athlète sans coach — une relation **absente**, pas impossible, qui apparaîtra le jour où il
> rejoint quelqu'un.

> **Corrigé en marge de #198** (`runAsCapability` et la paresse des `PrismaPromise`) : trouvé en
> testant #198, antérieur à lui — 105 événements Sentry sur deux jours avant la première ligne
> écrite. `GET /me/notifications/unread-count` rendait **500** à tout compte à double capacité ayant
> au moins un message non lu : `[tenancy] capacité (aucune déclarée) non autorisée sur Conversation`.
>
> La cause n'est pas dans le service mais dans `runAsCapability`, qui faisait `cls.run(() => fn())`
> **sans await**. Une `PrismaPromise` est PARESSEUSE : elle n'émet sa requête qu'au `.then`, pas à
> sa création. Un appelant rendant directement `this.db.conversation.findMany(...)` voyait donc la
> requête partir après la sortie du contexte CLS, sans capacité exercée — et l'extension tenant
> refusait la table, comme elle doit. Le piège est **silencieux** : l'autre forme d'appel du même
> fichier (`() => this.reminders.countDueUnread(now)`, une méthode `async`) marchait, parce que son
> corps s'exécute bien dans le contexte. Deux formes voisines, une seule correcte. Le `await` posé
> dans `runAsCapability` les rend équivalentes, plutôt que de compter sur la vigilance de chaque
> appelant.
>
> **Pourquoi les e2e ne l'ont pas vu** : `unreadMessagesByCapability` sort avant de toucher
> `Conversation` dès qu'il n'y a aucun message non lu — et le seul e2e de la ventilation (#176)
> n'en créait pas. Il fallait le croisement exact « double capacité **et** message non lu ». Un e2e
> couvre désormais ce chemin.

> **Corrigé en marge de #198** (le cache de requêtes survivait au changement de compte) : trouvé en
> testant #198, et sans rapport avec lui — mais c'est lui qui l'a rendu visible. Le cache TanStack
> du mobile est **persisté sept jours** dans AsyncStorage (lecture hors-ligne, p3-5) avec un
> `staleTime` de cinq minutes, et RIEN ne le vidait à la déconnexion : le compte suivant sur
> l'appareil se voyait servir les athlètes, débriefs, messages et factures du précédent, sans
> même qu'un refetch parte les corriger. Une fuite entre comptes, pas un affichage périmé — le
> raisonnement que `revokeCurrentPushToken` applique déjà aux push n'avait jamais été appliqué au
> cache. Jusqu'ici le symptôme restait dans le CONTENU des écrans, la nav dérivant de la session
> Better Auth seule ; #198 a branché la nav sur une requête, et l'onglet Messages du compte quitté
> est resté. `resetQueryCache()` vide mémoire **et** disque, appelée aux deux bouts : à la
> déconnexion pour ne pas laisser ces données dormir, et à la **connexion** — le seul passage
> obligé, puisqu'une session expirée côté serveur ramène au login sans qu'aucune déconnexion soit
> passée. Le web avait le même trou en mémoire, sans persistance : il mourait au rechargement
> complet, pas avant.

> **Tranché en #198** (le volet de débrief EXPLIQUE, là où la nav se contente de disparaître) :
> troisième surface trouvée en test, hors de ce que l'issue nommait. La boîte de réception du coach
> ouvre un fil pour chaque débrief lu — y compris celui qu'il a écrit lui-même en auto-coaching —,
> et affichait « Impossible d'ouvrir la conversation… Réessaie dans un instant ». Un incident
> passager annoncé pour un état **définitif** : le CHECK `coach_athlete_not_self` (#11) interdit ce
> fil pour toujours.
>
> Deux traitements DIFFÉRENTS pour le même invariant, et c'est délibéré. La nav retire l'entrée
> sans un mot : elle liste des destinations, une absence s'y lit toute seule. Le volet, lui, garde
> son titre « Réponses » et met une phrase à la place du composeur — une section qui disparaîtrait
> ferait chercher la barre d'envoi en passant d'un débrief à l'autre, et l'écran ne dirait rien de
> ce qui l'a fait partir.
>
> `useIsSelfAthlete` prolonge la règle de #14 : le « c'est moi » se déduit de la SESSION, pas d'un
> drapeau porté par chaque DTO. Séparé de `useAthleteLabel` volontairement — celui-ci est réservé au
> texte affiché, et brancher un rendu sur la présence de « (moi) » dans une chaîne traduite serait
> un test qui casse au premier reformulage du catalogue.

> **Corrige le journal de #14** (la messagerie n'était fermée qu'à MOITIÉ) : les deux encadrés
> « Tranché en #14 » affirment que la messagerie est « fermée en auto-coaching — aucun fil avec
> soi-même ne peut exister » et qu'elle l'était « **déjà** ». C'était vrai de l'API, et faux de
> l'écran : `GET /athletes` sert son entrée synthétique `isSelf` à la liste de fils, qui l'affichait
> en tête. Le compte se voyait comme son propre interlocuteur, et le toucher menait au refus. #198
> écarte l'entrée dans les deux listes de fils — **là et nulle part ailleurs** : elle reste sur
> `GET /athletes`, dont le tableau de bord et le constructeur de cycle dépendent.

> **Corrige à nouveau le journal, tranché en [#316](https://github.com/Cimavia/cimavia/issues/316)**
> (le fil avec soi-même existait bel et bien) : l'encadré ci-dessus tient l'API pour fermée en
> solo. Elle l'était pour `open`, pas pour l'avis de débrief (#96), qui passe par
> `ConversationService.ensure` sans relation à résoudre. Chaque débrief auto-coaché ouvrait donc un
> fil (soi, soi) et y posait un avis signé de l'athlète — c'est-à-dire du coach : la boîte de
> réception l'affichait « Répondu », alors que personne n'avait répondu.
>
> Trois verrous, du plus près au plus loin :
>
> - `FeedbackAnnouncerService.announce` sort quand `coachId === athleteId` — il n'y a personne à
>   prévenir ;
> - « Répondu » ne lit plus les avis (`FEEDBACK_EVENT_MESSAGE_TYPES`) : un événement du serveur
>   n'est pas une réponse, quel qu'en soit l'auteur ;
> - le CHECK `conversation_not_self` rejoint `coach_athlete_not_self` (#11), même raison et même
>   partage : le service refuse avec un message, la table SURVIT au chemin qui oublierait la garde.
>   Comme lui, il ne se lit que dans sa migration.
>
> La migration **purge** les fils (soi, soi) déjà posés — preview compris —, leurs avis partant en
> cascade. Elle s'**arrête** au lieu de purger si l'un d'eux contient un message écrit par un
> humain : aucune route ne le permet, mais effacer une donnée réelle et orpheliner ses médias dans
> le stockage serait le pire des deux échecs. Mesuré sur la base e2e : fil fantôme purgé, message
> écrit → migration refusée, insertion directe d'un fil (soi, soi) → refusée par le CHECK.

---

## Post-MVP — Curseur des notes vocales ([#536](https://github.com/Cimavia/cimavia/issues/536))

> **Tranché en #536** (deux zones de geste, sans `PanResponder`) : le curseur mobile (`CmvSeekBar`)
> vit dans des listes qui défilent. Une zone intérieure prend le doigt dès le toucher SANS bloquer
> le défilement natif — un toucher bref saute, un mouvement vertical rend la main à la liste ; la
> zone extérieure ne le prend qu'au-delà de 8 dp horizontaux, et bloque ALORS le défilement jusqu'au
> relâché. Une seule vue ne peut pas faire les deux : bloquer se décide à la prise du doigt. D'où
> les props du système de responder plutôt que `PanResponder`, qui les enveloppe : même cœur de
> React Native, toujours sans dépendance native, mais il bloque par défaut et calcule son `dx` sur
> des horodatages que le harnais rend égaux. `locationX` n'est lu qu'au premier contact — sur
> Android, il se recalcule ensuite sur la vue sous le doigt — et le glissé suit l'écart de `pageX`.
>
> **Tranché en #536** (un saut garde l'état de lecture) : `seekTo` n'est appelé qu'au relâché ;
> pendant le glissé, le temps et la pastille suivent le doigt, et après le saut ils montrent la
> position visée jusqu'à ce que `seekTo` rende la main (les deux plateformes émettent leur statut à
> jour juste avant). Trois pièges, tous couverts par un test :
>
> - **Android relance une note terminée qu'on déplace** : en fin de note, expo-audio fait retomber
>   `playing` sans jamais mettre son lecteur en pause. Un saut qui ne doit pas jouer passe donc par
>   `pause()` d'abord.
> - **L'envie de lecture survivait à la fin** : une note finie, puis déplacée sur une URL expirée,
>   se relançait au rechargement de (B). Elle est recalée au saut.
> - **(B) et le réessai reprennent à la position visée**, et non à `player.currentTime`, qui n'a pas
>   forcément bougé quand le saut lui-même casse sur le 403. Une note pas encore chargée garde son
>   saut et l'applique au chargement, comme une reprise ; elle n'est plus « au repos » pour (A).
>
> **Tranché en #536** (ce que la maquette ne dit pas) : `conversation_1_1` dessine une FORME D'ONDE.
> Le mobile a toujours eu une barre plate, écart jamais consigné jusqu'ici ; l'issue la garde, et y
> ajoute une pastille que la maquette n'a pas — le repère qu'on attrape. La zone tactile monte à
> environ 32 dp par `hitSlop`, sans hausser la ligne. Pour l'accessibilité, `aria-value*` plutôt que
> l'`accessibilityValue` demandée (même valeur native, mais seule visible des tests, dette **Q-6**),
> et un pas fixe de 5 s : il se prévoit, là où un dixième de note vaudrait une seconde sur un vocal
> court et vingt sur un long.

---

## Post-MVP — Notes vocales enchaînées ([#529](https://github.com/Cimavia/cimavia/issues/529))

> **Tranché en #529** (une seule note vocale à la fois, et seulement les notes) : lancer une note
> met en pause celle qui joue, sur toute l'app — les médias d'un débrief et ses réponses partagent
> une page. Les **vidéos n'entrent pas dans la règle** : une vidéo peut jouer par-dessus une note,
> en ligne sur le web comme en plein écran sur mobile. C'est un choix, pas un oubli : la demande
> portait sur les notes, et `CmvVideoPlayer` mobile reste intact.
>
> **Tranché en #529** (on n'enchaîne que sur une note qui JOUAIT) : la fin d'une note lance la
> suivante seulement si elle jouait quand elle s'est terminée. Une note en pause qu'on amène au
> bout du curseur — natif sur le web, ajouté sur mobile par
> [#536](https://github.com/Cimavia/cimavia/issues/536) — ne lance rien. Une note qu'on fait
> glisser jusqu'au bout PENDANT la lecture se termine, et la suivante démarre : distinguer ce
> saut d'une fin naturelle demandait de suivre `seeking`/`seeked`, dont l'ordre varie d'un
> navigateur à l'autre, pour un cas où l'auditeur vient justement de passer la note.
>
> **Tranché en #529** (ce qui arrête un fil) : la règle « le message suivant, s'il est vocal »
> s'applique à la lettre. Un **avis de débrief** intercalé arrête l'enchaînement, comme un texte —
> il se lit, il ne s'écoute pas. Une note vocale **sans média** aussi : sa bulle est vide, il n'y a
> rien à jouer, et sauter par-dessus enchaînerait deux notes que l'écran sépare.

---

## Post-MVP — Un message qui n'est pas parti ([#339](https://github.com/Cimavia/cimavia/issues/339))

> **Tranché en [#339](https://github.com/Cimavia/cimavia/issues/339)** (le champ se vide au
> SUCCÈS, pas au clic) : la barre d'envoi vidait son champ dès l'envoi lancé, et un échec — 502 du
> tunnel, réseau coupé — emportait le texte. Le toast (web) ou la ligne d'erreur (mobile) disait
> l'échec sans rendre le texte.
>
> - **Pessimiste, pas optimiste.** L'issue laissait le choix : vider puis restaurer à l'échec
>   aurait dû fusionner le texte rendu avec ce qu'on a commencé d'écrire entre-temps, pour aucun
>   gain — le MVP n'a pas d'envoi différé, rien n'apparaît dans le fil avant la réponse du serveur.
>   `onSendText` rend donc une promesse (`mutateAsync`), contrat partagé compris
>   (`feedbackReplySurface`) : la barre sait si le texte est parti.
> - **Le champ reste éditable pendant l'envoi**, seul le bouton se ferme. Au retour, ce qui est
>   parti est retiré s'il est encore en tête du champ, et ce qui a été écrit après reste ; un texte
>   RÉÉCRIT n'est pas touché — la frappe gagne, comme au débrief (#284). La règle vit dans
>   `draftAfterSend` (`@cmv/shared`), appelée par les deux barres.
> - **Le fil web ferme sa barre tant qu'il n'est pas résolu** (en cours ou en échec), comme sous un
>   débrief : le texte partait vers `/conversations//messages`. Le mobile ne montait déjà pas de
>   barre sans fil — mais **son échec de résolution se cachait derrière un chargement sans fin** :
>   sans id, la requête des messages est désactivée et TanStack la rend `isPending`. L'erreur passe
>   désormais avant le chargement ; le test simulait `isPending: false`, un état qui n'arrive pas.

---

## Post-MVP — Note vocale écran verrouillé ([#619](https://github.com/Cimavia/cimavia/issues/619))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| NV-1 | **La notification Android de l'enregistrement est en anglais** (règle dure n°6) : « Recording audio » / « Tap to return to app », et le canal « Audio Recording » visible dans Réglages › Notifications. `AudioRecordingService.kt` les écrit en dur, sans ressource Android à surcharger : la voie d'IOS-1 (`expo.locales`) ne s'applique pas. Seule issue aujourd'hui, un `pnpm patch` du service, écarté : à rejouer à chaque montée d'`expo-audio`. Même famille que [#348](https://github.com/Cimavia/cimavia/issues/348). | 🟢 | — *(déclencheur : une option de configuration côté `expo-audio`, ou un retour d'utilisateur qui s'en plaint)* |
| NV-2 | **Le service de premier plan `microphone` n'est déclaré nulle part côté store** : la Play Console exige une justification et une vidéo pour chaque type de service de premier plan du manifeste. | 🟡 | — *(déclencheur : la première publication sur le Play Store ; Android n'est distribué qu'en interne, `eas.json` n'a pas de `submit` Android)* |

*Résolues, à l'[archive](archive.md) : NV-3, NV-4.*

> **Tranché en #619** (la note vocale continue écran verrouillé) : le Coach bêta perdait tout ce
> qu'il disait une fois l'iPhone en veille. expo-audio met l'enregistreur en pause dès que l'app
> passe en arrière-plan, et la note gardait un trou muet que rien ne signalait.
>
> - **Arrière-plan d'abord, premier plan en repli.** Chaque capture demande
>   `allowsBackgroundRecording`. Android exige alors `POST_NOTIFICATIONS`, pour la notification de
>   son service : refusée, `prepareToRecordAsync` lève `ERR_NOTIFICATION_PERMISSIONS`, et la
>   capture repart au premier plan au lieu d'échouer. On ne redemande pas les notifications à ce
>   moment-là : la demande appartient à `usePushToken`. Le repli **se dit sous le minuteur** — au
>   verrouillage manuel, le trou reste possible, mais il n'est plus muet.
> - **L'écran reste allumé tant que le bandeau est affiché**, et non entre `record()` et chaque
>   sortie comme le proposait l'issue : `useKeepAwake` vit dans le bandeau, que le natif retire à
>   l'envoi, à l'annulation, à l'échec et au démontage. Aucune sortie n'a de libération à écrire,
>   donc aucune ne peut l'oublier. Un arrêt qui échoue garde le bandeau tant que le natif dit
>   enregistrer, et l'écran allumé avec lui.
> - **Quitter l'écran en pleine capture rend le mode lecture.** expo-audio libère l'enregistreur et
>   rien ne part — pas l'écueil web de [#340](https://github.com/Cimavia/cimavia/issues/340) —, mais
>   le mode « record » restait posé et aurait rendu muettes les notes lues ensuite. Le drapeau se
>   lève AVANT la préparation, qui attend le service d'Android : partir pendant ce temps le rend
>   aussi.
> - **`enableBackgroundPlayback: false`.** Actif par défaut, il posait `UIBackgroundModes` sans
>   usage (IOS-3) et déclarait côté Android un service `mediaPlayback` que seuls les contrôles de
>   l'écran verrouillé emploient — l'app n'en a pas. `UIBackgroundModes: ["audio"]` reste posé,
>   justifié par l'enregistrement, et il ne reste que `microphone` à déclarer au store (NV-2). Un
>   test d'`app.config.test.ts` garde le plugin aligné sur le mode que passe le JS : sans
>   `enableBackgroundRecording`, Android refuserait TOUTE capture.
> - **Le second piège de l'issue ne se présente pas** : `prepareRecording` attend la liaison du
>   service (`bindWithService`, suspendu) avant de rendre la main, et `record()` la trouve. Lu dans
>   `AudioRecorder.kt`, à confirmer sur appareil.
> - **L'appel entrant** coupe la session audio malgré tout : c'est le système qui le fait. Ce que
>   devient la capture n'est pas traité ici, il s'observe en recette. Le risque à guetter : un
>   arrêt venu du natif retire le bandeau sans passer par `finish`, et `onRecordingChange(false)`
>   ne part pas — la barre de messages resterait masquée, et un nouvel essai pourrait buter sur un
>   enregistreur encore préparé. *Levé en #856 : toute fin native passe par la clôture de la
>   capture, et une fin sans fichier libère l'enregistreur.*

> **Tranché en #856** (la note vocale s'arrête au plafond, et la parole continue) : le mobile
> n'avait pas de plafond, et une note de plus de cinq minutes était refusée en entier à l'envoi
> (NV-3). Le choix produit va plus loin qu'un arrêt : **au plafond, la note part et l'enregistrement
> continue dans une note neuve, sans coupure entre les deux.**
>
> - **Le plafond est tenu par le natif** (`record({ forDuration })`), pas par un minuteur JS :
>   Android suspend les timers JS écran verrouillé (`JavaTimerManager.onHostPause`), quand la
>   capture, elle, continue. Les événements natifs, eux, arrivent toujours.
> - **Deux enregistreurs se relaient.** Celui qui ne capte pas est préparé pendant la note ; à la
>   fin native, il reprend aussitôt et la note close part. Android ne fait pas que le préparer : il
>   le **démarre puis le met en pause**, parce que son service de premier plan ne compte que les
>   enregistreurs démarrés, s'arrête avec le dernier, et qu'Android 14 refuse de le relancer
>   écran verrouillé. iOS n'a pas de tel service : préparé suffit. Mesuré sur l'émulateur
>   (Pixel 8, API 35) : relais au premier plan et écran verrouillé, service conservé, micro « not
>   silenced », environ 25 ms de coupure côté natif. Le contenu sonore, lui, n'y est pas
>   vérifiable (le micro de l'hôte rend des zéros) : il se vérifie sur téléphone, iPhone compris.
> - **Le relais se prépare APRÈS le départ de la note**, et non avant : il a cinq minutes devant
>   lui, et le tap n'attend pas une seconde préparation. Dès le second relais, c'est de toute façon
>   pendant une capture qu'il se prépare. Effet connu : l'amorce d'Android capte quelques
>   millisecondes en tête de la note suivante. Non vérifié : Android 9 et antérieurs, où deux
>   captures simultanées peuvent être refusées — le relais échouerait alors, et la capture
>   s'arrêterait au plafond comme sans relais ; et un appareil dont la politique audio donnerait le
>   micro à la capture la plus récente, ce qui rendrait muette la note en cours. Les deux se
>   guettent en recette sur téléphone : du son d'un bout à l'autre de chaque note, pas seulement
>   aux jonctions.
> - **Chaque préparation passe le preset.** Sans options, iOS réutilise son `AVAudioRecorder`, donc
>   son fichier : préparer à nouveau l'enregistreur de la note qui vient de partir l'écrasait en
>   plein envoi. Avec elles, il en crée un neuf, au nom unique, comme Android à chaque préparation.
> - **Un relais qui ne capte pas est un échec.** iOS ne lève pas quand `AVAudioRecorder` refuse de
>   démarrer (`record(forDuration:)` rend `false`, qu'expo-audio ignore) : le composant relit
>   `isRecording`, qui lit le natif, et s'arrête au plafond en gardant la note.
> - **L'enregistreur qui capte est tenu par un `ref`**, posé dès le relais : un tap « envoyer » ou
>   une fin native arrivés avant le rendu suivant visent le bon, au lieu de laisser le relais capter
>   sans que rien ne l'arrête.
> - **La durée transmise est celle de l'horloge**, bornée au plafond : Android remet sa durée à
>   zéro en s'arrêtant, et le relevé natif (toutes les 500 ms) n'est plus lu écran verrouillé.
>   Exception, la capture **au premier plan seul** : elle se met en pause écran verrouillé, et le
>   natif la clôt quand même au plafond de l'horloge. Sa durée est alors le dernier relevé pris
>   pendant qu'elle captait (à un relevé près), et une note close ainsi bien avant le plafond n'est
>   ni relayée ni dite « au plafond ». Il ne compte que si l'écart dépasse 5 s : un fil JS en
>   retard ne passe pas pour une pause. La durée reste déclarative (P5-2).
> - **Seule une fin au plafond relaie ou se dit.** Une fin native bien avant (interruption iOS,
>   arrêt venu d'ailleurs) garde la note, sans relais ni avis. Une fin **sans fichier** est un
>   échec, même annoncée sans erreur (iOS, `mediaServicesDidReset`), et libère l'enregistreur.
> - **Pas de relais sans service en arrière-plan** : sans `POST_NOTIFICATIONS`, la capture est au
>   premier plan seul, et un micro ouvert app en arrière-plan ne capterait que du silence. Elle
>   s'arrête au plafond.
> - **Le relais est libéré AVANT le mode lecture.** `setAudioModeAsync` retire le service de
>   premier plan à tous les enregistreurs d'Android (`useForegroundService`), et `stopRecording` ne
>   désinscrit du service que s'il l'a encore : un relais amorcé libéré après aurait gardé le
>   service et sa notification.
> - **L'amorce n'a lieu qu'avec le service.** Au premier plan seul, expo-audio relance au retour de
>   l'app tout enregistreur en pause : un relais amorcé capterait par-dessus la note. Il est donc
>   préparé seulement.
> - **Sur iOS, préparer le relais touche la session partagée** (`setCategory`, `setActive(true)`) ;
>   si la création de son enregistreur échoue (disque plein), le natif désactive la session, et la
>   note en cours se tait. Risque accepté, rare et hors de portée du JS ; il se lève par une issue si
>   la recette iPhone ou Sentry le montre.
> - **Le relais est borné.** Le débrief passe ses places restantes (`notesLeft`) ; le fil, qui n'a
>   pas de quota, passe `MESSAGE_AUDIO_NOTES_PER_CAPTURE` (3 notes, 15 min) — sans quoi un micro
>   oublié en poche, écran gardé allumé, enverrait une note toutes les cinq minutes. Le compte est
>   arbitraire, à revoir sur retour de la bêta.
> - **Ce que voit l'utilisateur** : le bandeau reste, son minuteur cumule les notes de la capture,
>   et une ligne dit « Note N envoyée, l'enregistrement continue ». Quand rien ne peut prendre la
>   suite, la capture s'arrête et l'écran appelant le dit (`CmvAudioLimitNotice`), d'un ton neutre :
>   la note est partie. Une seule clé pour les deux écrans, et elle n'est dite qu'une fois la note
>   partie. L'avertissement avant le plafond reste hors de cette issue.
> - **Les préparations du relais passent une à une**, et chacune n'est prête que pour SA capture :
>   celle d'Android attend jusqu'à 5 s son service, et une capture neuve lancée dans l'intervalle
>   croisait la préparation de la précédente sur le même enregistreur. Elle l'attend ; la
>   précédente, close, libère l'enregistreur, et la neuve prépare le sien.
> - **Les places du débrief sont lues au départ de la capture**, et la relecture qui suit un envoi
>   n'est pas attendue : un micro rallumé dans l'intervalle (quelques centaines de millisecondes)
>   peut compter une place de trop, et la note relayée en trop est refusée par l'API, qui le dit.
>   Attendre la relecture a été essayé puis retiré : hors ligne, TanStack Query la met en pause, et
>   l'envoi serait resté « en cours » jusqu'au retour du réseau.
> - **Deux relevés natifs par écran** (`useAudioRecorderState`, un par enregistreur), gardés tous
>   les deux : un seul, rebranché au relais, afficherait un instant la durée de la note close. Au
>   repos, un relevé inchangé ne provoque aucun rendu (le hook garde l'état précédent).

> **Tranché en #858** (une note relayée ne tait plus l'échec de la précédente) : au plafond, la
> note close part pendant que la capture continue, et la suivante pouvait partir avant la fin de
> son envoi. Les deux passaient par la même mutation, que TanStack Query n'observe que pour le
> dernier `mutate()` : l'échec de la première n'était plus affiché, et l'Athlete la croyait partie.
>
> - **Les notes partent l'une après l'autre** (`scope` des mutations, une file par séance ou par
>   fil — `useVoiceNoteUpload`). Sur un lien faible, deux envois simultanés ne vont pas plus vite
>   au total ; en file, l'avancement affiché est celui d'une seule note, et « envoi en cours »
>   couvre toute la file, puisque la dernière ne finit qu'après les autres. Une note qui échoue ne
>   bloque pas la suivante.
> - **L'échec est retenu hors de la mutation**, par le `onError` des options, qui part pour chaque
>   note quel que soit l'observateur. Une note réussie ensuite ne l'efface pas.
> - **Il s'efface au début d'une capture lancée à la main**, et jamais à l'arrivée d'une note :
>   `MediaPicker` et `Composer` remontent `onCaptureStart` quand l'enregistreur démarre, et les
>   trois écrans y effacent leurs erreurs (refus du micro ou de la galerie, échec d'une note,
>   retrait raté du débrief). Avant, ils le faisaient dans `onRecordAudio`, que le relais appelle
>   aussi. Un refus de la galerie disparaît donc au démarrage de la capture, et non plus à
>   l'envoi de la note.
> - **Le cache persisté n'écrit plus aucune mutation** (`shouldDehydrateMutation: () => false`),
>   ce que son commentaire affirmait déjà. Par défaut, TanStack écrit sur le disque toute mutation
>   en pause, file comprise : restaurée sans sa fonction d'envoi, une note hors réseau aurait
>   bloqué toutes les suivantes de sa file jusqu'au retour du réseau ou du premier plan.
> - **Quitter l'écran efface l'échec**, l'état étant local à l'écran : l'envoi continue, mais son
>   échec n'est plus dit nulle part. Comportement d'avant #856, inchangé ici. De même, deux écrans
>   montés sur le même fil (réponse au débrief, puis le fil) partagent sa file : la note de l'un
>   attend celle de l'autre en disant « envoi en cours », sans en dire l'échec.
> - **Limite assumée : un seul emplacement d'erreur.** Un refus posé à la main (micro, galerie)
>   passe avant l'échec retenu (`mediaErrorMessage`). Si une capture voit d'abord échouer une note
>   relayée, puis son propre arrêt échouer, seule la seconde panne est dite. Les deux à la fois
>   demandent une seconde ligne dans trois écrans ; à rouvrir si la bêta le rencontre.

> **Tranché en #700** (un démarrage raté ne bloque plus les suivants) : Android pose `isPrepared`
> à la préparation et refuse toute autre tant que l'enregistreur n'est ni arrêté ni libéré. Un
> `record()` qui levait laissait donc l'enregistreur préparé, et chaque tap suivant échouait
> (`AudioRecorder has already been prepared`, CIMAVIA-MOBILE-F).
>
> - **Le `catch` de `start()` appelle `recorder.stop()`**, best-effort : le natif y libère le
>   `MediaRecorder` même quand rien n'a démarré. L'erreur d'origine prime sur celle de la libération.
> - **Sentry reçoit le `code` natif et la plateforme** (tags), pour nommer la prochaine panne.
> - **Pas de repli au premier plan quand le service ne se lie pas** : la cause d'origine n'est pas
>   établie, et un repli la masquerait en disant « se met en pause écran verrouillé » sur une panne
>   mal comprise. L'erreur s'affiche. Le repli se rouvre par une issue dédiée, une fois la cause
>   nommée par les tags.

## Post-MVP — Recherche dans la messagerie ([#702](https://github.com/Cimavia/cimavia/issues/702))

> **Tranché en #702** (ce que la recherche restreint) : la **liste**, jamais le fil. Sur le web, le
> fil ouvert se cherche dans la liste entière : quand le filtre écarte sa ligne, il reste affiché à
> droite et seule la ligne disparaît — taper un nom ne ferme pas la conversation qu'on lisait, et
> la liste ne montre que ce qui correspond.
>
> - **Le nom des participants, pas le texte des messages** : celui-ci exige une recherche en base
>   (index, scope de participation, pagination #77), un autre chantier à ouvrir si le besoin se
>   confirme.
> - **L'acteur ne s'écarte pas à la main** : `participants` ne nomme déjà que les autres (#611).
> - **Le terme vit dans l'URL sur le web** (`?q=`, comme le tableau de bord en #123), **dans l'écran
>   sur le mobile** : l'onglet reste monté sous le fil, le terme survit à l'aller-retour.

## Post-MVP — Fichier joint dans la messagerie ([#771](https://github.com/Cimavia/cimavia/issues/771))

> **Tranché en #771** (le PDF entre dans le fil) : un nouveau type de message **`FILE`**, et non
> `DOCUMENT` — ce nom est déjà le document d'exercice — ni `PDF` : la liste des types acceptés
> (`MESSAGE_FILE_MIME_TYPES`) s'élargira sans migration d'enum.
>
> - **`MediaType` ne s'élargit pas** : il porte aussi le débrief, que ce choix ne concerne pas.
>   `sendMediaBatch` devient générique sur la famille, et la messagerie lui passe la sienne
>   (`MessageMediaKind`, `MESSAGE_MEDIA_BATCH_SLOTS`).
> - **Le fichier est confronté à l'arrivée** (`assertUploadedAsDeclared`) : une branche neuve n'ajoute
>   pas de cas à S-1.
> - **La taille s'affiche**, comme la maquette `conversation_1_1` la dessine (`fileSizeOf`).
> - **Un PDF répond aussi à un débrief** : la barre d'envoi est la même, la limiter au fil aurait
>   demandé une variante pour rien.
> - **Web : l'onglet s'ouvre dans le clic**, vide, puis reçoit l'URL re-signée (`openInNewTab`).
>   Ouvert après l'attente, Safari et Firefox le bloqueraient comme fenêtre surgissante.
> - **Mobile : `expo-document-picker`**, comme l'issue le citait, et non le sélecteur
>   d'`expo-file-system`, pourtant déjà là : sur Android, le nom que celui-ci rend au JS est
>   l'identifiant du fournisseur (`msf:1000038591`), sans extension. Le PDF serait parti sous ce
>   nom, et le lecteur du destinataire n'aurait plus su ce qu'il ouvrait. Il copie chaque fichier
>   dans `cache/DocumentPicker` : la taille signée est celle de cette copie, mesurée (un fichier
>   Drive en déclare une autre), et la copie est effacée à la fin du lot comme au changement de
>   compte.
> - **Ce qui laisse partir un PDF se décide une fois** (`checkMessageFile`) : type, taille connue et
>   non nulle, plafond. Le web et le mobile le disent pareil.
> - **Mobile : le choix « Photo ou vidéo / Fichier PDF » se fait en ligne** dans la barre d'envoi,
>   pas par l'alerte native : elle ignore les tokens et le harnais ne la voit pas
>   (cf. `CmvConfirmButton`).
> - **Mobile : le fichier est descendu au premier tap** dans `Paths.cache/message-files`, gardé
>   s'il a la taille du message (un processus tué en route laisse un fichier tronqué), puis
>   remis au lecteur par le geste des documents de séance (#95), promu en `shared/lib/open-file.ts`.
>   `Paths.cache` et non `Paths.document` : un fichier de message n'a pas à survivre hors ligne
>   comme une séance. Il est purgé au changement de compte (`resetAccountData`).
> - **Un type inconnu se dit** (« ne s'affiche pas dans cette version ») au lieu de tomber dans le
>   lecteur vidéo, sur les deux clients. Les binaires mobiles déjà installés, eux, rendront un
>   `FILE` en pastille vidéo muette jusqu'à leur mise à jour, et l'aperçu de la liste des
>   conversations en clé brute (`messages.preview.FILE`, absente de leur catalogue) : c'est une
>   `feat` avec un module natif neuf, pas d'OTA (#287).

## Post-MVP — Défilement du fil web ([#367](https://github.com/Cimavia/cimavia/issues/367))

> **Tranché en #367** (le fil suit le lecteur, pas l'arrivée des messages) : le web recolle au bas
> quand le contenu du fil ou son cadre **change de taille** (`useStickToBottom`, un
> `ResizeObserver`), et seulement si le lecteur était au bas, à 80 px près. Un `scrollIntoView` au
> rendu tombait avant le chargement des images : la dernière photo restait coupée, et chaque
> sondage ramenait au bas un lecteur qui remontait l'historique.
>
> - **Aucune place réservée aux images** : le DTO média ne porte pas leurs dimensions, et les
>   relever à l'envoi demanderait une migration, l'API et les deux clients. L'observateur suffit
>   à rester collé ; il couvre en prime la vidéo (300×150 avant ses métadonnées) et la barre
>   d'envoi qui s'agrandit.
> - **Se décrocher, c'est remonter**, pas « être à plus de 80 px du bas » : une photo qui charge
>   entre l'écriture de `scrollTop` et l'événement `scroll` creuse l'écart sans que le lecteur ait
>   bougé, et le fil se serait décroché tout seul.
> - **Le geste d'envoi ramène au bas** — texte, fichiers, note vocale —, d'où qu'on écrive. Pas
>   « le dernier message est de moi » : un entrant arrivé dans le même sondage le masquerait, et
>   un message à mon nom posté d'ailleurs (le mobile, un avis de débrief) me tirerait vers le bas
>   sans geste ici. Un message reçu, jamais.
> - **Lu, c'est vu** : le fil ne marque plus lu qu'au bas. Il y ramenait le lecteur à chaque
>   arrivée, ce qui rendait le marquage immédiat à peu près vrai ; parti dans l'historique, il
>   n'a pas vu ce qui arrive, et l'expéditeur lirait « Lu par » à tort.
> - **La pastille « N nouveaux messages »** dit au lecteur parti ce qu'il manque : les entrants
>   arrivés après le dernier message qu'il avait vu au bas (`incomingCountAfter`, entrant au sens
>   du marquage lu, avis compris). Repère introuvable ou session inconnue : elle se tait plutôt
>   que d'inventer un nombre. Un clic descend en douceur ; elle disparaît au retour au bas, par ce
>   clic ou à la main. Sa région est `aria-live` et toujours montée : un lecteur d'écran, que le
>   fil ne déplace plus, est prévenu. Pas de maquette : elle reprend les tokens de surface et de
>   bordure.
> - **Pas de `flex-col-reverse`** : son ancrage diffère d'un navigateur à l'autre, et inverser
>   l'ordre du DOM aurait fait lire le fil à rebours aux lecteurs d'écran.
> - **Le mobile ne bouge pas** : sa `FlatList` inversée reste au bas quand un média y grandit, et
>   ne ramène pas au bas le lecteur qui remonte. Il n'a pas de pastille ; à ouvrir si la bêta la
>   réclame.

## Post-MVP — Destination d'une notification ([#344](https://github.com/Cimavia/cimavia/issues/344))

> **Tranché en [#344](https://github.com/Cimavia/cimavia/issues/344)** (une notification s'ouvre
> sous SON titre, pas sous celui qu'on exerce) : sur un compte coach et athlète, les deux tables de
> routage — mobile (cloche et push) et web — branchaient sur `isCoach`, et la capacité coach gagnait
> toujours. L'issue proposait de router au titre exercé ; c'eût été déplacer le bug. Le centre
> n'est **pas filtré par espace** : il liste, mêlé, ce que le compte reçoit des deux côtés, et un
> « débrief reçu » ouvert en titre athlète serait parti vers `/session/:id`, une route d'athlète
> qui ne lit pas la séance de SON athlète.
>
> - **Le titre vient du type** (`notificationOpeningCapability`, `@cmv/shared`), par
>   `capabilityOfNotification` (#176) : un cycle se lit en athlète, un débrief en coach.
> - **Le titre exercé ne départage que le message**, que les deux côtés d'un fil reçoivent. Le
>   mobile garde alors sa règle : le fil absent du titre courant laisse sur la liste, où la pastille
>   du sélecteur signale l'autre côté. Le web pose l'espace parcouru dans `?as=` — avant, rien, et
>   l'écran retombait sur le persona : un pari ni meilleur ni pire, mais qui ne fait pas changer
>   d'espace sous les yeux.
> - **Ne mènent nulle part** : un titre que le compte n'a plus (un Coach qui a cessé de coacher
>   relit un vieux débrief) — plutôt qu'un 403 —, et un **type inconnu**, fail closed comme
>   `capabilityOfNotification` : un client ne devine pas le titre d'un type que l'API a ajouté
>   après lui. La cloche et le push s'accordent ainsi, le push ne sachant pas lire ses clés d'id.
> - **Ouvrir une notification emporte son titre** : le mobile bascule le sélecteur avant de
>   naviguer, le web le pose dans `?as=` de Factures et Messagerie — l'un et l'autre pour un compte
>   qui cumule seulement, l'URL d'un compte mono-capacité restant nue (#129). Sans ça, une facture
>   émise ouverte en titre coach montrait les factures du coach.

## Post-MVP — Date d'un message ([#867](https://github.com/Cimavia/cimavia/issues/867))

> **Tranché en [#867](https://github.com/Cimavia/cimavia/issues/867)** (un message n'est jamais
> daté avant le dernier de son fil) : `createdAt` venait de `@default(now())`, donc de l'horloge
> du serveur, et cette horloge recule. Sous WSL2, elle s'est recalée de −2,26 s entre deux envois
> séparés de 633 ms (mesuré dans la trace de l'e2e Playwright, qui tombait une fois sur trente). La
> réponse a été datée avant le message auquel elle répondait. Le fil et l'aperçu de la liste
> passaient à rebours, et un message daté avant la marque de lecture de son destinataire n'était
> **jamais compté non lu**. Un serveur que NTP ramène en arrière ferait de même.
>
> - **La date d'un message est `max(maintenant, lastMessageAt + 1 ms)`** (`nextMessageDate`). Elle
>   est posée par `appendMessage`, seule porte d'écriture d'un message : l'envoi et l'avis de débrief
>   y passent tous deux. Une milliseconde de plus et non la même date : le fil se trie sur la seule
>   `createdAt`, et une égalité y laisserait l'ordre au hasard.
> - **`lastMessageAt` est relu dans la transaction**, et non pris du fil chargé en début de
>   requête : entre les deux passent une relecture au storage et un rattachement à résoudre, le
>   temps qu'un autre message soit validé. Il n'est **jamais ramené en arrière** : un envoi
>   concurrent validé après un autre peut porter une date plus ancienne.
> - **La date peut devancer l'horloge.** Après un recul, elle le devance de la durée du recul au
>   plus, quelques secondes. Après un saut EN AVANT que l'horloge corrige ensuite, les messages du
>   fil restent datés dans le futur, une milliseconde l'un après l'autre, jusqu'à ce que l'horloge
>   rattrape le dernier. C'est le prix de l'ordre. Une borne le romprait, et un tel saut ne s'est
>   jamais vu. Les notifications, elles, gardent l'horloge du serveur et peuvent précéder de ces
>   quelques secondes le message qu'elles annoncent.
> - **L'attente du parcours Playwright ne bouge pas** : c'est le produit qui se trompait, pas le
>   test.
>
> Écart assumé : **deux écritures dont les transactions se chevauchent ne sont pas sérialisées**.
> Aucun verrou n'est posé sur le fil : il faudrait du SQL brut (`FOR UPDATE`, ou `GREATEST` dans
> l'`UPDATE`), et la règle dure n°1 le réserve aux exceptions. Hors recul, chacune garde la date
> de son horloge, comme avant. PENDANT un recul, deux écritures du même fil, à quelques
> millisecondes l'une de l'autre, peuvent lire le même `lastMessageAt` et prendre la même date :
> leur ordre devient celui de Postgres, et celle validée après une lecture du fil peut passer pour
> lue. Il faut donc réunir un recul et deux écritures au même instant dans le même fil.

## Post-MVP — Pagination du fil ([#77](https://github.com/Cimavia/cimavia/issues/77))

> **Tranché en [#77](https://github.com/Cimavia/cimavia/issues/77)** (le fil se lit par pages) :
> `GET /conversations/:id/messages` rend `{ items, nextCursor }` : les 50 messages les plus récents
> (`limit` de 1 à 100), dans l'ordre de lecture ; `?before=<nextCursor>` donne la page d'avant. Le
> web remonte quand un repère posé en tête du fil entre à l'écran, le mobile à l'`onEndReached` de
> sa liste inversée.
>
> - **Rupture assumée** : une seule forme de réponse, sans compatibilité avec les binaires mobiles
>   déjà installés. Un binaire d'avant #77 ne lit plus le fil ; la bêta installe le build de la
>   promotion.
> - **Le curseur est une position, pas une ligne** : le `(createdAt, id)` du plus ancien message de
>   la page, en base64url, opaque pour les clients. L'API le décode sans relire la base. Un curseur
>   forgé ne montre rien de plus : le filtre reste sous le scope de tenancy (e2e
>   `message-pages`). L'`id` départage les messages de même date, que #867 laisse passer pendant un
>   recul d'horloge : sans lui, une page coupée au milieu d'une égalité en perdrait. L'encadré de
>   #867 dit que « le fil se trie sur la seule `createdAt` » : depuis #77, l'ordre d'une égalité est
>   celui des `id`, stable mais sans rapport avec l'envoi.
> - **Le filtre est `createdAt ≤ X ET (createdAt < X OU (createdAt = X ET id < Y))`.** Le `OU` reste
>   à l'intérieur, parce que l'extension de tenancy ajoute son scope en `ET`. La borne `≤`, redondante,
>   donne une plage à l'index `(conversationId, createdAt)`.
> - **La requête est stricte**, `as` toléré : un client qui enverrait `?cursor=` au lieu de
>   `?before=` reçoit un 400, plutôt que la première page en boucle.
> - **La page la plus récente se relit depuis sa frontière** (`?since=<son nextCursor>`), en
>   entier : ce qu'elle tenait, ce qui est arrivé depuis, URLs re-signées et messages effacés
>   compris (un compte supprimé quitte les fils de groupe). Elle garde son curseur, et les pages
>   d'avant se relisent aux mêmes : le fil chargé ne glisse pas sous le lecteur remonté. Relue
>   comme « les 50 plus récents », chaque arrivée poussait un message vers la page d'avant ; la
>   première version recousait donc côté client les messages poussés, depuis le cache. Ils
>   gardaient leurs URLs de la première lecture, mortes au bout de 5 min et pourtant inscrites
>   comme fraîches dans la table des URLs, et un message effacé y restait, devant de plus anciens
>   que lui (revue de la PR #928). `since` est borné à 100 lignes : au-delà (un fil rouvert après
>   une longue absence, ou plus de 50 messages arrivés fil ouvert), l'API rend la page la plus récente à
>   son curseur à elle, et les pages d'avant se recousent à partir de lui — le lecteur remonté se
>   décale alors une fois. `before` et `since` s'excluent (400).
> - **Une page d'avant ne se relit que périmée** (`createThreadPages`) : un de ses médias porte
>   une URL que la table ne garantit plus, ou elle a plus de 5 min, ou on ignore quand elle a été
>   lue (cache restauré au démarrage). Sinon, la relecture la rend telle quelle, sans requête. Relues
>   toutes les 10 s, elles comptaient sur le plafond global de 300 requêtes par minute et par acteur
>   (#782), tous appareils confondus : un coach remonté d'une quarantaine de pages passait en 429
>   sur toutes ses routes. Le coût d'un fil ouvert est désormais d'une requête toutes les 10 s, plus
>   une par page remontée toutes les 4 à 5 min.
> - **Les options de la requête infinie du fil vivent dans `@cmv/shared`** (`createThreadPages`),
>   une par app comme la table des URLs : le web et le mobile n'y ajoutent que leur sondage et leur
>   partage structurel.
> - **Le web garde le lecteur en place** quand la page s'ajoute au-dessus (`holdPosition` de
>   `useStickToBottom`). La cible part du dernier `scrollTop` connu, celui du dernier défilement :
>   `dernier haut + (nouvelle hauteur − ancienne)`. Elle est juste que le navigateur ait déjà ancré
>   de lui-même (`overflow-anchor`) ou non (Safari), et garde ce que le lecteur a défilé pendant le
>   chargement. Le mobile n'en a pas besoin : sa liste inversée est ancrée au bas, et la page
>   s'ajoute à l'autre bout.
> - **Un échec arrête la remontée** : elle ne repart que sur « Réessayer » (`shouldLoadOlderPage`,
>   la même règle aux deux clients). La relancer à chaque arrivée en tête martèlerait une API en
>   panne. L'échec est **retenu par le client** jusqu'à « Réessayer », et non lu de la requête : un
>   sondage réussi efface l'erreur de TanStack sans recharger la page d'avant, et le lecteur resté
>   en tête n'aurait plus ni bouton, ni page.
> - **Une page d'avant interrompue se redemande** une fois la relecture finie
>   (`olderPageOutcome`). Une relecture lancée pendant qu'elle était en route (l'invalidation d'un
>   envoi, `refetchQueries` d'un média à re-signer, le retour au premier plan du mobile) l'annule
>   sans erreur. Le repère web, resté à l'écran, ne se manifestait plus, et la liste mobile ne
>   rappelle `onEndReached` qu'à une autre longueur de contenu : la remontée restait figée, sans
>   indicateur ni « Réessayer ». Le web observe le repère à neuf, et ne redemande que s'il est
>   encore à l'écran ; le mobile redemande.
> - **Une erreur ne jette pas le fil chargé** : au web comme au mobile (#439), l'écran d'erreur ne
>   remplace le fil que si rien n'est en cache. Une page d'avant ratée passe la requête en
>   erreur, ses messages toujours là.
> - **Le repère web déclenche au rappel de l'`IntersectionObserver`**, et non sur un état relu
>   par un effet : l'effet tourne dans le rendu même où la page arrivée repousse le repère, et y
>   lisait la visibilité d'avant, soit une page de trop à chaque remontée. Le repère est observé à
>   neuf à chaque nouvelle tête du fil : resté à l'écran après une page courte, il en redemande
>   une.
> - **Le curseur est générique** (`cursorPageQuerySchema` et `cursorPageSchema` dans
>   `@cmv/shared`, `cursor-page.util` dans l'API) : #78 (les notifications) le reprend tel quel.
> - **La clé de cache du fil change** (`thread-pages`) : un cache persisté sous l'ancienne forme,
>   un tableau, n'est jamais relu comme des pages.
