# Dette technique — Comptes, capacités et tenancy

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## Post-MVP — Dashboard coach ([#110](https://github.com/Cimavia/cimavia/issues/110))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| D-1 | **Sept requêtes au chargement de `/`** (athlètes, planifs, débriefs, factures, conversations, résumé des rappels, non-lues) : la jointure du tableau est faite côté client, sans endpoint d'agrégat. Le **polling** de deux d'entre elles a été coupé sur cet écran (#113) — il ne reste que celui du badge, qui est sa raison d'être. Le tableau rend par ailleurs **toutes** ses lignes, `GET /athletes` n'étant pas borné : même déclencheur, même épic. | 🟢 | [#114](https://github.com/Cimavia/cimavia/issues/114) *(épic : [#139](https://github.com/Cimavia/cimavia/issues/139) agrégat · [#140](https://github.com/Cimavia/cimavia/issues/140) pagination)* |
| D-3 | **La fiche athlète n'a pas de garde serveur contre l'écrasement** : `PUT /athletes/:id/sheet` remplace `content` sans vérifier la version lue, et le produit n'a pas d'historique. Depuis #301, seuls les clients empêchent d'éditer une fiche non reçue ; deux onglets (ou le web et le mobile) ouverts sur la même fiche s'écrasent toujours sans que personne ne le voie. | 🟡 | [#440](https://github.com/Cimavia/cimavia/issues/440) |

*Résolues, à l'[archive](archive.md) : D-2.*

