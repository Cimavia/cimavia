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

> **Tranché en #570** (la réussite ne se dit pas en terracotta) : « Débrief enregistré » et le
> statut « Fait » étaient en `accent`, presque la teinte du rouge d'erreur — une réussite se lisait
> comme un échec. Le statut de séance passe en **pastille** (`CmvBadge`), comme sur les maquettes :
> `success` pour « Fait », **neutre** pour « À faire » et « Sautée ». La table vit dans
> `@cmv/shared` (`SESSION_STATUS_BADGE`), lue par les quatre écrans des deux apps. Deux écarts aux
> maquettes : la web peint « À faire » en terracotta (on suit l'arbitrage ci-dessus, pas elle), et
> la coche devant « Fait » n'est pas reprise (`CmvBadge` n'a pas d'icône). La confirmation du
> débrief part en **toast** sur le web, comme tout enregistrement, mais reste **en place, en
> `success-on`**, sur le mobile, qui n'a pas de toast. Sur le web, l'échec d'envoi reste sous le
> bouton : il doit se lire jusqu'au nouvel essai, et un toast s'efface seul.

> **Tranché en [#218](https://github.com/Cimavia/cimavia/issues/218)** (le `DEFAULT` d'une famille
> d'état n'est jamais du texte, quel que soit le fond) : `accent` et `error` tombaient sous AA sur
> `surface` (4.08 et 4.20:1) et `surface-hi` (3.67 et 3.78:1), là où vivent cartes, panneaux et
> formulaires, et `accent` déjà sur `bg-1` (4.44). Seul `bg-0` leur laissait AA (4.61 et 4.74), et
> `warning` passait partout. Ne corriger que les fonds fautifs
> aurait gardé l'aspect et laissé deux règles, avec un couple à recalculer à chaque carte. Tout
> texte d'état passe donc à `-on` sur les deux apps : liens, titres de section, « Aujourd'hui »,
> messages d'erreur, `danger` au repos. **Le terracotta du texte s'éclaircit** (`#C2603A` →
> `#E8966F`), comme sur les maquettes, qui dessinaient déjà les erreurs en `error-on`. Trois
> conséquences :
>
> - **Survol des liens** : `hover:underline`, comme les liens `accent-on` déjà en place.
>   `accent-hi` aurait *assombri* le lien au survol. Les deux icônes du `Composer` web passent à
>   `text-hi`.
> - **Un contrôle devient possible** : l'issue le jugeait hors de portée, parce qu'elle raisonnait
>   couple par couple, et remonter le fond à travers le JSX est hors d'atteinte d'un lint. Avec une
>   règle sans exception de fond, une regex suffit sur les classes écrites en entier, les seules
>   que Tailwind génère : `noStateColorAsText` (plugin Biome, tests exclus) refuse
>   `text-cmv-{accent,success,warning,error,info}` et `placeholder-cmv-…`, préfixes compris,
>   dans un littéral, un gabarit, une clé d'objet ou un type TS. Seule la nuance `-on` passe :
>   `accent-hi` est un survol d'aplat (4.45:1 sur `surface-hi`), `-soft` et `-line` des teintes
>   translucides. Côté mobile, elle lit aussi la prop `color` d'une icône ou d'un style
>   (`cmvColors.error.DEFAULT`), et laisse `tintColor` et `thumbColor` aux contrôles natifs. Une
>   classe construite (`text-cmv-${ton}`) lui échappe, mais Tailwind ne la générerait pas non
>   plus ; une couleur native passée par une variable aussi.
> - **Icônes et onglets** : une icône d'état prend `-on` comme le texte, sur les deux apps. Sur le
>   web, elle hérite de la couleur du texte, si bien que le lint l'impose déjà. Le mobile suit
>   (pièce jointe PDF, coches de l'inscription et de la nouvelle conversation, bouton d'envoi),
>   pour qu'un même élément ait la même nuance des deux côtés. L'onglet actif et le retour
>   d'en-tête passent aussi à `on`, parce qu'ils colorent un libellé (4.44:1 sur `bg-1`). Le
>   second reste lettre morte pour l'instant : le `ThemeProvider` importé de
>   `@react-navigation/native` n'atteint pas la copie de React Navigation qu'embarque expo-router
>   56, si bien que le thème entier est ignoré (la pastille d'onglet tombait sur le rouge par
>   défaut, d'où sa couleur posée par `tabBarBadgeStyle`). Ce défaut est antérieur à #218 et
>   suivi à part (issue proposée). Seuls les contrôles natifs teintés gardent le `DEFAULT`
>   (spinner du rafraîchissement, curseur de l'interrupteur) : un élément non textuel se juge à
>   3:1 (WCAG 1.4.11), et `accent` y tient partout (≥ 3.67:1).
> - **Texte posé sur un aplat : blanc, sur un aplat foncé de 5 %** (`accent-fill`, `error-fill`,
>   `text-on-fill`), trouvé à la revue de la PR. Le clair (`text-hi`) tombait sous AA sur chaque
>   `DEFAULT` : 3.52 sur `accent`, 2.90 au survol, 3.42 sur `error`. Le texte sombre sur l'aplat
>   actuel tenait AA (4.61) et a été livré d'abord, mais, vu dans l'application, il éteignait le
>   bouton : Kylian a préféré l'aspect d'avant. Le blanc sur un aplat à peine plus sombre le
>   retrouve à 4.58 et 4.61:1. Le survol fonce au lieu d'éclaircir (`accent-fill-hover`, 5.19),
>   puisque `hi` ferait retomber le blanc sous AA. Un aplat plus sombre encore, brique sous `text-hi`
>   (4.86), changeait la couleur de marque. Il vaut pour les boutons pleins, `CmvConfirmButton`
>   armé, les bulles de ses propres messages, l'espace actif de la navigation web comme du
>   sélecteur mobile, le compteur de non-lus, les badges (onglet compris, dont l'aplat et le texte
>   sont posés à la main, faute du thème) et l'aperçu de structure. Un aplat SANS texte (point,
>   barre de progression, barre de toast) garde le `DEFAULT`, et le bandeau `warning`, clair, son
>   texte sombre. Reste les médias d'une bulle à soi (CE-1).

> **Tranché en [#705](https://github.com/Cimavia/cimavia/issues/705)** (les compteurs du suivi
> prennent la couleur de leur palier, `0` compris) : « Débriefs » et « Messages » non lus passent du
> vert (0 à 9) à l'orange (10 à 19), au rouge (20 à 39) puis au violet (dès 40), sur le tableau du
> web comme sur la carte d'athlète du mobile. Les bornes vivent dans `unreadCountTone`
> (`@cmv/shared`) ; chaque app traduit le palier en sa classe `-on`. Trois écarts assumés :
>
> - **Le `0` vert déroge à l'arbitrage de #37**, où la couleur marquait l'exception et un zéro
>   restait neutre : le Coach bêta veut voir d'un coup d'œil que tout est lu. Les tuiles du tableau
>   de bord, elles, restent neutres à zéro. `null` (liste indisponible) reste « — » sans couleur :
>   un vert y passerait pour un « tout est lu ».
> - **L'orange est l'ambre `warning`, pas le terracotta** : `accent-on` (`#E8966F`) et `error-on`
>   (`#E89089`) sont trop proches, un 10 et un 25 ne se distingueraient plus.
> - **`violet` entre dans `@cmv/tokens`** comme une famille d'état, au même quatuor (`DEFAULT`,
>   `soft`, `line`, `on`) et sous la même règle de lint, sans sens d'état propre : il prolonge
>   l'échelle au-delà du rouge. `violet-on` (`#C2ADEB`) tient 7.65:1 sur `surface-hi`.

| # | Dette | Statut | Suivi |
|---|---|---|---|
| CE-1 | **Le texte d'un média dans une bulle à soi garde ses couleurs de carte sur l'aplat `accent-fill`** : `text-hi` à 3.85:1, `text-mid` à 2.22, `error-on` à 1.91. Sont touchés le compteur du lecteur audio, la taille d'un fichier, la pastille vidéo sans vignette, « format non pris en charge » et les erreurs de lecture. Le **nom** d'un fichier diverge : sur le web il ne fixe pas de couleur et hérite du blanc de la bulle (4.58, il passe), sur le mobile, qui n'hérite d'aucune couleur, il reste en `text-hi`. Il faut à ces composants une variante « sur aplat », sur les deux apps. Le texte d'une bulle, lui, est passé au blanc. | 🟡 | — *(issue proposée à la revue de la PR de #218)* |

---

## Post-MVP — Parité multi-plateforme ([#20](https://github.com/Cimavia/cimavia/issues/20))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| M-2 | **Pas de note vocale de débrief sur Firefox** : `FEEDBACK_AUDIO_MIME_TYPES` n'accepte pas `audio/webm`, seul format que Firefox sache produire. Le bouton disparaît, avec un message. Texte, photos et vidéos restent disponibles. | 🟢 | [#82](https://github.com/Cimavia/cimavia/issues/82) |

*Résolues, à l'[archive](archive.md) : M-1, M-3, M-4, M-5.*
> **Corrigé en #194, trouvé par accident** : `useUnreadNotificationCount` et `useUnreadByCapability`
> (#176) partageaient une clé de cache — voulu, c'est la même requête — mais avec **deux `queryFn`
> différents**, l'un projetant `.count`, l'autre rendant le DTO entier. TanStack indexe par CLÉ, pas
> par `queryFn` : le premier à répondre écrivait le cache et l'autre lisait sa forme. Quand la
> ventilation gagnait, le badge d'onglet recevait `{count, coach, athlete}` là où son type promet un
> nombre, et l'app plantait au démarrage. Invisible tant que le cache persisté du mobile était
> chaud — il ne l'est plus au premier lancement, ni après un changement de `buster`, ni chez un
> nouvel utilisateur. La projection se fait désormais par `select`, à la lecture, sur les deux apps.

*Résolues, à l'[archive](archive.md) : M-6.*

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

## Post-MVP — Le retour d'écran dans le bandeau ([#746](https://github.com/Cimavia/cimavia/issues/746))

> **Tranché en [#746](https://github.com/Cimavia/cimavia/issues/746)** (le retour vit dans le
> bandeau, et il reste un lien) : les quatre retours d'écran du web étaient des légendes grises
> posées dans le contenu, qui sortaient de l'écran au défilement. `CmvAppShell` prend désormais
> `back` (un libellé, et les options d'un `Link` vérifiées par `ValidateLinkOptions`) et le pose à
> gauche du titre.
>
> - **Un `Link` et pas un bouton qui navigue** : le clic du milieu et l'URL au survol restent. La
>   destination est **fixe**, jamais `history.back()` : arrivé par une notification, il ferait
>   sortir de l'app. Le `search` passe tel quel, et la semaine du planning (#251) le traverse.
> - **Le retour et le titre forment un seul groupe** : le `flex-wrap` du bandeau renvoie des
>   actions à la ligne, jamais le retour seul.
> - **La garde de saisie n'a rien demandé** : `useLeaveGuard` passe par `useBlocker`, qui
>   intercepte toute navigation du routeur, bandeau compris (#327, #518).
> - **Dosage n'a pas de fil d'Ariane** : l'issue en citait un « sous le bandeau », mais il n'a
>   jamais existé dans le code. La maquette le dessine, et #721 l'avait écarté. Le retour au cycle
>   du bandeau suffit.
> - **« Fermer » quitte la Lecture d'un cycle (#607)** : il menait aux cycles, comme le retour.
>   Deux boutons pour la même action font hésiter.
> - **Le retour est là en chargement et en panne** : sur la séance et le débrief Athlete, il
>   n'apparaissait qu'une fois la séance lue. Un écran en erreur se quitte désormais. Le cycle et
>   Dosage chargeaient sur une page nue, sans retour ni menu : ils chargent dans le shell.
> - **Le libellé nomme la destination, sans « Retour » devant** : la destination est fixe, et
>   « Retour au planning » mentirait à l'athlète arrivé par la liste Séances ou une notification.
>   « Planifications » porte le nom du lien du menu, vers la même page : c'est le cas que le
>   WCAG 2.4.4 demande, un même nom pour une même destination.
> - **Le mobile reste en l'état** : trois en-têtes ont leur chevron, les autres écrans empilés le
>   geste système. Ce sera une issue si le besoin se confirme.

## Post-MVP — Un mot sans espace passe à la ligne ([#584](https://github.com/Cimavia/cimavia/issues/584))

> **Tranché en [#584](https://github.com/Cimavia/cimavia/issues/584)** (`wrap-anywhere` sur le
> texte, une borne sur les pastilles et les boutons, rien de global) : une URL collée dans la
> consigne sortait de l'aperçu athlète et faisait défiler la page de côté.
>
> - **Pas de règle globale.** `overflow-wrap: anywhere` sur `body` aurait tout couvert d'un coup,
>   mais il ramène la largeur min-content de CHAQUE texte à un caractère : un tableau en
>   disposition automatique y écraserait ses colonnes, et une rangée flex serrée couperait ses
>   libellés au milieu d'un mot plutôt qu'aux espaces. La règle reste posée texte par texte.
> - **Pastilles et boutons ont leur propre règle** : `max-w-full break-words` sur `CmvButton`, et
>   sur le texte de `CmvBadge`. Un libellé qui cite un texte du Coach (« Ajouter un exercice à… »,
>   un nom de fichier, un nom de structure maison) ne dépasse plus son conteneur, et un libellé
>   ordinaire garde ses mots entiers. `wrap-anywhere` les aurait laissés se tasser. La borne est
>   un pourcentage : elle ne tient que dans un conteneur de largeur définie, pas dans une piste de
>   grille `auto` ni une cellule de tableau en disposition automatique.
> - **`AthleteExerciseCard` n'existait plus** : la refonte en blocs l'a remplacé. La consigne passe
>   par `CmvRichDocument`, couvert à sa racine. Le titre et la note passent par `BlockReading`, qui
>   sert l'aperçu de séance et la séance de l'athlète.
> - **Le périmètre a dépassé les aperçus.** Il couvre aussi la composition de séance
>   (`SessionBlockCard`, `BlockExerciseItem`), celle d'une séance planifiée (`ComposedExerciseCard`,
>   `ScheduledComposition`), la consigne de séance du rail athlète et le planning de l'athlète
>   (`AthleteSessionCard`, titre et note de cycle). Même défaut, constaté sur les mêmes parcours.
> - **Le contrôle est un parcours Playwright** (`long-text.e2e-spec.ts`) : jsdom ne calcule aucune
>   mise en page. À 1440 et à 768 px, chaque texte doit tenir dans sa boîte et dans chacun de ses
>   ancêtres : dans une grille à `minmax(0, 1fr)`, un débordement passe sur la colonne voisine sans
>   faire défiler la page. Un `truncate` voulu (le rail) n'y compte pas.
> - **Le mobile n'a pas changé** : `Text` coupe un mot trop long de lui-même. Reste à le constater
>   sur un téléphone.

## Post-MVP — Un bouton sans fond garde une bordure ([#579](https://github.com/Cimavia/cimavia/issues/579))

> **Tranché en [#579](https://github.com/Cimavia/cimavia/issues/579)** (toutes les variantes de
> `CmvButton` web sont bordées) : `ghost` (~55 emplois) et `danger` n'avaient que du texte.
> « Annuler », « Tout réinitialiser » et « Supprimer la séance » se lisaient comme des libellés.
> **Écart à la maquette** : elle dessine « Annuler » en texte seul, et son design system ne connaît
> que le primaire et le secondaire bordé. Les quatre questions de l'issue sont tranchées sur des
> captures avant/après (panneau de séance planifiée, constructeur de séance, menu de colonne) :
>
> - **La bordure de `danger` est neutre** (`border-cmv-border`). Le texte en `error-on` porte déjà
>   le danger, et une bordure rouge à côté du primaire alourdirait le pied de page.
> - **`primary` garde une bordure transparente** : `border` vit dans la base du composant, et c'est
>   ce qui donne la même hauteur à « Annuler » et « Enregistrer » dans un même pied de page.
> - **`ghost` et `secondary` restent deux variantes** : le fond `surface-hi` et le texte `hi` les
>   distinguent encore, à côté l'un de l'autre (« Annuler » / « Remplacer »).
> - **Les boutons-icônes gardent la bordure** (corbeille de `MetricPicker` et de la grille), pour
>   une seule règle. Dans le menu de colonne, les remplissages deviennent des boîtes, nettement
>   détachées de leur titre de section : celui-ci n'a pas eu besoin de passer à
>   `CMV_TABLE.headLabel`, que l'issue prévoyait en repli.
>
> C'est un essai : si un écran dense en souffre, le retour en arrière se limite à `VARIANT_CLASSES`.
> Le mobile n'est pas concerné, son `CmvButton` est plein.

---

## Post-MVP — Le sélecteur segmenté s'annonce ([#650](https://github.com/Cimavia/cimavia/issues/650))

> **Tranché en [#650](https://github.com/Cimavia/cimavia/issues/650)** (des boutons à bascule
> dans un groupe nommé, pas un `radiogroup`) : `CmvSegmented` pose `aria-pressed` sur chaque option
> — le contrat de `CmvToggleChip` — plutôt que `role="radio"` + `aria-checked`. Le patron radio est
> celui d'un choix exclusif, mais il exige la navigation aux flèches et un seul arrêt de
> tabulation, pour des groupes de deux à quatre options. Le groupe est un `fieldset` (rôle `group`
> implicite), et son nom est **imposé par le type** : `label` (libellé visible, qui le nomme),
> `ariaLabelledBy` (libellé visible posé ailleurs par l'appelant, comme le nom d'un bénéficiaire
> sur sa rangée d'accès) ou `ariaLabel`. Un sélecteur sans nom ne compile plus. Le mobile n'a pas
> de sélecteur segmenté.
