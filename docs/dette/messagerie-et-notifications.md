# Dette technique — Messagerie et notifications

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P5 — Messagerie & débrief vocal

| # | Dette | Statut | Suivi |
|---|---|---|---|
| P5-1 | **Pas de pagination sur les messages** : `GET /conversations/:id/messages` renvoie tout le fil. | 🟢 | [#77](https://github.com/Cimavia/cimavia/issues/77) |
| P5-2 | **Audio non transcodé, durée déclarative** (comme la vidéo, P4-1/P4-2). | 🟢 | [#80](https://github.com/Cimavia/cimavia/issues/80) · [#81](https://github.com/Cimavia/cimavia/issues/81) |
| P5-3 | **Interop note vocale web → iOS** : sur Chrome/Firefox, `MediaRecorder` produit du webm/opus, qu'iOS peut ne pas lire. | 🟡 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| ~~P2-1~~ / ~~P3-2~~ | **Nouveau cas** : supprimer une relation `CoachAthlete` cascade `Conversation`/`Message` en base mais **laisse les objets S3 orphelins en masse**. | 🟡 | [#74](https://github.com/Cimavia/cimavia/issues/74) · [#72](https://github.com/Cimavia/cimavia/issues/72) |

*Résolues, à l'[archive](archive.md) : P5-4, P5-5.*

> **Tranché en #190** (répondre à un débrief) : la réponse est un **`Message` rattaché**
> (`Message.sessionFeedbackId`), pas une entité nouvelle — le champ était au schéma et validé
> côté serveur depuis P5, sans aucune UI. Elle hérite ainsi des médias, des non-lus, du push, du
> throttle et de la pagination à venir. Écartés : une entité `FeedbackReply` (il faudrait tout
> reconstruire, et `sessionFeedbackId` deviendrait du code mort) et un `coachComment` unique sur
> `SessionFeedback` (ni aller-retour, ni média). Quatre conséquences que le code ne justifie pas
> seul : **« répondu » est dérivé** (premier message dont `senderId === coachId`), jamais stocké —
> même dispositif que `resolveInvoiceState` et `isReminderDue` ; **`coachReadAt` ne bouge pas**,
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
| N-1 | **Pas de pagination** : `GET /me/notifications` renvoie les 50 plus récentes, sans moyen de remonter au-delà. | 🟢 | [#78](https://github.com/Cimavia/cimavia/issues/78) |
| N-2 | **Aucune rétention ni purge** : la table `notification` grossit indéfiniment. | 🟢 | [#76](https://github.com/Cimavia/cimavia/issues/76) |
| N-3 | **Une entrée par rafale de messages**, pas une par message : la trace garde le throttle « first-unread » que le push a quitté en #537. | 🟢 | — *(comportement voulu, déclencheur : aucun)* |
| N-4 | **`entityId` sans clé étrangère** : la cible est polymorphe, rien ne garantit qu'elle existe encore. | 🟡 | [#74](https://github.com/Cimavia/cimavia/issues/74) |
| N-5 | **Réglage limité au canal e-mail** : l'épic [#61](https://github.com/Cimavia/cimavia/issues/61) a livré l'opt-in par type et ses deux écrans, **pour l'e-mail seul**. Le push et le centre restent non réglables — on ne peut ni couper un type en push, ni se taire complètement. Un utilisateur qui coupe tout par e-mail continue donc de recevoir les push. | 🟡 | — *(déclencheur : un retour beta demandant à couper le push ; l'ouvrir demanderait un second axe dans le modèle, `channel` en plus de `type`)* |
| N-6 | **Aucun groupement des ajustements de cycle** : ajouter trois séances à un cycle diffusé produit trois notifications. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-7 | **Les receipts Expo ne sont pas relus** : un échec de livraison **tardif** n'est jamais remonté. | 🟢 | [#99](https://github.com/Cimavia/cimavia/issues/99) |
| N-8 | **L'e-mail suit le rythme de la trace** (N-3) : une rafale de messages produit UN e-mail, qui annonce « un message » là où il y en a cinq. La relance attendue de #91 n'a plus d'objet depuis #537 : le push prévient de chaque message. | 🟢 | [#98](https://github.com/Cimavia/cimavia/issues/98) |
| N-9 | **Aucun lien vers l'entité dans l'e-mail de notification** : seul le pied « gérer mes notifications » est cliquable. Ouvrir le cycle ou la conversation demande de retrouver l'application à la main. | 🟢 | — *(déclencheur : un retour beta disant que l'e-mail ne sert à rien sans lien — voir « Tranché en #65 »)* |

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

> **Appris en test (session de recette #39)** : une notification n'est pas un lien, c'est le
> **signal que l'état serveur a changé**. L'ouvrir invalide donc tout le cache client avant de
> naviguer — sans quoi cliquer « nouveau débrief » depuis l'écran des débriefs ne fait
> littéralement rien (navigation no-op + `staleTime`), et arriver par un push mobile affiche la
> version d'avant l'événement annoncé (cache persisté, frais 5 min). L'invalidation est **globale
> et non ciblée** : une table `entityType → clés de requête` couplerait la feature notification à
> toutes les autres et se périmerait en silence au premier changement de route.

---

## Post-MVP — Rappels ([#38](https://github.com/Cimavia/cimavia/issues/38))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| R-2 | **Pas de pagination** sur `GET /reminders` : deux segments bornés à 100 (à traiter / traités). | 🟢 | [#106](https://github.com/Cimavia/cimavia/issues/106) |
| R-4 | **`entityId` sans clé étrangère**, comme N-4. La purge couvre la suppression d'un cycle **et de sa facture** ; les autres chemins de disparition (suppression d'une relation coach↔athlète) restent découverts. | 🟡 | [#108](https://github.com/Cimavia/cimavia/issues/108) · [#74](https://github.com/Cimavia/cimavia/issues/74) |
| R-5 | **Aucune rétention** des rappels `DONE`/`DISMISSED` : la table grossit indéfiniment (même famille que N-2). | 🟢 | [#107](https://github.com/Cimavia/cimavia/issues/107) |

*Résolues, à l'[archive](archive.md) : R-1, R-3.*

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
> millisecondes pour un tick horaire, et le rappel se ferme d'un clic. Côté clients, payer
> n'invalide encore que les caches facture : badge et tuile se mettent à jour au polling suivant
> ([#485](https://github.com/Cimavia/cimavia/issues/485)).

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