> **Tranché en #52** (aucune information lue deux fois) : c'est la contrainte qui a façonné l'écran,
> parce que sept tuiles offrent sept occasions de recompter la même chose. Trois conséquences.
> **(1)** « Factures en attente » **exclut désormais les factures en retard** : `OVERDUE` étant
> *dérivé* et non stocké, l'ancien filtre `status === PENDING` les comptait des deux côtés — et
> rangeait parmi les factures qui vont bien celles qu'il faut relancer. Les deux compteurs
> **partitionnent** l'impayé (`countPendingInvoices` + `countOverdueInvoices`). Corollaire visible :
> le chiffre de la tuile existante a baissé, ce n'est pas une régression.
> **(2)** « Rappels dus » compte les rappels **non traités**, pas les non lus — sinon dérouler la
> cloche viderait une tuile « à traiter » sans qu'aucun rappel n'ait été traité (`readAt` ≠ `status`,
> cf. #44). D'où `GET /reminders/summary`, distinct du compteur du badge.
> **(3)** « Notifications non lues » affiche **exactement** le nombre de la cloche, donc **recoupe
> volontairement** « Rappels dus », qu'il inclut. Redondance assumée : afficher un nombre voisin mais
> différent de celui montré à 300 px au-dessus serait plus déroutant que la redondance elle-même. La
> cloche est une union par construction ; la tuile en est le panneau indicateur, et son libellé y
> renvoie.

> **Écart de maquette, ~~consigné~~ RÉSOLU en #113** : `coach_dashboard_athletes.dc.html` décrivait
> **un seul écran** — strip de statistiques **au-dessus d'un tableau d'athlètes** — là où
> l'implémentation avait scindé en `/` (tuiles) et `/athletes` (grille de cartes). Le tableau est
> revenu sur `/`, et `/athletes` a été **supprimé** : son invitation et sa fiche athlète ont
> déménagé (en-tête et bouton de ligne), et la route survit en **redirection** vers `/` — un 404 sur
> un chemin qu'on a soi-même publié serait une régression gratuite.

> **Tranché en #113** (ce que le tableau montre, et ce qu'il ne montre pas) :
> **(1)** la colonne **« Dernière activité » de la maquette est supprimée**, pas reportée. Les
> colonnes « Débriefs » et « Messages » la remplacent en disant *quoi* attend une réponse et en y
> **menant** ; elle aurait de toute façon été partiellement fausse, une séance faite **sans** débrief
> n'apparaissant dans aucune liste que le coach charge.
> **(2)** pas de **sous-titre « spécialité »** sous le nom : `AthleteSheetDto` n'a qu'un `content`
> texte libre, il n'y a aucune donnée derrière.
> **(3)** pas de **badge de statut de relation** : `CoachAthleteStatus.PENDING` n'est jamais écrit
> (`@default(ACTIVE)`, et `InvitationService` pose `ACTIVE`), et les services filtrent sur `ACTIVE`.
> Une colonne de badges tous identiques n'informe personne. Les clés i18n correspondantes ont été
> purgées.
> **(4)** la pastille d'identité est en **fond neutre** : colorer par personne demande une palette
> *décorative* que `@cmv/tokens` n'a pas — ses familles sont des **états**, et les détourner ferait
> lire une alerte là où il n'y a qu'un nom (cf. arbitrage #37). La couleur et la photo arrivent avec
> l'épic [#117](https://github.com/Cimavia/cimavia/issues/117) ; `CmvAvatar` sait déjà rendre une
> image, aucun DTO ne la sert encore.
> **(5)** le **chevron de fin de ligne** attend sa destination : il reviendra avec une route
> `/athletes/$athleteId`. En attendant, c'est le bouton « Fiche » qui ouvre le panneau — un chevron
> qui n'ouvre qu'un tiroir mentirait sur ce qui suit.

> **Tranché en #123** (ce que la barre d'outils filtre, et ce qu'elle refuse de trier) :
> **(1)** le sélecteur **« Trier : activité récente » de la maquette n'est pas livré**, et pas par
> paresse : l'activité d'un athlète n'est mesurable par **aucune** donnée que cet écran charge. Les
> deux candidates ont été vérifiées — `ConversationDto.lastMessageAt` ne porte pas l'auteur du
> dernier message, donc un coach qui écrit dans le vide **remet à zéro** le compteur d'inactivité de
> l'athlète qu'il vient de relancer ; `CoachFeedbackSummaryDto.createdAt` est exact mais garde
> l'angle mort de #113, une séance faite **sans** débrief n'apparaissant nulle part. Trier là-dessus
> mettrait **en bas** de liste l'athlète qui s'entraîne sans débriefer — et un *ordre* faux ne se
> voit pas, là où une colonne manquante affiche au moins « — ». La donnée honnête (dernière séance
> `DONE`, dernier débrief, dernier message **de l'athlète**) se calcule côté serveur ; aucune issue
> ne la porte, c'est délibéré.
> **(2)** l'ordre est donc **alphabétique**, ce qui est le pendant d'une recherche par nom. L'ordre
> d'arrivée servi par l'API (`joinedAt desc`) n'était perceptible par personne.
> **(3)** **« À relancer » a été redéfini en « Cycle terminé »** : le libellé de la maquette n'avait
> aucune définition métier, celui-ci en a une, entièrement calculable — *son cycle est terminé et
> rien ne lui succède*. La seconde moitié est **garantie par `selectCurrentPlan`**, qui élit un cycle
> à venir avant un cycle terminé : un athlète déjà replanifié ne peut pas y tomber. Le libellé dit le
> fait, comme « Sans plan » à côté de lui ; c'est l'état vide qui porte l'action.
> **(4)** les deux filtres sont **disjoints par construction** (une ligne a un cycle courant ou n'en
> a pas) et ne recomptent aucune tuile — celles-ci comptent des *cycles*, pas des athlètes qui en
> manquent. C'est la contrainte de #52 appliquée au filtrage.
> **(5)** ils **disparaissent** quand `GET /plans` n'a pas répondu, et un `?filter=` hérité est
> ignoré : `AthleteRow.plan` vaut alors `null` pour tout le monde, et « Sans plan » annoncerait
> **tous** les athlètes. `null` n'est pas zéro, y compris dans un filtre.
> **(6)** l'état de la barre vit dans **l'URL** (`?q=`, `?filter=`), en `replace` : un filtre qui ne
> survit pas à F5 n'est pas le même produit, mais ce n'est pas une étape de navigation — le bouton
> Retour doit quitter l'écran, pas rembobiner la frappe.

> **Deux écarts volontaires** à la même maquette : les tuiles sont réparties en **deux rangées**
> nommées (« À traiter » / « Vue d'ensemble ») là où la maquette n'en prévoyait qu'une de quatre —
> à sept, une strip unique redevient une grille indifférenciée où rien ne ressort ; et les tuiles
> « à traiter » sont **cliquables**, alors que la strip de la maquette est décorative — une tuile qui
> annonce du travail sans y mener est un cul-de-sac.

> **Tranché en #301** (la fiche s'édite une fois REÇUE, pas « tant qu'il n'y a pas d'erreur ») :
> le panneau web rendait un échec de lecture comme une fiche vierge, et `PUT` remplace — le coach
> effaçait des mois de notes en croyant commencer la fiche. Deux décisions :
> - **Le critère est `data !== undefined`, pas `isError`**, contrairement au mobile en apparence.
>   Sur le web, `refetchOnWindowFocus` relance la lecture au retour d'onglet ; si elle échoue,
>   `isError` passe à vrai alors que la fiche est en cache, et un rendu branché dessus masquerait le
>   formulaire avec le brouillon. Le mobile n'a pas ce piège : son mode édition ne dépend pas de
>   `isError`. Un test (`AthleteSheetPanel.test.tsx`) tient ce cas.
> - **Pas de garde serveur dans cette PR** — celle qu'envisageait #301, refuser un `PUT` qui vide
>   une fiche non vide, ne couvrait même pas son scénario : le coach y écrit deux lignes, le `PUT`
>   n'est pas vide. La garde utile porte sur la version lue (concurrence optimiste), touche les
>   quatre paquets, et part en [#440](https://github.com/Cimavia/cimavia/issues/440) → **D-3**.
> - **La fiche « (moi) » fonctionne, et la fiche devient unique par COUPLE.** Rendre l'échec
>   visible a révélé que la ligne d'auto-coaching (#14) répondait 404 depuis toujours :
>   `assertOwnedAthlete` cherchait une ligne `CoachAthlete` que le CHECK `coach_athlete_not_self`
>   interdit. Même garde que les cycles désormais — soi-même passe, capacité athlète exigée. Mais
>   l'unicité sur `athleteId` datait d'un athlète à un seul coach : un compte qui se coache ET a un
>   coach porte deux fiches, et le second `PUT` tombait en 500 sur la contrainte. Migration
>   `20260926120000_fiche_athlete_par_coach` : `@@unique([coachId, athleteId])`, sans risque sur
>   l'existant. Le tenancy scopant sur `coachId`, aucune des deux fiches ne voit l'autre.

---

## Post-MVP — Capacités coach/athlète ([#7](https://github.com/Cimavia/cimavia/issues/7))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| C-1 | **`role` et les capacités coexistent sans contrainte qui les lie.** `User` porte `isCoach`/`isAthlete` (le droit) **et** `role` (le persona d'affichage). Les deux chemins d'écriture les tiennent alignés — le `databaseHook` à la création, `CapabilityService` à la modification ; `/update-user` est fermé depuis #310 — mais rien en base ne l'impose. C'est le comportement **voulu**, pas un bug : un persona n'est pas un droit, et le second peut légitimement survivre au premier. | 🟢 | — *(déclencheur : quelqu'un qui prendrait la divergence pour une incohérence et « réparerait » en resynchronisant)* |

*Résolues, à l'[archive](archive.md) : C-2, C-3.*

> **Appris en #10** (l'ordre des gardes globales n'est pas celui qu'on croit) : deux `APP_GUARD`
> s'exécutent dans l'ordre où leurs **providers** sont enregistrés, et ceux du module **racine**
> passent AVANT ceux des modules importés. `CapabilitiesGuard` déclarée dans `AppModule` tournait
> donc avant l'AuthGuard de `@thallesp/nestjs-better-auth` — c'est-à-dire avant que `request.user`
> existe. Rien ne l'a dit tant qu'aucune route ne déclarait de capacité ; les 230 e2e sont tombés
> **en bloc** à la première déclaration. D'où `CapabilityModule`, importé après `BetterAuthModule`,
> dont c'est toute la raison d'être. Ce qui a rendu la panne lisible plutôt que silencieuse : la
> garde **lève** quand l'utilisateur manque alors qu'une capacité est exigée. Un `return false`
> aurait donné des 403 diffus ; un `return true`, une garde inerte que personne n'aurait remarquée.
> Corollaire : toute garde globale ajoutée se pose dans un module, jamais dans `AppModule`.

> **Appris en #10** (la panne de #44/#51, une seconde fois) : le centre de notifications lit les
> `Reminder`, seul modèle métier sans scope athlète. Sa route ne déclarait aucune capacité — le
> scope se dérivait du rôle de l'acteur, ce qui la masquait. Dès que `tenantField` a cessé de lire
> `actor.role`, l'écran entier est passé en **500**. C'est mot pour mot ce que l'encadré plus haut
> annonçait : « toute future entité mono-rôle devra porter les deux gardes ». La règle vaut aussi
> à l'envers — **tout chemin partagé qui touche une entité mono-capacité doit déclarer laquelle**,
> même quand le reste de ce qu'il lit n'en a pas besoin.

> **Tranché en #10** (la route porte la capacité qu'elle exerce) : `@RequireCapability("coach")`
> remplace `@Roles([Role.COACH])` et sert **deux** mécanismes — la garde en fait une exigence,
> l'interceptor en fait le champ de scope. Une déclaration, deux lecteurs, via un helper partagé :
> exigence et scope ne peuvent pas diverger. Ce qui l'a rendu nécessaire, ce sont les trois routes
> servant les deux capacités (`/invoices`, `/conversations`, messages), dont le `@Roles([COACH,
> ATHLETE])` n'exigeait **rien de réel** — tout compte authentifié le satisfaisait. Ce n'était pas
> une exigence, c'était un scope déguisé.
>
> Le cas double s'y résout en trois temps, et le troisième est le seul qui compte : `?as=coach`
> honoré si le compte porte la capacité (403 sinon), capacité unique du compte si elle l'est —
> ce n'est pas un défaut, c'est la seule réponse possible, et c'est ce qui fait qu'aucun client
> n'a eu à changer — et **400** quand le compte cumule sans préciser. Répondre « les émises » par
> convention aurait laissé croire qu'on voit tout : le fallback exact qu'interdit la règle n°5.
>
> Conséquence tenue : le scope tenant reste **une colonne unique**, jamais un `OR` sur les deux. La
> règle dure n°1 ne change pas de forme. Une liste fusionnée l'aurait exigé, en contredisant au
> passage les sections nommées de #129.
>
> *Renversé en [#593](https://github.com/Cimavia/cimavia/issues/593)* pour sa première moitié : la
> colonne unique cède à un **filtre composé au sein d'une capacité** — propriétaire, ou droit
> d'accès qui vise l'acteur ou l'une de ses entreprises, ou participation à une conversation (voir
> « Tranché en #593 »). La seconde moitié tient : **jamais un `OR` entre les deux capacités**, et un
> compte qui cumule ne voit toujours qu'un espace à la fois.

> **Tranché en #10** (`role` disparaît du `TenantContext`) : une fois les cinq branchements
> convertis, plus rien ne le lisait côté API. Le retirer transforme la règle en contrainte — un
> service qui voudrait dériver un droit du persona ne compile plus. Même geste que `CapabilitySource`
> côté client en #9 : la règle exécutable vaut mieux que la règle déclarée.

> **Corrigé dans #10** (une route sans titre n'a pas à en réclamer un) : `/me/notifications` avait
> reçu `@RequireCapability("either")` pour une raison purement technique — `tenantField` refusait la
> table `Reminder` sans capacité exercée. C'était un effet de bord pris pour une décision : un
> centre de notifications montre ce qui est **adressé** au compte, sans notion de titre, et
> l'exiger aurait obligé un compte à double capacité à choisir à quel titre il consulte ses
> notifications — pour n'en voir que la moitié. La route ne déclare donc plus rien ; c'est
> `runAsCapability` qui précise le titre **au plus près** de la lecture des rappels. Le repère pour
> la suite : quand une route touche une ressource mono-capacité sans être elle-même d'un seul
> titre, c'est la LECTURE qu'on qualifie, jamais la route. Deux e2e figent le contraste — 400 sur
> les factures, 200 sur les notifications, pour le même compte.
>
> *Précisé en [#622](https://github.com/Cimavia/cimavia/issues/622)* : « ne déclare plus rien »
> est devenu `@ExercisesNoCapability()`. Le comportement est le même, mais l'absence de
> déclaration ne veut plus rien dire.

> **Tranché en [#622](https://github.com/Cimavia/cimavia/issues/622)** (chaque route déclare son
> scope) : onze routes reposaient sur l'absence de décorateur, et rien ne distinguait ce choix
> d'un oubli. L'issue parlait d'un décorateur « même scope pour les deux capacités » ; c'est trop
> étroit — seules huit routes sont dans ce cas (notifications, tokens push, préférences d'envoi).
> `me/counterparts` lit les deux espaces à la fois, `me/capabilities` agit sur le compte lui-même,
> `/version` ne touche aucune donnée tenant. Ce que les onze partagent, c'est d'être
> **authentifiées sans titre** (`exercised: null`, tout compte passe, Entreprise comprise) : d'où
> `@ExercisesNoCapability()`.
>
> Il pose la **même clé** de métadonnée que `@RequireCapability` (valeur `"none"`) : sur une
> méthode, il remplace la capacité du contrôleur, et garde comme interceptor lisent toujours une
> seule déclaration. `routeDeclarationOf` est le seul lecteur de la clé ; `requiredCapabilityOf`
> traduit `"none"` en `null`.
>
> Le test est un **e2e** et non un unitaire, alors qu'il ne fait que compiler `AppModule` :
> importer `AppModule` valide l'environnement dès l'évaluation du décorateur, et seule la config
> e2e charge `.env.test`. Il énumère les contrôleurs **montés** (`DiscoveryService`), pas les
> fichiers `*.controller.ts`, et fige aussi la surface joignable sans session (`@AllowAnonymous`,
> `@OptionalAuth`, dont il lit les clés sur les décorateurs mêmes, la librairie ne les exportant
> pas). La garde, elle, ne refuse pas une route non déclarée à l'exécution :
> le test couvre toutes les routes montées, un refus au runtime ferait doublon.
>
> L'issue demandait que la déclaration accueille la classe d'opération (#603) et le droit accordé
> (#605). Ni l'une ni l'autre ne lit la route : #603 décide la classe **par modèle**, dans
> l'extension, et #605 ajoute le droit **dans le filtre**, sous la même capacité. Rien à y
> préparer, donc — sinon que tout passe par `routeDeclarationOf` : si une route doit un jour en
> dire plus, c'est le type de sa valeur qui change, pas le test.

> **Tranché en #129** (un basculeur d'espace, et non des sections) : l'épique #7 prescrivait
> « pas de switch exclusif », et une première version a donc livré une nav SECTIONNÉE — douze
> entrées, deux contextes empilés. Une maquette a fait changer d'avis : le basculeur en montre
> sept et un seul. Ce qui rend le mode exclusif acceptable, c'est la **pastille sur l'espace
> inactif** — l'objection était « on rate ce qui se passe de l'autre côté », elle y répond. Le
> décompte ventilé qu'elle suppose n'existe pas (une notification n'a aucune capacité
> destinataire) : il part en [#176](https://github.com/Cimavia/cimavia/issues/176), et l'intervalle
> est le risque assumé. L'énoncé de #7 a été corrigé le même jour — une épique qui prescrit
> l'inverse de ce qui est livré est pire qu'une épique muette.
>
> **L'espace courant se DÉDUIT de l'URL** côté web, sans état applicatif : le chemin dit déjà à
> quel univers on est (`/library` est coach), et `?as=` tranche pour les deux routes servies aux
> deux — ce qui règle au passage leur double surlignage. Un état séparé aurait pu diverger de la
> page affichée, et montrer le menu coach au-dessus d'un écran d'athlète. Mobile ne peut pas s'en
> remettre à l'URL : il garde un **contexte**, et le sélecteur se pose à droite du titre de l'écran
> — sous lui, il aurait l'air d'un filtre de la liste.
>
> **Ce que l'issue annonçait de travers** : « dix onglets ne tiennent pas dans une barre ». La
> table `TABS` en compte **sept**, dont quatre servis aux deux capacités — le manque n'était pas le
> nombre mais l'absence de bascule. La densité des sept onglets reste un sujet de design ouvert.
>
> **Deux classes de tokens inexistantes** ont été introduites puis corrigées : `text-cmv-text-low`
> (le token est `lo`) et `text-cmv-accent-on` sur un fond `accent` plein (c'est `text-cmv-text-hi`,
> `accent-on` servant sur `accent-soft`). Tailwind ne génère simplement pas une classe inconnue :
> ni `tsc`, ni `biome`, ni le build ne le voient, et le texte sort sans couleur. Un `grep` sur un
> token voisin est le seul contrôle qui existe aujourd'hui.
>
> **Le piège trouvé en chemin** : les écrans partagés branchaient leur titre, leurs listes vides et
> leurs boutons sur `useCapabilities().isCoach` — la capacité **possédée**. Un compte cumulant
> lisant ses factures « en tant qu'athlète » y aurait vu l'en-tête du coach et le bouton « marquer
> payée ». D'où `useActingCapability()`, qui rend le titre EXERCÉ et vaut pour la présentation ;
> `capabilitiesOf` reste pour les gardes. La règle : dès qu'un écran sert les deux capacités, ce
> qu'il MONTRE suit le titre, pas ce que le compte possède.

> **Appris en #14** (deux classes Tailwind concurrentes ne se départagent pas par la chaîne) : le
> fond d'alerte des tuiles du tableau de bord avait disparu côté web. `CmvCard` posait
> `bg-cmv-surface`, `DashboardTile` ajoutait `bg-cmv-error-soft` via `className`, et `cn` ne résout
> pas les conflits — choix assumé, écrit dans `cn.util.ts`. Les deux classes se retrouvaient donc
> sur l'élément, et c'est l'ordre de **génération dans la feuille CSS** qui tranchait, pas celui de
> la chaîne : hors de notre contrôle, et invisible de toute porte. D'où `surfaceClassName`, une
> prop qui REMPLACE le fond par défaut au lieu de s'y ajouter — le survol par défaut la respecte
> aussi, sinon il écrasait la couleur au passage de la souris. Règle générale : tant que `cn` reste
> sans `tailwind-merge`, une surcharge de couleur passe par une prop dédiée, jamais par
> `className`. Mobile n'était pas touché — NativeWind ne compose pas les classes de la même façon.

> **Tranché en #14** (« (moi) » se déduit de la SESSION, pas d'un drapeau porté par chaque DTO) :
> le compte apparaît dans ses propres listes d'athlètes, où son nom ne se distingue de rien. Un
> premier essai avait ajouté `isSelf` à `AthleteRow` — il n'aurait couvert que le tableau de suivi.
> Les onze surfaces concernées (sélecteur et titre du builder, cartes de cycles, tableau, liste et
> détail des débriefs, fiche athlète, dashboard mobile…) n'ont en commun qu'un `athleteId` :
> propager un marqueur aurait demandé de toucher quatre schémas, et d'y penser au cinquième. D'où
> `useAthleteLabel`, qui compare à l'id de session. `isSelf` reste sur `CoachAthleteDto` seul, où
> il décrit une propriété de la DONNÉE — cette relation-là n'existe pas en base.
>
> Deux exclusions volontaires : les **initiales** d'avatar, calculées sur le nom brut (« Dual Curl
> (moi) » donnerait « DC »… ou pire), et la **messagerie**, fermée en auto-coaching — aucun fil
> avec soi-même ne peut exister.

> **Tranché en #14** (l'auto-coach est une entrée SYNTHÉTIQUE de sa propre liste) : un coach qui
> se coache n'a pas de ligne `CoachAthlete`, et ne peut pas en avoir — le CHECK
> `coach_athlete_not_self` l'interdit depuis #11. `GET /athletes` fabrique donc son entrée, marquée
> `isSelf`, en tête. Le prix est une ligne sans réalité en base ; le bénéfice est que **le builder
> web et le tableau de bord ne changent pas**, eux qui lisent déjà cette route. L'alternative
> — un `athleteId` absent valant « pour moi » — a été écartée : elle entre en collision frontale
> avec #144 (`athleteId` nullable = cycle **sans athlète affecté**), qui donne à cette absence un
> sens opposé.
>
> **#17 absorbée** : elle et #14 traitaient le même verrou par les deux bouts. `publish` exige une
> facturation saisie (gating P6) et notifie l'athlète deux fois — en solo, le coach devrait se
> facturer lui-même pour diffuser son propre cycle, et recevrait deux notifications de lui-même.
> Impossible donc de livrer #14 « en gardant la state machine `DRAFT → PUBLISHED` », ce qu'elle
> demandait, sans lever ces trois choses. Ce qui NE change pas : la state machine elle-même, qui
> donne au cycle ses `ScheduledSession` lisibles et débriefables — un cycle solo se vit comme les
> autres.
>
> **Ce que l'issue annonçait de travers** : elle demandait de modifier `ExerciseController` et
> `SessionController`. `Exercise` et `Session` sont scopés sur `coachId` **seul** — un compte
> `isCoach` compose déjà sa bibliothèque, et depuis toujours. Le verrou tenait en une méthode,
> `PlanService.assertAthleteOwned`. La messagerie, elle, était **déjà** fermée en solo
> (`resolvePair` exige une relation des deux côtés) : un e2e fige ce comportement plutôt que de le
> supposer acquis.

> **Tranché en #11** (le premier `CHECK` du projet) : « on ne peut pas être son propre coach » est
> un invariant absolu, pas une règle de service susceptible d'avoir une exception — il vit donc
> dans la table (`coach_athlete_not_self`), conformément à `architecture-choice.md`. Le refus 409
> du service reste, pour le message ; le CHECK est ce qui SURVIT à un second chemin de création qui
> oublierait la garde. Mesuré plutôt que supposé : la garde retirée, l'écriture est bien refusée,
> mais en **500** au lieu de 409 — le filet tient, il ne parle simplement pas français. C'est le
> bon partage. Attention pour la suite : Prisma ne modélise pas les CHECK, ils ne figurent donc pas
> dans `schema.prisma` et ne se lisent QUE dans les migrations.

> **Appris en #11** (la chaîne de coachs est linéaire, et peut déjà boucler) : `athleteId` étant
> `@unique`, chaque compte a au plus un coach — la structure est une **forêt**, et « remonter la
> chaîne » un parcours sans branchement, bien plus simple que ce que l'issue laissait attendre.
> Mais une remontée naïve ne termine pas si la base contient DÉJÀ un cycle, et pend jusqu'au
> timeout. D'où l'ensemble de visités, qui sépare deux choses que rien ne distinguerait autrement :
> l'invité est dans la chaîne (**409**, refus métier) et on repasse sur un nœud tiers (**erreur** —
> données incohérentes, à voir tout de suite plutôt que déguisées en refus).
>
> *Renversé en [#599](https://github.com/Cimavia/cimavia/issues/599)* : l'unicité porte désormais sur le couple, un compte a 0..N coachs, et
> la forêt devient un graphe. Repasser sur un compte déjà vu ne prouve plus rien — A suivi par B et
> C, tous deux suivis par D, atteint D deux fois sans boucle. L'ensemble de visités aurait rendu une
> 500 à cette invitation valide. La boucle se cherche donc APRÈS le chargement, par
> `hasCoachCycle` (`coach-graph.ts`), qui distingue un compte « en cours » d'un compte « terminé ».
> Le partage tient : invité au-dessus de l'inviteur → **409** ; boucle déjà en base → **erreur**.

> **Tranché en #9** (les capacités sont des colonnes Prisma **ET** des `additionalFields`) :
> l'épique annonçait « colonnes Prisma directes, **hors** `additionalFields` Better Auth — qui ne
> gère que des scalaires ». La prémisse est juste, la conclusion non : `FieldType` vaut `"string" |
> "number" | "boolean" | "date" | "json" | …`, et un booléen *est* un scalaire. Surtout, la
> déclaration n'est pas un choix — Better Auth ne renvoie dans `session.user` que les champs
> **déclarés**. Des colonnes seules ne seraient jamais remontées jusqu'à `useSession()` :
> `capabilitiesOf` aurait rendu « aucune capacité » à tout le monde, donc sidebar web vide, onglets
> mobile vides et redirections d'atterrissage cassées — sans qu'aucune porte ne le voie, puisque ni
> `tsc`, ni `biome`, ni `vite build` ne lisent la forme d'une session. C'est le mode de panne déjà
> consigné plus haut (« Appris en #20 »), rencontré une seconde fois : **le câblage d'auth n'a pas
> plus de porte que le câblage de nav**. Corollaire : tout champ de session ajouté se déclare aux
> trois endroits — `auth.config.ts` et les deux `inferAdditionalFields` — dans le même commit.

> **Tranché en #9** (`role` survit, comme persona seul) : le supprimer aurait été plus propre sur le
> papier, mais il répond à une question que les capacités ne savent pas poser — sur quel univers
> atterrit un compte qui en cumule deux. Il reste donc, dépouillé : `CapabilitySource` ne le
> contient **pas**, ce qui rend la règle exécutable plutôt que déclarative — un écran qui voudrait
> en dériver un droit ne compile pas. Un test le fige (`ignore role, qui ne fonde plus aucun droit`).

> **Tranché en #9** (le sens de dérivation s'inverse en #12) : les capacités sont déclarées
> `input: false` et **dérivées** du `role` envoyé au signup, par le `databaseHook` qui validait déjà
> ce rôle. Sans ce hook, un compte créé après #9 naîtrait aux `@default(false)` du schéma — sans
> aucune capacité — là où la migration vient de servir correctement les comptes existants : deux
> chemins de création, deux résultats. #12 inverse le sens (les cases à cocher deviennent l'entrée,
> `role` la déduction) ; d'ici là, aucun compte ne peut cumuler, et c'est ce qui rend #9 sans effet
> observable.

> **Tranché en [#310](https://github.com/Cimavia/cimavia/issues/310)** (`input: true` ouvre aussi
> l'update, un hook le referme) : Better Auth applique la même déclaration à l'inscription et à
> `POST /api/auth/update-user`. Les cases à cocher de #12 exigeant `input: true`, n'importe quel
> compte pouvait réécrire ses capacités par cette route — sans `assertRemovable` (un coach quittait
> ses athlètes actifs), sans la règle « au moins une », sans recalcul de `role`. Ce troisième chemin
> d'écriture, qui échappait à C-1, est fermé par `databaseHooks.user.update.before`, qui refuse
> `isCoach`, `isAthlete` et `role` en **400 `FIELD_NOT_ALLOWED`** — le code que Better Auth rend
> déjà pour un champ `input: false`, pas un 403 : le compte a le droit de changer ses capacités,
> seulement pas là. Le hook **ne voit pas** `CapabilityService`, et ce n'est pas un trou : le
> service écrit par Prisma, hors de l'adapter Better Auth. Le « corriger » en y faisant passer
> `PATCH /me/capabilities` le ferait refuser par son propre verrou.

---

## Post-MVP — Invitations qui attendent, refus et e-mail ([#146](https://github.com/Cimavia/cimavia/issues/146) · [#147](https://github.com/Cimavia/cimavia/issues/147))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| I-1 | **L'e-mail d'invitation part en français**, quelle que soit la langue du destinataire. Il n'y a pas de `User.locale` à lire pour une adresse SANS compte, et `mailStringsFor(null)` replie sur le français. Seule une invitation portant elle-même une langue fermerait l'écart. | 🟢 | — *(déclencheur : un coach qui invite un athlète anglophone — l'anglais est déjà écrit au catalogue, il manque seulement de quoi le choisir)* |
| I-2 | **Les deux mailers nomment une route WEB en clair** — `/account` (`NotificationMailer`) et `/register` (`InvitationMailer`). Aucun test ne peut les garder : l'API ne connaît pas le routeur du client. Renommer `account.tsx` ou `register.tsx` casse le lien **en silence**. Le nom du fichier est cité dans un commentaire à côté de chaque URL — c'est la seule parade, un `grep` le trouve. | 🟢 | — *(déclencheur : le jour où l'on renomme une route web ; rien à préparer avant)* |
| I-4 | **Rien ne rattrape un `.env` local en retard sur `.env.example`** (transverse, découvert ici). Les variables `SMTP_*` / `WEB_URL` ajoutées en [#61](https://github.com/Cimavia/cimavia/issues/61) manquaient un mois plus tard sur la machine de dev : l'e-mail d'invitation ne partait pas, et **rien ne le disait à l'écran** — seul un `WARN` dans les logs. Même famille que la migration non appliquée, qui a produit une notification muette le même jour. | 🟡 | — *(déclencheur : c'est arrivé deux fois en une session ; une vérification au démarrage — clés absentes, migrations en attente — reste à ouvrir)* |

*Résolues, à l'[archive](archive.md) : I-3.*

> **Tranché en #146** (le canal dépend de l'adresse, et la réponse HTTP ne le trahit jamais) :
> émettre une invitation nominative prend l'une de deux voies, et ce qu'elles ont en commun est le
> cœur de la décision — **le coach reçoit son invitation à l'identique dans les deux cas**. Sans
> cette symétrie, la route deviendrait un oracle d'existence de compte. *(Une troisième voie —
> l'invitation générique, qui ne prévenait personne — a disparu en #390.)*
>
> - **Adresse rattachée à un compte portant la capacité ATHLÈTE** : notification (centre + push).
>   Il a une application où lire, l'e-mail doublerait un message qu'il verra de toute façon.
> - **Tout le reste** — pas de compte, ou un compte sans capacité athlète : **e-mail**. C'est le cas
>   le plus courant, celui du nouvel athlète qu'on invite, et c'est exactement lui qui ne recevait
>   rien : le déclencheur écrit dans #146 n'était traité qu'à moitié tant que ce canal manquait.
>
> Les trois types `INVITATION_*` restent **hors de `EMAILABLE_NOTIFICATION_TYPES`** : ils ne visent
> que des comptes existants. L'e-mail d'invitation, lui, n'est pas soumis à l'opt-in de #65 — cet
> opt-in est un réglage de compte, et le destinataire n'en a pas.

> **Tranché en #146** (l'adresse se compare NORMALISÉE, et c'était un bug) : `Invitation.email` est
> tapé par le coach, `User.email` par l'athlète. La comparaison était brute, si bien qu'une adresse
> saisie `Lea@Exemple.fr` pour un compte `lea@exemple.fr` produisait une invitation **définitivement
> inutilisable** — refusée à l'acceptation, sans message qui dise pourquoi. Normalisée à l'écriture
> **et** à la comparaison : la première seule ne rattraperait pas les lignes déjà en base, la
> seconde seule laisserait la colonne porter deux formes du même destinataire.

> **Tranché en #146** (`DECLINED` est une valeur à part, et le seul état qui s'efface) : « le coach
> a annulé » (`REVOKED`) et « l'athlète a dit non » (`DECLINED`) ne se remplacent pas — les fondre
> ferait perdre au coach la seule information qui l'intéresse.
>
> `DELETE /invitations/:id` n'accepte donc que `DECLINED`, et le refus des trois autres états n'est
> pas une précaution : chacun perdrait quelque chose de différent. **`PENDING`** — la retirer est
> une révocation, c'est-à-dire une autre transition, qui a sa route depuis #524 ; la déguiser en
> suppression ferait disparaître une invitation encore acceptable sans le dire à qui l'a reçue.
> **`ACCEPTED`** — la ligne est la trace de la façon dont la relation s'est nouée
> (`acceptedByAthleteId`). **`REVOKED`** — ~~aucune route ne la produit~~ la ligne a déjà quitté la
> liste du coach, et elle reste en base pour que son destinataire lise « retirée » (*Tranché en
> #524* ci-dessous).
>
> ~~Le refus exige une **correspondance d'adresse en toutes circonstances**, là où l'acceptation ne
> la vérifie que sur une invitation nominative.~~ **Renversé en #390** : toute invitation est
> nominative, les deux gestes vérifient donc l'adresse — et y répondent 404 (encadré *Tranché en
> #390* ci-dessous).

> **Tranché en #524** (retirer est une transition, et elle se dit à qui l'a reçue — à lui seul) :
>
> - **`REVOKED` reste en base, mais quitte la liste du coach** (`GET /invitations` l'écarte). C'est
>   son propre geste, il n'a rien à y apprendre ; la ligne existe pour l'athlète, pas pour lui.
> - **Accepter ou refuser une invitation retirée rend 410 « Invitation retirée par le coach »**, et
>   non le 404 « déjà utilisée » des autres statuts : une carte ouverte avant le retrait reste
>   cliquable, et « introuvable » laisserait croire à une panne. Ce 410 vient **après** la
>   vérification d'adresse de #390 — un tiers, lui, lit toujours 404. Le message est en français
>   comme tous ceux de l'API (#319) : les clients l'affichent tel quel, toast sur le web, sur place
>   sur le mobile.
> - **La condition `PENDING` est dans l'écriture** (`updateMany … where status = PENDING`), pas
>   seulement dans la lecture qui la précède : une acceptation passée entre les deux n'est pas
>   réécrite en révocation, le coach lit 409. L'inverse — une acceptation qui écraserait une
>   révocation de la même milliseconde — n'est pas gardé : `accept` écrit sans condition depuis
>   #146, et la fenêtre ne justifie pas de le reprendre ici.
> - Une invitation **expirée** reste révocable : l'expiration est une date, pas un statut. Ce qui
>   est parti — e-mail, push, `INVITATION_RECEIVED` dans le centre — ne se rattrape pas (#102), et
>   aucune notification n'annonce le retrait. Cette transition ouvre la seconde option de #314
>   sans trancher entre les deux — c'est fait depuis, encadré suivant.

> **Tranché en #314** (cesser de coacher RETIRE les invitations en attente, plutôt que de les
> refuser à l'acceptation) : l'issue laissait le choix, et la révocation l'emporte pour deux raisons.
> L'athlète voit la carte disparaître de sa liste — un refus à l'acceptation la laissait affichée,
> puis en échec au clic —, et une carte déjà ouverte affiche le 410 de #524, qui dit vrai. Surtout,
> **réactiver la capacité ne ressuscite rien** : un refus à l'acceptation aurait rendu acceptables,
> sans prévenir, des invitations vieilles de plusieurs jours ; le coach qui revient réinvite.
>
> - La révocation et l'écriture de `isCoach` sont dans **la même transaction** : aucune invitation
>   ne survit au retrait. Retirer la seule capacité athlète n'y touche pas.
> - Les invitations émises AVANT par un compte qui ne coache déjà plus sont rattrapées par une
>   **migration de données** (`20261005090000_revoke_ex_coach_invitations`), qui ne touche aucune
>   ligne sur une base propre.
> - L'avertissement du retrait (`warnCoach`, web et mobile) le dit : c'est à l'UI de prévenir
>   (`CapabilityService`).
> - **Fenêtre non gardée**, la même qu'en #524 : une acceptation qui passerait entre la vérification
>   des athlètes actifs et l'écriture du retrait, à la milliseconde près, lierait encore l'athlète.
>   La fermer exigerait une transaction sérialisable ; c'est disproportionné pour ce risque.

> **Tranché en #147** (la carte s'affiche dans les DEUX branches — l'issue disait le contraire) :
> son corps rangeait la carte d'invitation dans la seule branche « aucun coach », où un athlète déjà
> lié n'arrive jamais ; #146, lui, exigeait qu'il la voie. Les deux ne pouvaient pas être vrais.
>
> C'est #146 qui l'emporte, et pour une raison qui n'est pas d'arbitrage mais d'usage : **refuser
> est le geste UTILE dans ce cas** — c'est lui qui vide la liste d'attente de l'inviteur. La masquer
> laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien. « Rejoindre » est
> alors désactivé **avec sa raison écrite au-dessus** : un bouton grisé sans explication laisse
> chercher ce qui cloche, alors que la cause est une règle du produit (au plus un coach).
>
> *Renversé en [#599](https://github.com/Cimavia/cimavia/issues/599)* pour sa seconde moitié : la règle « au plus un coach » tombe, une
> seconde invitation s'accepte, et ni le bouton grisé ni sa raison n'ont plus d'objet. La carte
> reste affichée dans les deux branches, pour la même raison qu'ici.
>
> Le libellé ne dit pas « quitte d'abord cette relation » : **aucune route ne supprime une
> `CoachAthlete`**. Envoyer vers un geste inexistant serait pire que de ne rien proposer — c'est
> exactement ce que fait déjà, à tort, `account.capabilities.blocked.ACTIVE_COACH`.

> **Tranché en #147** (`INVITATION_DECLINED` SUPPRIME une destination, il n'en comble pas une) :
> c'est le seul branchement sur le TYPE des deux tables de routage, et l'exact inverse du repli de
> `REMINDER_DUE` (#46) — là-bas le type comble une destination absente, ici il en retire une qui
> existe. La raison n'est pas que l'écran manque : il est là, c'est le panneau d'invitations du
> coach. C'est l'**entité** qui est morte — l'invitation refusée a quitté `PENDING`, elle ne
> s'affiche plus, et l'y envoyer ferait chercher une ligne qui n'y est plus.
>
> Les deux autres se branchent par CAPACITÉ comme le reste de la table, sans une ligne sur le type :
> coach → `/` (web) et `/dashboard` (mobile), où le nouvel athlète apparaît ; athlète → `/my-coach`
> et `/join`, où l'invitation s'accepte. L'entrée `{ to: "/" }` du web porte son `search` — trois
> clés requises mais possiblement `undefined` (#123) —, sans quoi elle ne compile pas.

> **Tranché en #147** (le premier motif de confirmation du mobile est un composant, pas une alerte
> native) : `apps/mobile` n'avait AUCUN geste destructif confirmé, ni le moindre `Alert.alert`. Le
> refus d'invitation en demandait un, et l'alerte native aurait été le réflexe — elle est écartée
> pour deux raisons cumulées : elle ignore NativeWind (donc les tokens, règle dure n°3), et elle est
> invisible du harnais de rendu, qui monte l'arbre en `react-native-web` (dette **Q-6**). Un geste
> protégé par une alerte serait un geste **non éprouvé**. `CmvConfirmButton` est donc le jumeau de
> celui du web, armement en deux temps compris — la parité est le point : un même refus doit
> demander la même chose des deux côtés.

> **Écarts de maquette assumés** : `auth_onboarding.dc.html` § *MOBILE · ACCEPTATION D'INVITATION*
> décrit un **écran plein** — avatar, « Marc Keller t'invite », code **pré-rempli depuis ton lien
> d'invitation**, « Rejoindre Marc ». La carte porte un **« Refuser »** que la maquette ne prévoit
> pas, sans quoi une invitation non désirée resterait en attente jusqu'à son expiration.
> ~~Elle se pose au-dessus du formulaire de code, qui ne devait pas fermer le chemin des invitations
> génériques ; le lien profond qui pré-remplit le code n'existe pas.~~ **Renversé en #390** : il n'y
> a plus ni formulaire ni code — la carte est le seul chemin, et l'e-mail dit de s'inscrire avec
> l'adresse qui l'a reçu.

> **Tranché en #390** (l'invitation se désigne par son `id`, et l'adresse se vérifie AVANT tout le
> reste) : le code servait de secret ; il disparaît du contrat et de la base, et c'est l'adresse de
> la session qui fait le verrou (`POST /invitations/:id/accept|decline`). L'`id`, lui, n'est pas un
> secret — il circule dans la carte et dans les notifications. D'où l'ordre des vérifications :
> **une adresse qui ne correspond pas rend 404 « Invitation introuvable », comme un `id` inconnu, et
> AVANT le statut et l'échéance**. Répondre « expirée » ou « déjà utilisée » à un tiers lui
> apprendrait le sort d'une invitation qui ne le regarde pas ; répondre 400 « destinée à une autre
> adresse », comme le faisait le refus, lui confirmerait qu'elle existe.

> **Tranché en #390** (la migration écrit le sort de chaque invitation générique, elle ne le
> suppose pas) : une générique **acceptée** garde sa ligne — c'est la trace de la façon dont la
> relation s'est nouée — et prend l'adresse, normalisée, de l'athlète qui l'a acceptée. **Toutes
> les autres sont supprimées** : celles qui attendaient (personne n'est plus en mesure de les
> accepter, et leur coach les voyait sans pouvoir rien en faire) et les acceptées dont l'athlète a
> supprimé son compte (plus d'adresse à leur donner). La colonne `email` devient alors obligatoire.
> Côté athlète sans coach, l'écran **affiche l'adresse de son compte** : sans code à saisir, une
> invitation partie vers une autre adresse ne s'afficherait jamais, et c'est cette adresse-là qu'il
> doit donner à son coach.

---

## Post-MVP — Session perdue et changement de compte côté web ([#336](https://github.com/Cimavia/cimavia/issues/336) · [#337](https://github.com/Cimavia/cimavia/issues/337) · [#341](https://github.com/Cimavia/cimavia/issues/341))

> **Tranché en [#336](https://github.com/Cimavia/cimavia/issues/336)** (reconnexion SUR PLACE, pas
> de redirection) : l'issue demandait qu'un 401 rejoue la déconnexion — purge, toast, renvoi vers
> `/login`. Or ce qu'elle reprochait était un constructeur **perdu**, et un renvoi démonte l'écran :
> la saisie serait partie tout de suite au lieu de partir au retour sur l'onglet. D'où :
>
> - **Un 401 ne redirige pas**, il fait relire la session (`createQueryClient`, `recheckSession`),
>   posé sur les *caches* TanStack et non dans `defaultOptions` — un `onError` d'écran remplacerait
>   celui-ci. La garde décide seule, que la perte vienne de l'API ou du retour sur l'onglet.
> - **`CmvRoleGate` distingue un écran jamais monté d'un écran perdu.** Le premier renvoie vers
>   `/login` ; le second reste monté (`inert`) sous `ReauthOverlay`, au même endroit de l'arbre —
>   le déplacer le remonterait et son état partirait. `isPending` n'est plus consulté une fois
>   l'écran perdu : la relecture au retour sur l'onglet le repasse à vrai et démontait l'écran.
> - **L'e-mail de la fenêtre n'est pas saisissable** : on ne reprend l'écran que sous le compte qui
>   l'a monté. Un autre identifiant, y compris une session d'un autre compte ouverte dans un autre
>   onglet, ne reprend pas l'écran — « Changer de compte » purge tout avant de partir.
> - **Voile opaque** : sur un poste partagé, celui qui trouve l'onglet ne doit pas lire l'écran du
>   compte parti. Le titre ne dit pas « expirée » : expiration, révocation et déconnexion depuis un
>   autre onglet arrivent toutes ici.
> - **Aucun toast sur un 401** (`useMutationToast`) : la fenêtre nomme déjà la cause.
>
> Conséquence pour [#327](https://github.com/Cimavia/cimavia/issues/327) (garde « modifications
> non enregistrées ») : aucune navigation ne part sur un 401, le `useBlocker` n'a donc pas
> d'exception à prévoir pour ce cas. Le mobile a le même trou, suivi à part.
>
> Découvert en chemin : lire l'adresse par `useLocation()` dans la garde la faisait boucler
> (« Maximum update depth ») — l'abonnement la re-rend pendant sa propre redirection, et
> `<Navigate>` renavigue à chaque rendu dont les props sont neuves. Elle lit l'état du routeur, une
> fois, au moment de rediriger.

> **Tranché en [#337](https://github.com/Cimavia/cimavia/issues/337)** (la cible voyage par l'URL) :
> la garde renvoie vers `/login?redirect=<page>`, en `replace`, et la connexion y ramène. La cible
> vient de l'URL, donc de n'importe qui : `safeRedirect` n'accepte qu'un chemin interne (ni URL
> absolue, ni `//` ni `/\`, lus comme une autre origine) et refuse les écrans d'authentification.
> Elle est validée là où elle est **suivie** (`LoginScreen`), pas seulement à l'entrée de la route.

> **Tranché en [#341](https://github.com/Cimavia/cimavia/issues/341)** (un seul point de purge) :
> `resetAccountData` (`shared/lib/account-reset.ts`) vide le cache et le presse-papier de semaine,
> appelé par la déconnexion, la connexion, l'inscription et « Changer de compte ». Pendant web de
> celui du mobile. Le suivi local des séances n'y est pas : sa clé est l'identifiant d'une séance
> que le compte suivant ne peut pas ouvrir. Le presse-papier s'oublie aussi quand sa semaine ou son
> cycle est supprimé. L'ordre « purge PUIS navigation » est désormais testé sur la connexion et
> l'inscription ([#373](https://github.com/Cimavia/cimavia/issues/373)).

---

## v1.0 — Entreprises, plusieurs Coachs par athlète, droits d'accès ([#593](https://github.com/Cimavia/cimavia/issues/593))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| MC-1 | **Les docs décrivent la cible avant le code** ([#594](https://github.com/Cimavia/cimavia/issues/594)) : règle dure n°1, `architecture-choice.md` §6, `CONTEXT.cimavia.md` et le cahier des charges posent déjà les règles de l'épic. Chaque affirmation que le code ne tient pas encore porte un marqueur *(cible — #N)* ; la PR de #N le retire en rendant la règle vraie. | 🟡 | [#593](https://github.com/Cimavia/cimavia/issues/593) — résolue au dernier marqueur retiré (`grep -rnE "cible — #[0-9]" CLAUDE.md docs/`) |
| MC-2 | **Une notification d'invitation mène toujours côté coach un compte à double capacité** : la cloche et le push routent `INVITATION` par capacité, pas par type. Invité par une entreprise (`INVITATION_RECEIVED`) ou rejoint par l'un de ses Coachs (`ORGANIZATION_COACH_JOINED`, #602), un compte coach et athlète arrive sur son tableau de bord de coach, et non dans « Mes coachs ». Déjà vrai de l'invitation d'un Coach depuis #146. | 🟢 | — *(déclencheur : un retour beta d'un compte à double capacité perdu ; le correctif lirait `capabilityOfNotification` dans les deux tables de routage)* |

> **Tranché en [#593](https://github.com/Cimavia/cimavia/issues/593)** (cadrage du 2026-10-06, une
> phase de test à deux Coachs associés) : un athlète au plus un Coach, une donnée à un seul Coach,
> des fils à deux — le modèle ne savait représenter ni C et M suivant TI ensemble, ni M ajustant le
> cycle que C a écrit.
>
> - **Entreprise** : un compte **dédié et exclusif** (capacité `company`, jamais cumulée avec
>   Coach ou athlète), choisi en premier à l'inscription. Il ajoute ses Coachs, invite des
>   athlètes, et ne voit **aucun contenu en v1**. L'entreprise est une table (`Organization`)
>   distincte du compte qui l'ouvre, pour accueillir plus tard des administrateurs nommés. Son
>   espace vit sur le web seul ; le mobile y renvoie.
> - **Relations sans table dédiée** : elles se déduisent du lien coach-athlète et de
>   l'appartenance à une entreprise. Un athlète a **0..N Coachs**, en direct ou via une
>   entreprise ; un Coach appartient à 0..N entreprises. Un athlète invité par F reçoit **un lien
>   par Coach de F**, marqué « via F », et un Coach qui rejoint F reçoit un lien avec chaque athlète
>   de F : planifications, débriefs, factures, fiches et conversations restent **par couple**.
> - **Droits d'accès par élément** (exercice, séance, planification) : `READ` ou `WRITE`, accordés à
>   une entreprise ou à un Coach de ses entreprises. Un droit accordé à F vaut pour ses Coachs, pas
>   pour le compte F. La ligne d'un Coach l'emporte sur celle de son entreprise, `NONE` compris ; un
>   Coach de plusieurs entreprises hérite du droit le plus large.
> - **Écrire n'est pas posséder** : `WRITE` modifie le contenu, enfants et publication compris.
>   Supprimer l'élément, gérer ses accès et réaffecter une planification à un autre athlète restent
>   au **propriétaire**. Les enfants suivent leur racine (semaines, séances planifiées, débriefs et
>   facture suivent la planification ; documents et tags suivent l'exercice) ; une facture sans
>   planification reste privée.
> - **Une planification ne se partage qu'avec les Coachs de son athlète** ; sans athlète, elle se
>   partage comme un exercice. Celle d'un athlète d'entreprise est ouverte **en écriture à
>   l'entreprise par défaut** : M la crée, C l'ajuste.
> - **Une séance qui cite l'exercice d'un autre Coach le référence en direct** ; si l'accès
>   disparaît ou si l'exercice est supprimé, elle en garde une **copie figée**.
> - **Plus d'écrasement silencieux** : une version périmée est refusée (409) sur tout élément
>   partagé.
> - **Suivi** : le débrief d'une planification partagée est notifié à tous les Coachs qui y ont
>   accès, et « lu » devient propre à chacun. Partager ne notifie rien ; les rappels restent au seul
>   propriétaire.
> - **Messagerie à participants**, chacun avec sa marque de lecture. Une conversation à deux reste
>   unique par paire. On écrit à ses Coachs, à ses athlètes et aux Coachs de ses entreprises ; les
>   participants sont fixés à la création, sans nom de groupe ; le compte Entreprise n'est dans
>   aucune conversation.
> - **Ce qui tient de #10** : deux capacités, deux scopes, jamais un `OR` entre elles. Ce qui cède :
>   la colonne unique — au sein d'une capacité, le scope devient propriété, droit d'accès ou
>   participation (voir le renversement sous « Tranché en #10 »).
> - **Hors de l'épic** : retirer un membre d'une entreprise ou la quitter (dépend de
>   [#213](https://github.com/Cimavia/cimavia/issues/213)), affecter un athlète d'entreprise à
>   certains Coachs seulement, ce que voit le compte Entreprise, partager hors de ses entreprises,
>   une fiche athlète commune, modifier les participants d'une conversation. Rangés en v1.x au §4
>   du cahier des charges.

> **Tranché en [#598](https://github.com/Cimavia/cimavia/issues/598)** (relecture de la maquette de
> messagerie, 2026-10-07) : trois règles que la planche ne tranchait pas, reportées dans #611 et
> #612.
>
> - **Mêmes participants, même conversation**, à plusieurs aussi — et plus seulement à deux.
>   Sans nom de groupe, deux conversations aux mêmes participants porteraient le même titre et ne
>   se distingueraient que par leur dernier message. La clé d'unicité couvre donc toutes les
>   conversations (`participantKey`), plus les seules conversations à deux.
> - **Prévenir plutôt qu'interdire** quand un Coach choisi ne suit pas un athlète choisi : C peut
>   réunir TE, qu'il suit seul, et M, qui ne le suit pas. Un second avertissement le dit avant la
>   création, comme celui qui prévient que les athlètes se verront entre eux. Écarté : griser M
>   dans le sélecteur tant qu'il ne suit pas tous les athlètes choisis.
> - **L'aperçu dit qui a écrit** : `ConversationDto` gagne l'auteur du dernier message. L'écart
>   « Vous : » relevé en #20 se lève, et l'aperçu d'une conversation à plusieurs n'est plus
>   anonyme.

> **Tranché en [#597](https://github.com/Cimavia/cimavia/issues/597)** (relecture de la maquette
> de la bibliothèque et des droits d'accès, 2026-10-07) : quatre règles que la planche ne
> tranchait pas, reportées dans #604, #605 et #606.
>
> - **Les tags d'une séance sont ceux de ses exercices**, réunis sans doublon. `Session` n'a pas
>   de tags et n'en gagne pas : en saisir à part en ferait une seconde source qui dériverait.
>   Une séance dont aucun exercice n'a de tag affiche « — ».
> - **Sans entreprise, le partage n'apparaît pas** : ni colonne Propriétaire ni colonne Accès, ni
>   filtre de portée, ni cases à cocher. Un Coach seul n'a personne à qui ouvrir un élément ;
>   afficher « Privé » partout serait du bruit.
> - **Un conflit d'écriture prévient, sans montrer la version serveur** : le 409 laisse la saisie
>   affichée et propose de recharger la dernière version. Ni fusion, ni comparaison, ni nom
>   d'auteur. La question laissée ouverte en #440 est close.
> - **Modifier les droits de plusieurs éléments n'écrit que les bénéficiaires changés** : une
>   ligne restée « Mixte » garde la valeur de chaque élément. Remplacer tous les droits de chaque
>   élément, comme l'écrivait #605, écraserait ces valeurs.

> **Tranché en [#599](https://github.com/Cimavia/cimavia/issues/599)** (un athlète suivi par plusieurs Coachs, absorbant
> [#364](https://github.com/Cimavia/cimavia/issues/364)) : ce que le cadrage de #593 ne disait pas.
>
> - **Le contrat d'un coach unique est cassé, pas prolongé** : `GET /me/coach` disparaît (404) et
>   un athlète qui ouvre un fil doit désigner le coach (`coachId`, 400 sinon). Tolérer l'ancien
>   corps aurait obligé l'API à choisir un coach au hasard pour un athlète qui en a deux. Les APK
>   installés se cassent donc sur la messagerie : le nouvel APK sort **avec** la promotion du NAS.
> - **« Aucun coach » ne se dit qu'une fois les coachs LUS** (#364) : `coachPresence` rend
>   quatre états (`loading`, `error`, `none`, `some`). Un booléen confondait la lecture en cours et
>   la panne avec l'absence, et annonçait « aucun coach » à un athlète qui en avait un.
> - **Le coach de la séance décide du fil** : le débrief et « Écrire à » visent le coach qui a
>   programmé la séance, pas un coach principal qui n'existe plus. Sur une séance qu'il s'est
>   programmée lui-même, l'athlète n'a personne à qui écrire : ni lien, ni barre d'envoi, une
>   phrase.
> - **Chaque cycle nomme son coach** sur la semaine athlète, web et mobile : deux coachs peuvent
>   diffuser la même semaine.
> - **« Mes coachs » est une liste, même à un seul coach** : une ligne par coach, avec son fil.
>   Sur mobile, l'entrée est une ligne du Profil ; « Message » depuis l'espace coach d'un compte
>   qui cumule bascule d'abord dans l'espace athlète, où vit ce fil.
> - **Les URLs restent** : `/my-coach` (web) et `/join` (mobile) gardent leur chemin. Les liens
>   déjà envoyés, les notifications et les favoris y mènent encore ; seul le titre change.
> - **Une notification de message ouvre le fil de son AUTEUR** : elle porte l'id de la
>   conversation, alors que la route d'un fil attend l'interlocuteur. La liste reçoit l'id et le
>   traduit ; « le » fil de l'athlète, qui suffisait à un seul coach, aurait ouvert celui d'un
>   autre.

> **Tranché en [#600](https://github.com/Cimavia/cimavia/issues/600)** (compte Entreprise, inscription
> et espace dédié) : ce que le code ne dit pas seul.
>
> - **L'exclusivité se tient deux fois** : le CHECK `user_company_exclusive` en base, et un 400
>   lisible à l'inscription (`create.before`), qui refuse aussi un compte sans aucun type. Le CHECK
>   seul aurait rendu un 500. `role` vaut `COMPANY`, toujours déduit, jamais reçu.
> - **L'entreprise naît après le compte, et se défait avec lui** : `Organization` (id = celui du
>   compte, sans colonne nom) est créée par `create.after`, en `upsert` pour qu'un rejeu ne casse
>   rien. Better Auth n'ouvre pas de transaction autour de l'inscription : si l'entreprise échoue, le
>   compte tout juste créé est supprimé, puis l'échec d'origine remonte. Sans cela, l'adresse
>   restait prise par un compte Entreprise sans entreprise.
> - **Un compte Entreprise ne change pas de type** : `PATCH /me/capabilities` lui répond **403**,
>   et non le 409 d'un `CapabilityBlocker`, qui annonce un blocage levable. `/update-user` refuse
>   `isCompany` (400) comme les autres capacités, dans les deux sens.
> - **Le registre des scopes sépare deux familles** (`TenantScope`) : un modèle d'entraînement n'a
>   pas de clé `company`, un modèle d'entreprise n'a qu'elle. Les routes sans capacité restent
>   ouvertes à l'entreprise (notifications, `me/counterparts`, jetons push) : elles ne rendent que
>   ce qui lui appartient, c'est-à-dire rien, et la coquille web les lit sur chaque écran.
> - **`TrainingCapability`** (`coach | athlete`) type `?as=` et tout ternaire coach/athlète. Élargi
>   à `CapabilityName`, un `space === "coach" ? … : …` rangeait l'entreprise côté athlète sans
>   qu'aucun compilateur ne le signale.
> - **Inscription** : aucun type présélectionné, le choix engageant le compte pour de bon ; sous
>   « Coach et/ou athlète », « Je m'entraîne » reste cochée d'office comme avant. Passer d'une
>   carte à l'autre garde le nom, l'e-mail et le mot de passe saisis.
> - **Web** : deux pages, `/company/coaches` et `/company/athletes`, vides jusqu'à #601 et #602.
>   `/` envoie l'entreprise chez elle : renvoyée au planning comme un athlète, elle bouclait entre
>   `/` et `/planning`. Pas de page Compte pour elle, qui n'y réglerait que des capacités qu'elle ne
>   peut pas prendre : son nom s'affiche en texte simple dans le pied de la barre latérale.
> - **Mobile** : aucun onglet, profil compris ; un écran unique (`/company`) donne l'adresse du web
>   et la déconnexion.

> **Tranché en [#601](https://github.com/Cimavia/cimavia/issues/601)** (l'entreprise ajoute des
> Coachs à son équipe) : ce que le code ne dit pas seul.
>
> - **Une seule table d'invitations, deux émetteurs** : `Invitation` porte `coachId` OU
>   `organizationId` (CHECK `invitation_single_issuer`) et un `role` (`ATHLETE` | `COACH`) ; seule
>   une entreprise propose `COACH` (CHECK `invitation_coach_by_organization`). La table garde son nom
>   `coach_invitation` : la renommer aurait coûté une migration de plus pour rien de lisible.
>   `acceptedByAthleteId` devient `acceptedById`, un Coach pouvant désormais accepter.
> - **Une troisième forme de `TenantScope`, `{ coach, company }`** : `Invitation` est le premier
>   modèle « émis » par les deux familles de #600. Chaque capacité y lit SA colonne — jamais un `OR`.
> - **Le rôle se filtre côté destinataire comme l'adresse** : les routes athlète ne voient que
>   `ATHLETE`, celles du Coach que `COACH`, et un rôle qui ne correspond pas répond le même 404
>   qu'un `id` inconnu (#390). Le cycle de vie commun (expiration, révocation, effacement des refus)
>   vit dans `invitation.lifecycle.ts`, écrit une fois pour les deux émetteurs.
> - **La porte d'inscription est fermée aux entreprises** : une invitation (de Coach ou
>   d'entreprise) ouvre l'inscription d'un Coach ou d'un athlète, jamais celle d'un compte
>   Entreprise. Une entreprise n'entre que par `SIGNUP_ALLOWED_EMAILS`.
> - **Réinviter un membre → 409**, et seulement lui : l'entreprise voit déjà ses membres, le dire
>   ne révèle rien. Toute autre adresse reçoit la même réponse, compte ou pas (#146) — y compris un
>   compte athlète seul, qui ne reçoit ni e-mail ni notification : l'invitation reste en attente
>   jusqu'à expiration.
> - **Les refus restent visibles à l'entreprise**, section « Refusées » qu'elle efface — écart à la
>   maquette, qui n'en montre pas. Aucune notification ne lui est envoyée : elle n'a ni cloche
>   utile ni mobile, la page suffit.
> - **Accepter ne crée aucun lien avec des athlètes** : c'est #602. La carte du Coach annonce déjà
>   « Tu suivras les athlètes de … » — vrai dès que l'entreprise en aura.
> - **Une suite e2e dédiée** (`organization.e2e-spec.ts`) plutôt qu'un ajout à `isolation` : elle
>   éprouve les deux bouts et l'étanchéité entre entreprises sans alourdir le harnais commun.

> **Tranché en [#602](https://github.com/Cimavia/cimavia/issues/602)** (l'entreprise invite des
> athlètes, suivis par tous ses Coachs) : ce que le code ne dit pas seul.
>
> - **Contrat cassé** : `POST /invitations/:id/accept` rend une LISTE de `CoachAthleteDto` (un
>   lien par Coach de l'entreprise, vide si elle n'en a pas encore), et plus un lien seul. Web et
>   mobile suivent dans la même PR ; l'APK part avec la promotion sur le NAS.
> - **La provenance d'un lien** est `CoachAthlete.organizationId`, en `onDelete: SetNull` :
>   supprimer l'entreprise ne coupe pas le suivi, le lien redevient direct. `null` veut dire
>   « direct », pas « inconnu » : la cellule reste vide, sans « — ».
> - **Un lien direct déjà là est gardé sans provenance** (`skipDuplicates`) : il précède
>   l'entreprise et ne doit pas partir avec elle. Le lien d'un compte vers lui-même est sauté.
> - **Une boucle refuse TOUTE l'arrivée** (409), pour l'athlète comme pour le Coach : un athlète
>   suivi par une partie seulement des Coachs de F contredirait ce que l'invitation lui a annoncé.
> - **Les arrivées dans une même entreprise sont sérialisées** par un verrou
>   (`SELECT … FOR UPDATE` sur `organization`) : sans lui, un athlète et un Coach arrivés au même
>   instant lisaient chacun la liste de l'autre avant son arrivée, et leur lien ne naissait pas — le
>   test e2e de concurrence le fait échouer sans verrou.
> - **La colonne « Coachs » de la page Athlètes se déduit de l'équipe**, pas des liens : tous les
>   Coachs de F suivent tous ses athlètes, et un compte Entreprise ne lit jamais `CoachAthlete`.
>   Lire les liens révélerait les suivis directs, que l'entreprise n'a pas à connaître.
> - **Notifications** : l'invitation d'un athlète réutilise `INVITATION_RECEIVED` (l'entreprise
>   pour émettrice), son acceptation `INVITATION_ACCEPTED`, envoyée à chaque Coach dont le lien
>   vient de naître. L'arrivée d'un Coach est un type neuf, `ORGANIZATION_COACH_JOINED`, envoyé à
>   chaque athlète dont le lien vient de naître : un coach apparaît dans « Mes coachs » sans qu'il
>   l'ait invité. Celui qui était déjà suivi en direct n'apprend rien. Le refus d'un athlète ne
>   prévient pas l'entreprise, comme celui d'un Coach (#601).
> - **`GET /organization/invitations?role=`** sépare les deux pages : sans `role`, 400, plutôt
>   qu'un mélange que l'une des deux devrait filtrer.
> - **L'invitation reçue nomme les Coachs qui suivront** (`issuer.coachNames`), l'invité exclu
>   s'il en est. Liste vide = l'entreprise n'a pas encore de Coach, et la carte le dit.
> - **Routage d'un compte à double capacité** : voir **MC-2**.
