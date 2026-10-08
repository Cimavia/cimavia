# Dette technique — Interface et i18n

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## P7 — i18n

> **L'anglais n'est PAS de la dette** — c'est du périmètre v1.0 (CDC §4, §11) dont l'infrastructure
> est déjà payée : zéro string en dur depuis P0 (vérifié par lint depuis
> [#623](https://github.com/Cimavia/cimavia/issues/623), qui en a trouvé une), formats localisés en fonctions pures de
> `@cmv/shared`, `Locale` et `User.locale` déjà en place. Il ne manque que `en.json`, la détection
> (les deux apps forcent `lng: "fr"`, **délibérément** — sans ressource `en`, un appareil anglais
> afficherait des libellés FR avec des dates EN) et la vérification des formats. Suivi par l'épic
> [#71](https://github.com/Cimavia/cimavia/issues/71), hors de ce registre.

> **Tranché en #63** (le serveur a son propre catalogue, et c'est l'inverse du choix de #48) : les
> e-mails sont traduits par un objet typé côté API (`infra/mail/locale/{fr,en}.ts`), pas par
> i18next ni par les catalogues des apps. Trois conséquences que le code ne justifie pas seul.
>
> - **Un e-mail est FIGÉ à l'envoi.** Une notification ne stocke aucun libellé rendu (#48)
>   précisément pour s'afficher en anglais le jour où `en.json` arrivera ; un e-mail part une fois
>   et ne se re-rend jamais. Il doit donc être traduit à l'écriture, dans la langue que la base
>   connaît (`User.locale`) — à un instant où personne n'est authentifié et où aucun client
>   n'existe, Better Auth appelant `sendResetPassword` seul.
> - **L'anglais est écrit maintenant, dormant.** Le `satisfies MailStrings` en fait une obligation
>   de compilation : ajouter une valeur à `Locale` sans son catalogue ne compile pas. C'est le
>   premier anglais du dépôt — les catalogues clients n'ont que `fr.json` jusqu'à
>   [#71](https://github.com/Cimavia/cimavia/issues/71).
> - **Aucune couleur dans le rendu.** La règle dure n°3 interdit tout `#xxxxxx` hors `@cmv/tokens`,
>   un client mail ne lit aucune classe Tailwind, et la palette est sombre par construction —
>   `text.hi` serait illisible sur le fond blanc d'un client mail, que Gmail et Outlook
>   réinversent de toute façon. Le jour où l'on voudra une marque dans l'e-mail, c'est
>   `cmvColors` qu'il faudra rendre consommable par l'API, pas un hexadécimal à la main.
>
> Dette restante, et elle n'a pas d'issue : le libellé du **push** est toujours rendu côté serveur
> et en français en dur (`NotificationService`). L'encadré de #48 annonçait qu'il « suivrait le
> catalogue serveur de #63 » — le catalogue est là et l'accueillerait sans rien changer, mais #63
> ne le demandait pas et rien ne l'a fait. Le déclencheur est l'activation de l'anglais
> ([#71](https://github.com/Cimavia/cimavia/issues/71)) : avant elle, traduire un push n'a aucun
> destinataire.

---

## Post-MVP — Couleurs d'état (#37)

> **Tranché** (le type de semaine) : le design system
> (`docs/maquettes/shared/design_system.dc.html`) réserve délibérément la couleur à l'action
> primaire et rend le **type de semaine** en neutre, par contraste de luminosité ; le builder
> (pd-7) va plus loin et **assombrit** la carte d'une semaine `DELOAD`. L'issue #42 vient du
> retour inverse d'un coach en usage réel — « besoin de plus de couleur sur les éléments
> importants ». Arbitrage : on colore **la seule décharge** (famille `info`, bleu ardoise) et on
> laisse l'entraînement neutre. La couleur marque l'**exception**, pas la règle : l'économie de
> couleur du DS est préservée, le terracotta reste réservé à l'action primaire. Sur ce point
> précis, les maquettes ne font donc plus référence. Les statuts de facture, eux, restent
> conformes — le DS les colore déjà (`success`/`warning`/`error`).

---

## Post-MVP — Parité multi-plateforme ([#20](https://github.com/Cimavia/cimavia/issues/20))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~M-1~~ | ~~**Les e2e ne tournent dans aucune porte**~~ : la CI lançait `pnpm turbo test`, qui exécute le script `test` de chaque paquet — les 186 e2e ont le leur (`test:e2e`) et n'étaient donc jamais exécutés en PR. Découvert en #36 : deux e2e cassés pendant des jours derrière une CI verte. | ✅ | résolu en **#130** — job `E2E (isolation multi-tenant)` sur chaque PR, **requis** dans les rulesets `main` et `staging`/`production` |
| M-2 | **Pas de note vocale de débrief sur Firefox** : `FEEDBACK_AUDIO_MIME_TYPES` n'accepte pas `audio/webm`, seul format que Firefox sache produire. Le bouton disparaît, avec un message. Texte, photos et vidéos restent disponibles. | 🟢 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| M-3 | **Lecture iOS d'une note vocale web non vérifiée** : Chrome produit désormais du `audio/mp4` (le webm ne part plus), mais aucun iPhone réel n'a testé la lecture. Risque faible — mp4/AAC est le format natif d'iOS — mais non mesuré. | 🟡 | [#82](https://github.com/Cimavia/cimavia/issues/82) |
| ~~M-4~~ | ~~**Préparation média toujours dupliquée entre les deux features mobile**~~ (`feedback` ↔ `message`) — doublon de **P5-5**, la même dette suivie à deux endroits. | ✅ | résolue en [#96](https://github.com/Cimavia/cimavia/issues/96) — voir **P5-5** |
| ~~M-5~~ | ~~**Pas de presse-papier sur mobile**~~ : l'invitation se transmettait par `Share` (SMS, WhatsApp) et non par « Copier le code » comme la maquette. | ✅ | caduque en [#390](https://github.com/Cimavia/cimavia/issues/390) — il n'y a plus de code à transmettre, ni à copier ni à partager |
> **Corrigé en #194, trouvé par accident** : `useUnreadNotificationCount` et `useUnreadByCapability`
> (#176) partageaient une clé de cache — voulu, c'est la même requête — mais avec **deux `queryFn`
> différents**, l'un projetant `.count`, l'autre rendant le DTO entier. TanStack indexe par CLÉ, pas
> par `queryFn` : le premier à répondre écrivait le cache et l'autre lisait sa forme. Quand la
> ventilation gagnait, le badge d'onglet recevait `{count, coach, athlete}` là où son type promet un
> nombre, et l'app plantait au démarrage. Invisible tant que le cache persisté du mobile était
> chaud — il ne l'est plus au premier lancement, ni après un changement de `buster`, ni chez un
> nouvel utilisateur. La projection se fait désormais par `select`, à la lecture, sur les deux apps.

| ~~M-6~~ | ~~**Le `buster` du cache persisté se bump à la main**~~ (`CACHE_SCHEMA_VERSION`, `shared/lib/query.tsx`) : rien ne forçait à y penser, et la panne ne se voit pas chez celui qui développe — son cache est toujours neuf. | ✅ | résolue en **#187** — le buster est la version du produit, lue par `currentAppVersion()` |

> **Tranché en #137** (un formateur ne rend jamais du vide) : les libellés et valeurs de métrique
> vivent désormais dans `@cmv/shared` (`metricLabel`, `metricUnitLabel`, `formatMetricValue`,
> `metricCellText`), en un seul exemplaire pour les deux surfaces. La règle qui en sort vaut
> au-delà de ce module : **une absence se DIT — `—`, jamais `""`.**
>
> Le mobile rendait la chaîne vide, le web un tiret. Une chaîne vide est un fallback silencieux au
> sens de la règle dure n°5 : elle confond « pas de valeur » et « rien à dire », et surtout elle
> **disparaît sans bruit d'un `join(" · ")`**, où elle laisse un séparateur orphelin. C'est
> précisément parce que le formateur rendait du vide que la divergence a pu s'installer sans que
> rien ne devienne rouge.
>
> Corollaire à ne pas défaire : les trois endroits qui veulent vraiment omettre une absence la
> **filtrent explicitement chez l'appelant**, là où on voit qu'ils le font — `unitValues` en amont
> des deux `TrackingList` (une case n'a pas la place d'aligner des tirets), la bannière de segment
> de `RunnerBody` (une ligne centrée, lue entre deux séries), et la carte repliée de
> `dosage-summary`. Partout ailleurs, la colonne vide se dit. Le seul changement visible du lot est
> la phrase de dosage du mobile, qui affiche maintenant « — » là où elle taisait la colonne — et
> faisait donc croire qu'elle n'existait pas.

> **Tranché en #137** (les hooks jumeaux divergent, et c'est voulu) : `useNotifications`,
> `useInvoices` et `useReminders` existent des deux côtés et **ne seront pas factorisés**.
> L'audit de l'issue les décrivait comme ayant « les mêmes exports et la même logique, ~55 lignes
> chacun ». Mesuré, c'est faux : `useInvoices` fait 125 lignes côté web contre 39 côté mobile et
> n'a que **2 exports communs sur 7** (la facturation d'un cycle, le justificatif PDF et son upload
> n'existent pas sur mobile) ; `useReminders` fait 115 contre 68 ; `useNotifications` diverge sur le
> fond — le web tient son badge par `refetchOnWindowFocus`, le mobile par le `focusManager` branché
> sur `AppState`. Le web passe partout par `useMutationToast`, que le mobile n'a pas.
>
> Ce qui restait vraiment commun — les routes, les DTO et les clés de cache — est **déjà** dans
> `@cmv/shared` depuis #45 et #48 (`create<X>Api`). Ce qui reste est la composition TanStack Query,
> qui ferait entrer `@tanstack/react-query` en dépendance du paquet partagé pour économiser une
> dizaine de lignes. Le déclencheur d'une reprise serait que les deux surfaces convergent
> fonctionnellement, pas qu'elles se ressemblent de loin.

> **Tranché en #20** (la garde vit sur la ROUTE, pas dans l'écran) : les hooks React s'exécutent
> **avant tout `return`**. Une garde en tête d'écran laisse donc partir ses requêtes — `MessagesScreen`
> appelle `useAthletes()` (`GET /athletes`, coach seul) et `ConversationScreen` appelait
> `useMyCoach()` (`GET /me/coach`, athlète seul). Ouvrir ces écrans à l'autre rôle avec une garde
> interne aurait donné **un 403 à chacun sur sa propre page**. D'où `CmvRoleGate` dans le fichier de
> route (web) et `CmvCapabilityGate` dans le `_layout.tsx` (mobile) : l'écran n'est pas monté du
> tout tant que la capacité n'est pas confirmée. Corollaire appliqué partout ensuite : quand deux
> rôles partagent une route, on écrit **deux composants**, jamais un `if` interne.

> **Tranché en #20** (`capabilitiesOf` plutôt que #10) : la nav devait dépendre de #9/#10, qui
> remplacent le rôle exclusif par `isCoach`/`isAthlete` — une migration Prisma et la réécriture de
> `tenantField`, alors hors du jalon en cours, dans une épic qui annonce « aucun changement
> backend ». La
> dépendance a été **supprimée** au profit d'un adaptateur : `capabilitiesOf(user)` dans
> `@cmv/shared` est le **seul** endroit du monorepo qui lise `role` pour en déduire un droit. Gardes,
> navigation et routage des notifications consomment son résultat. Le jour de #10, un corps de
> fonction change, dans un package testé. **Promesse tenue en #9** : la bascule vers `isCoach`/
> `isAthlete` n'a touché aucun écran, aucune garde, aucune table de nav — seulement le corps de
> `capabilitiesOf` et les deux déclarations `inferAdditionalFields` qui font remonter les champs.
> Le prix assumé : le cas **double capacité** est écrit mais
> inatteignable, et ses sections de nav sont parties dans
> [#129](https://github.com/Cimavia/cimavia/issues/129) — les écrire ici aurait produit des clés
> i18n mortes que `check:i18n --strict` aurait signalées à raison.

> **Tranché en #20** (une ressource = un écran, jamais deux) : `GET /invoices` et
> `GET /conversations` sont scopées par le tenant et servent les deux rôles. Chaque plateforme a
> donc **un** écran, branché sur un booléen (`canManage`) ou séparé en deux composants quand les
> requêtes diffèrent — jamais un second écran qui recopierait la lecture pour n'en changer que les
> boutons. C'est ce qui garde `new_duplicated_lines_density` sous le seuil sans une seule exclusion
> Sonar.

> **Tranché en #20** (rien ne mène nulle part) : `routeForNotification` était **aveugle au rôle**
> des deux côtés, parce que chaque plateforme ne servait qu'un rôle. Ouvrir l'autre transformait
> quatre destinations en culs-de-sac — dont deux en **403** (`/session/:id` et `/messages` mobile
> pour un coach). La table dépend désormais de la capacité, et rend `null` tant que l'écran n'existe
> pas de ce côté : la cloche marque alors lu et invalide le cache **sans naviguer**, ce qui est le
> message exact (« il s'est passé quelque chose »), sans mentir sur l'endroit. Chaque écran a branché
> sa destination en arrivant. `PLAN` reste `null` côté coach **définitivement** — le builder est
> web-only. Corollaire pour toute nouvelle cible : elle se branche dans la PR qui crée son écran,
> jamais avant.
>
> **Nuance apportée en #46** : `PLAN` rend toujours `null` pour une notification de cycle, mais une
> entrée `REMINDER_DUE` qui vise un cycle mène désormais à « Mes rappels ». Ce n'est pas un
> revirement — la cible reste sans écran mobile, c'est le **rappel** qui en a un. Le repli
> s'applique donc au type, pas à la cible, et seulement là où la destination manque.

> **Tranché en #20** (les plafonds ne s'écrivent jamais en dur) : onze messages de refus et deux
> e2e citaient les limites média en clair (« dépasse 50 Mo », « 3 notes »). Le jour où elles ont
> bougé, **tout est resté vert** : le typecheck ne lit pas le français, `check:i18n` vérifie
> l'existence des clés et non la véracité de leur contenu, et les e2e ne tournent pas en CI (M-1).
> `MediaRejectedError` porte désormais ses paramètres, et `megabytesOf`/`minutesOf` vivent dans
> `@cmv/shared`. Toute borne affichée ou testée se dérive de sa constante.

> **Appris en #20** (le câblage de navigation n'a aucune porte) : trois pannes n'ont été révélées
> que par un clic. **Web** — un fichier de segment devient une route *layout* dès qu'un enfant
> existe, et sans `<Outlet />` l'enfant ne s'affiche jamais : l'URL changeait, la page non
> (`routeTree.gen.ts` porte `@ts-nocheck`, et la référence morte vivait dans une closure). **Mobile**
> — `href: null` masque un onglet mais ne choisit pas la **route initiale** du navigateur : un coach
> atterrissait sur `/planning` sous une barre d'onglets pourtant correcte. **Mobile** — les routes
> hors onglets (`/athlete/[id]`, `/session/[id]`, `/join`) n'avaient **aucune** garde de capacité.
> Ni `tsc`, ni `biome`, ni `vite build`, ni `expo export` ne voient ces cas. Deux conséquences
> pratiques : toute PR qui ajoute une route se teste **en cliquant**, et les types de routes Expo
> (`.expo/types/router.d.ts`) ne sont régénérés que par le **serveur de dev** — pas par `expo export`.

> **Tranché en #338** (la garde d'une route se déduit de son chemin) : le troisième constat d'#20,
> une route sans garde, a désormais sa porte. Deux tables, lues dans l'arbre réel. **Web** —
> `routes/guards.test.tsx` exige de chaque route qu'elle accepte **exactement** l'espace que
> `spaceOfPath` donne à son chemin, ou les deux capacités s'il n'appartient à aucun. La nav seule
> ne suffisait pas : `/library/*`, `/plans/$planId` ou `/account` n'y figurent pas. Et c'est
> `spaceOfPath` qui choisit la barre latérale, donc une garde qui le contredit affiche le menu d'un
> rôle au-dessus de l'écran de l'autre. Corollaire : une future route coach **hors des préfixes de
> la nav** rougit, et c'est voulu — elle doit d'abord dire à quel espace elle appartient.
> **Mobile** — `test/route-guards.test.tsx` n'a pas d'équivalent de `spaceOfPath` : la capacité de
> chaque route hors onglets y est **écrite**, tirée du `@Roles` qu'elle appelle, et tout écran de
> `(app)/` doit figurer dans `TABS`, faute de quoi `redirectForPath` ne le garde pas. Des deux côtés,
> les exemptions sont nommées une à une, avec leur raison. Le rendu des gardes elles-mêmes est
> couvert à part : `CmvRoleGate.test.tsx` (livré avec #336/#337) et `CmvCapabilityGate.test.tsx`.

---

## Post-MVP — Registre : le produit tutoie ([#124](https://github.com/Cimavia/cimavia/issues/124) · [#214](https://github.com/Cimavia/cimavia/issues/214))

> **Tranché en #124** (tutoiement, les deux plateformes et les DEUX rôles) : la maquette le dessine
> jusque sur les écrans coach (« Commence par inviter ton premier athlète », « Chargement de tes
> athlètes… »), et rien dans la doc ne la contredit. Un registre par PLATEFORME casserait à la
> première surface partagée ([#20](https://github.com/Cimavia/cimavia/issues/20) : un coach sur
> mobile serait soudain tutoyé) ; un registre par RÔLE coûterait des clés dédoublées pour un gain
> nul. Ce qui a emporté la décision n'est pas la maquette seule : le tutoiement était **déjà écrit
> partout ailleurs** — les neuf libellés de push de `NotificationService`, et le catalogue e-mail
> `infra/mail/locale/fr.ts` qui le documentait en commentaire depuis #63. Seuls les deux catalogues
> front avaient glissé.

> **Tranché en #124** (l'impératif de politesse vouvoie autant que le pronom) : l'issue comptait les
> pronoms — 30 chaînes web, 3 mobile. Le compte réel est **36 et 10**, parce que « Saisissez votre
> e-mail » et « Réessayez » s'adressent à un « vous » sans jamais l'écrire. Quatre des chaînes
> corrigées n'avaient **aucun** pronom, dont une en milieu de phrase (« copiée — choisissez où la
> coller ») : aucun grep manuel ne les avait sorties, le contrôle F les a trouvées du premier coup.

> **Tranché en #124** (un contrôle en CI, pas seulement une ligne de doc) : l'issue ne demandait
> qu'une convention écrite. Elle n'aurait rien empêché — la dérive avait déjà **récidivé après le
> diagnostic**, le bloc `account.capabilities` étant arrivé vouvoyé aux DEUX catalogues entre la
> rédaction de l'issue et son traitement. D'où le contrôle **[F]** de `check:i18n`, branché sur les
> seuls catalogues `fr.json` (`en.json` de [#87](https://github.com/Cimavia/cimavia/issues/87) n'a
> rien à y faire) **et** sur les chaînes littérales d'`apps/api/src` : `apiErrorMessage` rend
> `error.message` brut, un refus d'exception est donc de l'UI. Huit y ont été corrigées, dont
> `env.validation.ts`, dev-facing — tutoyée elle aussi pour que la garde n'ait aucune exception à
> porter.

> **Tranché en #124** (le piège nommé par l'issue n'existait pas) : l'issue exigeait de préserver
> `messages.thread.you` (« Vous : »), étiquette d'expéditeur dans un fil. **Cette clé n'a jamais
> existé** : l'aperçu préfixé est un écart déjà consigné dans `docs/maquettes/README.md`, non
> rendable tant que `ConversationDto` n'expose pas l'auteur du dernier message. La vigilance reste
> juste, elle n'avait simplement pas d'objet — elle vit maintenant dans `REGISTRE_EXEMPT`, vide, qui
> attend cette clé le jour où elle arrivera.

> **Tranché en #214** (la fin du mensonge se fait dans le même passage) : les deux libellés de refus
> `account.capabilities.blocked.*` changent de SENS en même temps que de registre — ils disaient
> « Retirez ces liens avant de cesser de coacher », geste qu'aucune route ne sait faire. Les livrer
> séparément aurait fait réécrire deux fois les mêmes chaînes, la seconde annulant le registre de la
> première : la formulation proposée par #214 était elle-même vouvoyée. Le vrai recours — rompre une
> relation — reste cadré en [#213](https://github.com/Cimavia/cimavia/issues/213), et ces deux
> libellés redeviendront des instructions le jour où il existera.

---

## Post-MVP — Refus de validation en français ([#319](https://github.com/Cimavia/cimavia/issues/319))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| VE-1 | **Les refus de l'API sont rédigés en français côté serveur**, ceux de Zod compris depuis #319 (`frenchIssueMessage`, `apps/api/src/zod/`) : les clients les affichent tels quels (`apiErrorMessage`). Antérieur à #319 pour tous les autres refus — #319 y range ceux de Zod au lieu de les traduire côté client. | 🟢 | [#71](https://github.com/Cimavia/cimavia/issues/71) *(épic EN — aucune de ses sous-issues ne couvre encore les messages de l'API)* |

> **Tranché en [#319](https://github.com/Cimavia/cimavia/issues/319)** (un refus de Zod se traduit
> côté API, pas côté client) : un titre de cycle de 201 caractères affichait « Too big: expected
> string to have <=200 characters ». L'issue demandait une clé i18n côté client ; elle affirmait
> aussi qu'aucun schéma ne portait de message propre, et **une vingtaine en portent**, en français
> (« La date de début doit être un lundi », « Un lien doit être en http ou https. »…).
>
> - **Le client ne peut pas trier.** Il ne reçoit que `{ path, message }` : rien ne distingue un
>   message écrit par nous d'un texte de Zod. Une clé générique côté client aurait écrasé les
>   messages précis ; un tri côté client aurait demandé de changer la forme du contrat, les deux
>   catalogues et les appelants d'`apiErrorMessage`.
> - **La table vit dans `zodSafeParse`**, passée à `safeParse` : Zod 4 la fait passer APRÈS le
>   message du schéma, elle ne joue donc que là où personne n'a rien écrit. Elle dit la borne
>   (« Ce texte dépasse 200 caractères. »), pas le champ — aucune table `path → libellé` à tenir.
>   Elle est au tutoiement, et c'est le contrôle **[F]** de `check:i18n` qui le garde.
> - **Les `maxLength` sont posés depuis les constantes `*_MAX_LENGTH`** sur tous les champs qui
>   n'en avaient pas : le refus devient l'exception.
> - **La consigne riche est une saisie refusée, comme une cellule illisible (#566)**. Un éditeur
>   TipTap ne se borne pas par attribut, et son texte trop long ne s'apprenait qu'au refus de
>   l'API : un toast générique (`onFailure`, qui dit le geste et pas l'appel) et le détail en bas
>   de page, hors de vue sous un bandeau fixe. `isRichDocumentTooLong` (`@cmv/shared`), partagée
>   avec le schéma, le vérifie à l'écran ; l'éditeur le dit sous lui et se déclare au registre, qui
>   ferme l'enregistrement.
> - **La borne par fragment est retirée** (`RICH_TEXT_MAX_LENGTH`, 2 000) : posée à la création du
>   schéma sans raison écrite, elle portait sur un passage de même mise en forme — un paragraphe
>   de 2 500 caractères était refusé, le même avec un mot en gras accepté. Le coach ne voit pas
>   les fragments, et le cumul (5 000) borne déjà tout : c'est la seule borne de texte qui reste. **Amende #566** : le libellé du
>   bouton fermé, `refusedBlocksSave`, disait « une valeur n'est pas comprise » ; il couvre
>   désormais aussi un texte trop long (« Un champ refuse sa saisie »).
> - **Un compteur à 90 % de la borne, sur les zones multilignes seulement** (`shouldShowCharCount`,
>   `@cmv/shared`) : toujours affiché, il serait du bruit sur trois lignes de débrief ; jamais, la
>   saisie s'arrête sans dire pourquoi. Pas sur un champ d'une ligne, dont la borne (200) ne
>   s'atteint pas en pratique. L'issue disait que le débrief l'avait déjà : il n'avait que le
>   `maxLength`.

> **Tranché en [#320](https://github.com/Cimavia/cimavia/issues/320)** (le client ne fabrique plus
> de message à montrer) : la page HTML de cloudflared pendant un redémarrage de l'API levait une
> `SyntaxError`. L'issue demandait d'en faire une `ApiError` qui garde le statut, ce qui est fait,
> même sur un 200 (portail captif). Prise à la lettre, la demande aurait pourtant fait **reculer
> l'écran** : `apiErrorMessage` aurait rendu le message de cette erreur, et « Erreur 502 » aurait
> remplacé le message traduit que l'écran affiche déjà.
>
> - **`ApiError.fromApi`** dit si le message a été écrit par l'API. Il est faux pour un corps
>   non-JSON, un corps vide, un simple libellé HTTP (« Service Unavailable », en anglais) et une
>   liste de champs vide. `apiErrorMessage` rend alors `null` et l'écran garde son message.
>   L'`Error.message` reste, pour les logs et Sentry.
> - **Le corps vide et le libellé HTTP sont rangés avec le non-JSON**, qui étaient hors de l'issue :
>   c'est le même texte inventé côté client, en dur, que le contrôle **[F]** de `check:i18n` ne lit
>   pas (il ne lit que `apps/api/src`).
> - **Le repli des écrans était déjà en place** : l'issue citait deux encarts vides, et `c2104cb`
>   (`CmvFormError`) les avait corrigés. Les quinze appelants web et mobile en ont un.
