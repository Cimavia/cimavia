# Dette technique — Qualité et dépôt

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## Post-MVP — Qualité & analyse statique

| # | Dette | Statut | Suivi |
|---|---|---|---|
| Q-6 | **`accessibilityState` est invisible du harnais de rendu mobile** : `react-native-web` ne mappe PAS cette prop React Native héritée sur un attribut ARIA, là où `aria-checked` moderne passe. Le rendu **natif** l'honore — ce n'est donc pas un défaut d'accessibilité de l'app —, mais aucun test ne peut l'affirmer : `TrackingList` s'éprouve sur le « ✓ » que l'athlète voit. Trois autres composants en portent un (`RegisterScreen`, `ProfileScreen`, `CmvCapabilitySwitch`). **Même angle mort depuis #536** : `accessibilityActions`/`onAccessibilityAction` ne passent pas non plus — le pas d'accessibilité de `CmvSeekBar` s'éprouve en fonction pure (`nudge`), son câblage non. Sa valeur, elle, passe par `aria-value*`, rendues. | 🟢 | — *(déclencheur : un test qui voudrait affirmer sur l'état ARIA d'un composant mobile — la sortie est de passer ces quatre composants aux props modernes)* |
| Q-7 | **Le harnais de test mobile ne charge pas `@testing-library/jest-dom`**, là où celui du web le fait (`apps/web/vitest.setup.ts`) : ni `toBeDisabled`, ni `toHaveAttribute`, ni les autres matchers DOM. Un test qui veut affirmer sur l'état d'un bouton interroge donc `aria-disabled` à la main (`PlanningScreen.test.tsx`, #236). | 🟢 | — *(déclencheur : un deuxième fichier qui recopie le contournement — la sortie est la dépendance plus son import dans `test/setup.ts`, deux lignes)* |
| Q-8 | **35 `Pressable` de feature, dans 22 fichiers, n'annoncent pas « bouton »** (#199) : rappels, notifications, factures, mais aussi les liens de l'auth, « Retirer » d'un média, les cartes de séance, de conversation et d'athlète. L'inventaire vit dans l'issue, pas dans les tests : beaucoup n'en ont pas. Ceux qui en ont un sont pressés par `pressText()`, l'ancien geste par le texte, puisque `pressButton()` exige désormais le rôle. | 🟢 | [#896](https://github.com/Cimavia/cimavia/issues/896) |

*Résolues, à l'[archive](archive.md) : Q-1, Q-2, Q-3, Q-4, Q-5.*

> **Tranché en #130** (trois réglages qu'une bonne intention suffirait à défaire) — la porte e2e
> tient à des choix qui ressemblent, de loin, à des maladresses à corriger :
>
> - **`test:e2e` porte `cache: false` dans `turbo.json`.** Ce n'est pas un oubli d'optimisation.
>   Les vraies entrées de cette suite sont un Postgres et un MinIO **vivants**, plus l'état de la
>   base — rien de cela n'entre dans le hash de Turbo. Un cache hit rejouerait « 268 passed » sans
>   exécuter une requête : une porte verte qui n'a rien vérifié, soit la panne M-1 en pire, parce
>   qu'invisible.
> - **`vitest.config.e2e.ts` doit continuer de LEVER si `.env.test` manque.** Rendre le
>   `loadEnvFile` tolérant paraît robuste et ne l'est pas : la suite `TRUNCATE` toutes les tables à
>   l'ouverture, et un `DATABASE_URL` traînant dans le shell prendrait alors le relais du fichier
>   absent. Le fichier se fabrique par `cp apps/api/.env.test.example apps/api/.env.test` — et
>   `global-setup.e2e.ts` refuse en plus toute base dont le nom ne finit pas par `_e2e`.
> - **La CI monte les services par `docker compose`, pas par `services:`.** Un conteneur de service
>   GitHub n'exécute pas l'entrypoint de `minio-setup` : le bucket `cimavia-media-e2e` n'existerait
>   pas et la moitié médias de la suite tomberait. Les recréer en YAML donnerait deux copies de la
>   même logique, qui divergeraient.

> **Tranché en #57** (un fichier absent de tous les lcov vaut 0 %, pas « non mesuré ») : c'est la
> règle qui gouverne les deux périmètres de couverture, et elle est contre-intuitive. Conséquences
> à ne pas défaire : `main.ts` et `instrument.ts` sont exclus **des deux côtés** — de l'`exclude`
> de `vitest.config.e2e.ts` *et* de `sonar.coverage.exclusions` — parce que les sortir du seul lcov
> les ferait compter zéro au lieu de les retirer du calcul. Et à l'inverse, la config e2e ne
> s'aligne **pas** sur l'exclusion des `*.module.ts` / `*.dto.ts` de la config unitaire, alors que
> l'écart de chiffre serait négligeable (0,45 pt) : aligner ferait chuter une quinzaine de modules
> à 0 % dans Sonar, puisqu'aucun rapport ne les porterait plus.

> **Tranché en #59** (le préréglage d'un framework ne se paie que si on le traverse) : le mobile
> reste sur **Vitest**, pas `jest-expo`. L'issue posait ce choix comme le vrai sujet, et deux
> raisons le ferment. `architecture-choice.md` §11 dit « Vitest » pour les trois couches — un
> second runner aurait exigé de contredire ce doc. Surtout, ce que `jest-expo` apporte est le RENDU
> d'un arbre React Native : son transformeur et ses mocks de modules natifs. Or les cibles testées
> n'importent aucun runtime natif — `tabs.ts` et `route.util.ts` ne prennent d'`expo-router` qu'un
> type, `useSegmentRunner` ne dépend que de React —, et `renderHook` monte via `react-dom`, déjà
> présent pour react-native-web. Le seul mock du harnais est `AsyncStorage`, posé en `setupFiles`
> pour qu'aucun test ne PUISSE atteindre un module natif. Corollaire à ne pas défaire : le jour où
> l'on voudra rendre un écran natif, c'est là que la question se rouvrira — pas avant.
>
> **Rouverte en #156, et refermée autrement.** Le raisonnement ci-dessus tenait entièrement ; ce
> qui lui manquait était une TROISIÈME voie, que ni cet encadré ni #188 n'envisageaient :
> `react-native-web`. Ce n'est pas un second runner mais un alias de résolution, donc §11 reste
> tenue et `jest-expo` reste fermé. Voir « Tranché en #156 » ci-dessous.

> **Tranché en #156** (rendre un écran natif sans changer de runner) : le mobile monte désormais
> de VRAIS composants React Native sous Vitest. Cinq choix que le code ne justifie pas seul.
>
> - **`react-native` est aliasé vers `react-native-web`**, et c'est ce qui débloque tout. Le
>   paquet natif n'est pas seulement lourd à charger : il est écrit avec des annotations **Flow**,
>   qu'esbuild — le transformeur de Vite — ne sait pas effacer. Il est donc hors de portée par
>   construction, et aucun réglage ne l'en rapprochera. `react-native-web` est déjà une dépendance
>   de production (Expo web) et rend le même arbre en DOM. L'alias est une LISTE de regex ancrées
>   et non un objet : un alias objet fait du remplacement de préfixe, et réécrirait
>   `react-native-keyboard-controller` en `react-native-webkeyboard-controller`.
> - **Le mur n'était pas celui que #188 décrivait.** L'issue annonçait `SafeAreaProvider`,
>   `KeyboardProvider`, le `ThemeProvider` de react-navigation et le `Stack` d'expo-router. Ils
>   sont bien nécessaires, et coûtent sept lignes de mock chacun. Le vrai point de passage, que
>   l'issue ne nommait pas, est **`expo-modules-core`** : tout module Expo en dérive, et il lit
>   `globalThis.expo`, la poignée JSI que seul le runtime natif pose. Le mocker fait tomber la
>   chaîne entière — c'est le seul mock structurel de `test/native.tsx`, les autres ne font que
>   rendre leur module utilisable.
> - **`fireEvent.click` est le SEUL geste qui presse un `Pressable`** sous react-native-web.
>   `mouseDown`/`mouseUp` et `pointerDown`/`pointerUp` ne déclenchent RIEN, silencieusement — un
>   test qui les emploie affirme sur un geste qui n'a jamais eu lieu. Vérifié à la mise au point,
>   et c'est pourquoi `test/render.tsx` expose `press()` plutôt que de laisser choisir.
> - **`tsconfig.test.json`, comme l'API en #130 — pour la bibliothèque DOM et rien d'autre.** Le
>   `lib: ["ES2023"]` du mobile n'est pas un oubli : c'est lui qui fait échouer un fichier de
>   production appelant `document` au lieu de le laisser planter sur l'appareil. Les tests, eux,
>   manipulent légitimement du DOM (jsdom + react-native-web). Deux passes, donc, plutôt qu'une
>   bibliothèque élargie pour tout le monde — et `include` y répète les déclarations ambiantes,
>   faute de quoi le `className` de NativeWind redevient une propriété inconnue.
> - **Ce que le harnais rend testable ne change pas ce qu'on affirme.** Les tests livrés portent
>   sur des décisions — un bouton fermé quand le quota est pris, un rang de lot tu quand il n'y a
>   pas de rang à dire, un `markRead` qui ne part pas sur ses propres messages, la préséance d'un
>   refus manuel sur une erreur d'upload. L'interdiction de #58 tient sans réserve : un `render()`
>   qui exécute du JSX sans rien affirmer reste du décor, harnais ou pas.
>
> - **Les scripts `lint` des paquets disent `biome check .`, jamais une liste de dossiers.** Les
>   trois apps listaient leurs répertoires de source et rataient donc leur propre harnais de test —
>   `apps/mobile/test/` n'était vu par aucun `pnpm lint` ; `@cmv/shared` et `@cmv/tokens` n'avaient
>   pas de script du tout. Une liste dérive dès qu'un fichier apparaît à la racine du paquet, et
>   elle dérive **en silence**. Le `.` s'entretient seul : Biome remonte au `biome.json` de la
>   racine, donc les exclusions (`.expo`, `metro.config.js`, `tailwind.config.js`…) continuent de
>   s'appliquer — les re-lister par paquet serait le geste à ne pas faire. Conséquence à ne pas
>   sur-lire : `turbo lint` reste insuffisant comme porte, mais pour une raison neuve — il couvre
>   maintenant les cinq paquets et ne voit toujours **pas la racine** (`biome.json`, `turbo.json`,
>   `scripts/check-i18n-keys.mjs`). `pnpm biome ci .` reste ce que lance la CI.
>
> Angle mort assumé : `cimode` PERD les paramètres d'interpolation (même prix qu'au web, #188), et
> `CmvButton` n'ayant pas de `accessibilityRole`, `pressButton()` doit prendre le premier des deux
> nœuds que `getAllByText` remonte. L'index disparaîtra le jour où le rôle sera posé. *Levé en
> #199 pour les composants partagés : `pressButton()` cherche par rôle. L'index survit dans
> `pressText()`, pour les cibles de feature encore sans rôle (Q-8).*

> **Tranché en [#199](https://github.com/Cimavia/cimavia/issues/199)** (le rôle d'accessibilité
> sur les composants partagés du mobile) : `CmvButton`, `CmvConfirmButton` et les cibles média
> annoncent désormais « bouton ». Quatre écarts à l'issue :
>
> - **`accessibilityRole` et non `role`** : le dilemme n'existait pas. Dans `react-native-web`
>   0.21.2, le `warnOnce` de `accessibilityRole`, comme celui de `accessibilityLabel`, est **en
>   commentaire** (`createDOMProps`). Les props ne produisent aucun avertissement, et la
>   convention des 33 sites existants tient.
> - **L'inventaire était incomplet** : `CmvConfirmButton` (3 `Pressable` nus) manquait, et
>   `CmvVideoLink` est devenu la pastille sans vignette de `CmvVideoPlayer` (rôle seul, son texte
>   la nomme). Les icônes seules prennent un nom : lecture/pause du lecteur audio (il suit le
>   prochain geste), micro, corbeille et envoi de l'enregistreur.
> - **Le fond plein écran de `CmvImageViewer` sort de l'arbre d'accessibilité** : il ferme
>   toujours d'un tap, mais un plein écran annoncé « bouton » se lit mal. `accessible={false}` ne
>   suffit que sur iOS : sur Android, `Pressable` repasse `focusable` à vrai et la vue redevient
>   cliquable, un arrêt TalkBack sans nom. D'où `focusable={false}` et
>   `importantForAccessibility="no"`, vérifiés dans l'arbre natif de l'émulateur. Un test jsdom
>   ne peut pas le voir, puisque `react-native-web` ignore les deux props. La croix, auparavant une simple `View`, devient le vrai bouton de fermeture nommé,
>   comme celle de la vidéo, et la vignette se nomme « Agrandir la photo ».
> - **`pressButton()` exige le rôle, et ce n'était pas gratuit** : environ 70 appels visaient des
>   cibles de feature sans rôle, ou d'un autre rôle. Les cibles d'un autre rôle passent à
>   `press(getByRole(…))` (`radio` pour `CmvToggleChip`, `checkbox` pour les casquettes). Celles
>   sans rôle passent à `pressText()` (Q-8, [#896](https://github.com/Cimavia/cimavia/issues/896)).
>   Un `Pressable` qui contient un titre et une description a pour nom les deux, lus d'un
>   tenant : son test le presse par un nom partiel (« Mes coachs », les casquettes du profil).
> - **Deux annonces fausses corrigées à la revue de la PR** : sans durée connue, le lecteur audio
>   affichait `0:00` et faisait dire « sur 0:00 ». Il rend désormais `—` (règle dure n°5) et
>   n'annonce que la position. La vignette vidéo s'annonçait « Vidéo » et taisait la durée
>   dessinée dessus : elle se nomme « Vidéo, 0:42 », comme la pastille sans vignette le dit par
>   son texte.

> **Tranché en #58** (mesurer une couche à moitié, c'est la remettre hors de vue) : le périmètre de
> couverture du web est **tout `src/`**, et non sa seule couche `util/` + `hook/`. La restriction
> était tentante — 891 statements testables sur 3 047, une Quality Gate qui ne mord que là où l'on
> a décidé d'écrire des tests — mais elle aurait laissé les 12 258 lignes de `component/` et
> `screen/` durablement invisibles, c'est-à-dire reproduit le mécanisme qui a produit Q-1. La
> contrepartie est assumée et connue : sur le code NEUF, un écran ajouté sans test fait rougir la
> gate, et la façon la moins chère de la reverdir est un `render()` qui exécute le JSX sans rien
> affirmer. Cette couverture-là est du décor — si elle apparaît, c'est le test qu'il faut reprendre,
> pas le périmètre.

> **Tranché en #188** (un harnais de rendu décide plus qu'il n'en a l'air) : trois choix que le
> code ne justifie pas seul, et qu'une bonne intention suffirait à défaire.
>
> - **Les tests de composants affirment sur la CLÉ i18n, pas sur le français** — instance de test en
>   `lng: "cimode"` (`apps/web/test/i18n.ts`), même raisonnement que le `fakeT` de #58. Le prix est
>   réel et connu : `cimode` PERD les paramètres d'interpolation, donc un décompte affiché par
>   `t(key, { count })` n'est pas observable dans le texte rendu. Il s'affirme sur ce qui le
>   gouverne — un bouton fermé, un badge absent — jamais sur sa mise en forme.
> - **Deux helpers et non un.** L'issue décrivait un `renderScreen()` unique montant Query + Toast +
>   Router. Vérification faite, six des huit cibles n'importent RIEN de `@tanstack/react-router`, et
>   ce qui leur manquait vraiment était i18next, que l'issue ne nommait pas. D'où
>   `renderWithProviders` (i18n + cache + toasts) et `renderInRoute` par-dessus, pour les deux seuls
>   écrans routés.
> - **`renderInRoute` est ASYNCHRONE, et monte un vrai routeur.** Un vrai, parce que
>   `AthleteFeedbackScreen` appelle `getRouteApi("/sessions/$sessionId/feedback")` au niveau module :
>   mocker le module rendrait le test aveugle au jour où cet id change, c'est-à-dire au seul défaut
>   qu'il aurait pu attraper. Asynchrone, parce que `RouterProvider` résout ses matches en tâche de
>   fond — un montage synchrone laisse le DOM VIDE au premier tour, et le premier jet a produit un
>   test vert qui affirmait une absence sans avoir rien vu.

> **Appris en #57** (deux commentaires décourageaient une manœuvre pour une raison fausse) :
> `sonar-project.properties` et le docblock de `vitest.config.ts` affirmaient tous deux que les e2e
> tournaient dans « un process Nest à part » et ne pouvaient donc pas être instrumentés. Ils font
> `app.listen()` **dans le process du worker Vitest**, que v8 mesure : la couverture de l'API est
> passée de 2,6 % à ~86 % sans écrire une ligne de test. Un commentaire qui explique pourquoi on
> n'a pas fait quelque chose se relit comme une porte fermée — il vaut donc d'être vérifié quand on
> s'y heurte, pas cru sur parole.

> **Appris en #57** (un typecheck peut être vert sans rien vérifier) : `vitest.config.ts` ne pouvait
> pas rejoindre l'`include` de `tsconfig.json` — sous son `moduleResolution: Node10`, les types de
> `vitest/config` ne se résolvent pas, `defineConfig` vaut `any`, et une propriété **inventée** y
> passe sans erreur. C'est `Bundler` qui a attrapé `coverage.all` et `minWorkers`, deux options
> mortes depuis Vitest 4 qu'on croyait actives. Corollaire : ajouter un fichier à un tsconfig ne
> prouve rien tant qu'on n'a pas vérifié qu'une faute délibérée y échoue.

> **Appris en #130** (un check requis se nomme par le JOB, jamais par le workflow) : le
> `Production ruleset` exigeait les contextes `CI` et `SonarCloud` — les noms des **workflows**.
> Les check runs publiés s'appellent `Lint + Typecheck + Test` et `SonarCloud Analysis`, d'après
> les noms de **jobs**. Ces deux checks n'arrivaient donc jamais : une PR vers `staging` ou
> `production` serait restée bloquée sur « Waiting for status to be reported ». Latent — aucune PR
> n'avait encore visé ces branches. Corollaire : **renommer un job décroche silencieusement la
> porte** qui le référence, dans un sens (elle n'arrive jamais) comme dans l'autre.

> **Tranché en #318** (la CI ne rejoue pas `main`, et Sonar ne rejoue pas les tests) : une PR de
> feature déclenchait quatre exécutions complètes de `ci.yml`, dont trois mesuraient un arbre déjà
> prouvé vert — le ruleset `Main` exige une PR à jour de `main`, donc le run `pull_request` teste
> exactement ce qui atterrit.
>
> - **A — le push sur `main` ne tourne qu'au commit de release** (`on.push.paths:
>   [.release-please-manifest.json]`). Il ne fait **pas** gagner de temps : le merge d'une feature
>   et la PR de release tournent en parallèle, sur deux refs. Il répare deux pannes. Le **gardien
>   Sonar** : en `previous_version`, la référence est la dernière analyse sous le numéro précédent ;
>   les merges de feature étant analysés sous ce numéro, l'analyse de la release ne jugeait que les
>   quatre fichiers du bump (constaté le 2026-09-25 : la période de l'analyse 1.5.5 datait du merge
>   de #408, pas de la release 1.5.4). Et la **promotion** : `cancel-in-progress` annulait le run
>   du commit de release quand un merge le suivait de près — plus de checks verts, version
>   impossible à promouvoir (déjà arrivé sur `6615b3f` et `aa73cdf`). Le manifest et non
>   `package.json` : une feature qui touche le `package.json` racine redeviendrait la référence
>   Sonar. En plus, `cancel-in-progress` ne vaut plus que pour les PR : un run de `main` n'est
>   jamais annulé, même si le filtre change. **Contrepartie** : entre deux releases `main` n'a pas
>   de statut Sonar propre, et l'analyse de la release juge l'union des PR — elle peut rougir alors
>   que chacune était verte. C'est le but, mais ça bloque une promotion.
> - **B — `sonarcloud` ne rejoue plus `turbo test`** : il attend `quality` et `e2e` et reçoit leurs
>   lcov en artefact. Deux exécutions de la même suite pouvaient diverger sur un flake, et c'était
>   la seconde, invisible des logs de `quality`, qui décidait de la porte. Environ une minute de
>   gagnée par run : Sonar part plus tard (après `quality`), mais sans ~2 min de tests.
> - **C — cache Turbo partagé entre runs : rejeté.** Un changement de version ne modifie aucun hash
>   Turbo, mais la PR de release touche `apps/mobile/app.json` et fait rater le cache mobile ; et
>   le cache GitHub est cloisonné par branche, `main` ne l'écrivant plus qu'à chaque release. Gain
>   au mieux ~20 s.
> - **D — ne pas rejouer l'e2e sur la PR de release : reste ouverte.** Les trois contextes sont
>   exigés par le ruleset, et les discriminants évidents se contournent : une PR de fork peut
>   nommer sa branche `release-please--…`, et « seul `package.json` a changé » laisse passer une
>   devDep. Écrit ici pour ne pas la redécouvrir.
> - **E — afficher la commande de promotion au tag : écartée.** Au moment du tag, la CI du commit
>   de release n'a pas fini : la commande échouerait sur « absent », et l'échec actuel d'une
>   promotion prématurée est déjà rapide et explicite.
>
> Si #289 retient sa promotion par `sha-xxxxxxx`, la promotion n'exige plus de commit de release
> sur `main`, et A est à relire.

> **Tranché en [#506](https://github.com/Cimavia/cimavia/issues/506)** (couvrir l'API et
> `@cmv/shared` à 100 %, sans tricher sur ce qui ne s'atteint pas) : quatre règles que la
> prochaine montée en couverture (#507 à #509) reprend telles quelles.
>
> - **Aucun `v8 ignore`, aucun refactor en cours de route.** Une branche qu'aucune entrée ne peut
>   atteindre (repli `?? ""`, garde d'une clé étrangère, métadonnées de décorateur) est recensée
>   dans [#512](https://github.com/Cimavia/cimavia/issues/512), pas masquée. Elle ne sera supprimée
>   qu'une fois TOUTE l'application couverte : c'est le filet qui dira si l'invariant supposé
>   était vrai. La supprimer avant, c'est parier sans filet.
> - **L'e2e d'abord, l'unitaire pour ce que le HTTP n'atteint pas.** Une règle métier s'affirme
>   par la route qui l'expose, sur le contrat observable. L'unitaire ne sert qu'à ce qu'une base
>   saine et des e2e séquentiels ne produisent jamais : la panne d'une dépendance (Expo, SMTP, S3,
>   Postgres), une course (`P2002` entre deux ouvertures de fil), une variable d'environnement.
> - **L'extension tenant se teste en intégration, jamais sur un mock.** Ses refus et ses lectures
>   par clé unique (`findUnique`, `findUniqueOrThrow`, `upsert`) sont éprouvés dans les e2e contre
>   le vrai client `TENANT_PRISMA`, sous un vrai contexte CLS. Aucun service ne les appelle
>   aujourd'hui ; les couvrir quand même, c'est garder le fail-closed vivant pour le jour où l'un
>   s'en servira. Piège : une `PrismaPromise` est **paresseuse**, elle s'exécute hors du `cls.run`
>   si on la rend sans l'attendre — d'où le `await fn()` du helper de test.
> - **Un test qui ne sert qu'à la couverture est un test raté.** Chaque cas ajouté affirme ce que
>   l'utilisateur verrait casser : un 404 qui fuirait l'existence d'une ressource, une liste qui
>   garderait un tag retiré, un rappel qui annoncerait un retard que l'écran des factures ne montre
>   pas.

> **Tranché en [#507](https://github.com/Cimavia/cimavia/issues/507)** (couvrir la bibliothèque web,
> `apps/web/src/feature/library`) : les règles de #506 valent telles quelles ; cinq choix de plus,
> propres au rendu.
>
> - **#188 visait le rendu pur ; ici on monte le VRAI.** Les écrans passent par `renderInRoute`
>   avec les vrais hooks et les vraies clés de cache — seuls les appels de `api.ts` sont bouchonnés —,
>   et l'éditeur de consigne tourne sur le vrai TipTap. Ce que l'écran envoie au serveur est
>   l'affirmation : un geste sur une carte de séance se lit dans le `PUT`, pas dans un rappel
>   espionné. C'est ce qui attrape un branchement croisé (la note écrite sur la mauvaise ligne).
> - **Une seule suite pour le déplacement : `describeReorder` (`apps/web/test/reorder.tsx`).** Les
>   éditeurs qui réordonnent une liste passent tous la même suite de gestes — flèche, poignée au
>   clavier, glisser. Elle a servi d'arbitre à la fusion de leurs copies en
>   [#360](https://github.com/Cimavia/cimavia/issues/360). Le montage peut être asynchrone, pour les
>   écrans routés.
> - **Les gardes mortes vont à [#512](https://github.com/Cimavia/cimavia/issues/512)**, comme en
>   #506 : un bouton fermé que son `onClick` re-garde, un `moved == null` après un index borné, un
>   repli sur un attribut qui a un `default`. Quelques-unes n'apparaissent pas au rapport — v8 compte
>   couvert un opérande évalué, même jamais vrai : la liste de #512 suit le raisonnement, pas la
>   mesure.
> - **ProseMirror sous jsdom : trois bouchons de mise en page, rien de plus**
>   (`apps/web/test/prosemirror.ts`). `Range.getClientRects`, `getBoundingClientRect` et
>   `document.elementFromPoint` manquent à jsdom et ProseMirror les appelle pour faire défiler vers
>   la sélection. Ils rendent des rectangles vides : la sélection se pose au clavier
>   (`focus()` puis Ctrl+A), jamais par un clic sur la surface, qui chercherait une position à
>   l'écran.
> - **Au plafond de lignes, le bouton se cherche par son texte.** Sur une grille de 200 lignes,
>   `getByRole` parcourt tout l'arbre d'accessibilité et coûtait plus d'une seconde : le test
>   dépassait son délai sous couverture, la même panne que
>   [#455](https://github.com/Cimavia/cimavia/issues/455). `getByText(...).closest("button")` garde
>   l'affirmation (le bouton est fermé) pour 0,4 s.

> **Tranché en [#508](https://github.com/Cimavia/cimavia/issues/508)** (couvrir le web hors
> bibliothèque) : les règles de #506 et #507 valent telles quelles ; quatre choix de plus.
>
> - **Amendement de #188 : le rendu pur est visé aussi.** Q-4 laissait de côté les fichiers « qui
>   n'ont rien à affirmer ». Ils sont couverts, chacun par une affirmation que l'utilisateur verrait
>   casser (le « — » d'une donnée absente, la clé du bon statut, le lien de la bonne cible) : un
>   `render()` sans `expect` resterait le décor que refuse « Tranché en #58 ».
> - **#507 prime sur le « À faire » de #362.** L'issue demandait `PlanWeekCard` avec
>   `usePlanMutations` et `usePlanClipboard` mockés ; le test monte les vrais hooks, et c'est dans
>   la requête partie vers l'API qu'il lit le collage. Un `mutate` espionné ne verrait pas une
>   semaine source prise pour la cible.
> - **Les tests d'avant #507 qui mockent leurs hooks sont étendus, pas migrés.** `PlanBuilderScreen`,
>   `PlansScreen`, `FeedbacksScreen`, `InvoicesScreen`, `PlanBillingSection`,
>   `AthletePlanningScreen` et `AthleteSessionsScreen` gardent leur harnais : les réécrire aurait
>   doublé la PR sans rien couvrir de plus. Seuls `MessagesScreen` et `AccountScreen`, repris en
>   profondeur, passent aux vrais hooks. Les autres suivront quand on touchera à leur écran.
> - **Sous Vitest, le plugin HMR du routeur est retiré** (`apps/web/vitest.config.ts`). Il ajoute à
>   chaque fichier de `src/routes/` un bloc `import.meta.hot` absent du source, que v8 rattache à la
>   dernière ligne : Sonar comptait une ligne et trois conditions non couvertes par route, sur du
>   code qu'aucun test ne peut exécuter. Le générateur de l'arbre de routes, lui, reste en place.
>
> Quatorze bugs ouverts traversent ces écrans (#284, #326, #334, #339, #340, #342, #361, #364,
> #365, #366, #367, #371, #437, #485) : les tests les contournent sans figer le comportement
> fautif. Le Composer, par exemple, n'affirmait pas l'état de son champ après un envoi — c'est
> fait depuis #339.

> **Tranché en [#504](https://github.com/Cimavia/cimavia/issues/504)** (lever les issues Sonar
> de `main`) : l'issue en comptait 40 ; l'analyse du 30/09/2026 en affichait **83**. Les deux de
> `session-tracking.util.ts` étaient déjà levées par #499, et 45 venaient d'une mise à jour du
> profil intégré « Sonar way comprehensive », faite par SonarSource et non par nous : S9382 (35),
> S7503 (5), S9383 (4), S7786 (1). Toutes sont traitées ici, sauf une.
>
> - **Une S9383 est un vrai bug, sorti dans sa propre issue.** `video-thumbnail.ts` appelle
>   `saved.move(target)` sans l'attendre, or `File.move()` rend une promesse en SDK 56 (`moveSync`
>   est la variante synchrone) : l'URI part avant que le fichier existe, et un échec échappe au
>   `catch`. Le corriger change le comportement, ce que #504 s'interdit. Les trois autres S9383
>   (`i18n.init` web et mobile, `player.seekTo(0)`) ne changent rien une fois marquées `void`.
> - **Trois écarts vont dans `sonar-project.properties`, justifiés sur place** : S9382 partout (le
>   séquentiel est ici la règle, le parallélisme se décide au cas par cas), S6479 sur les deux
>   `CmvRichDocument` (l'ordre est la seule identité d'un nœud), S9379 sur l'éditeur de consigne
>   (même arbitrage que son `biome-ignore`). Aucun « Accepter » dans l'interface : il serait
>   invisible du dépôt.
> - **`trimTrailingSlashes` entre dans `@cmv/shared`** : la regex `/\/+$/` (S8786) était recopiée
>   dans les deux mailers et l'écran « mot de passe oublié ». Une boucle, testée une fois. Les deux
>   copies des tests mobiles (`document-cache`, `video-thumbnail`) restent : Sonar ne les analyse
>   pas, et elles nettoient des chemins de fichier bouchonnés, pas une origine.
> - **`CmvProgressBar` passe à `<progress>`** (S6819), dessiné par pseudo-éléments sur les tokens.
>   Un seul test est retouché, contre la règle « aucun test ne bouge » de l'issue :
>   `AttachmentsSection` lisait `aria-valuenow`, c'est-à-dire l'attribut porteur et non la valeur
>   annoncée. Il lit désormais `value`.
> - **Le hook `update.before` de Better Auth perd son `async`** (S7503) mais rend toujours une
>   promesse, que son type exige. Le refus part par `throw`, que le `await` de l'appelant reçoit
>   comme un rejet : les e2e de #310 le couvrent.

> **Tranché en [#901](https://github.com/Cimavia/cimavia/issues/901)** (le gate de `main` rouge
> sur la release 1.19.0) : 54 S9383 sur du code d'août à novembre, que **aucune PR n'avait vues**.
> Une analyse de PR ne juge que ses lignes, et `main` n'est analysé qu'au commit de release
> (#318) : une règle élargie par SonarSource entre deux releases ne se révèle qu'à la release
> suivante, sur un commit qu'aucune relance ne repeint. Même scénario qu'en #504.
>
> - **Les 54 marquées `void`, sans changement de comportement** : 48 `invalidateQueries`, 5
>   `refetch` et un `navigate`. TanStack Query ne rejette ni l'un ni l'autre par défaut
>   (`throwOnError: false`), la navigation était déjà marquée ainsi en #897.
> - **Commits en `fix`**, pour que release-please ouvre la 1.19.1 : la 1.19.0 n'est pas promue.
> - **Biome `nursery/noFloatingPromises` en voit 49** (pas les `refetch`) : l'activer dans la porte
>   locale est une décision distincte, non prise ici.

> **Tranché en [#512](https://github.com/Cimavia/cimavia/issues/512)** (supprimer les gardes
> mortes recensées par #506 à #509, une fois toute l'application couverte) : un invariant se
> prouve par le TYPE quand il le peut, sinon il LÈVE — jamais un repli qui le déguiserait.
>
> - **Le type d'abord.** Quand l'appelant tient déjà la donnée, une surcharge le dit :
>   `formatTrainingDuration`, `buildPlanAthleteRows` et `weekSessionProgress` rendent une valeur
>   non nulle sur une entrée non nulle. `InvoiceAthleteRow.invoices` devient un tuple non vide,
>   `AthleteRowPlan.phase` et `endDate` ne sont plus nullables, et `MediaBatch` est générique sur le
>   nom de fichier — le web, dont chaque `File` est nommé, n'a plus de « fichier sans nom » (ses
>   deux clés `unnamedFile` sont retirées, le mobile garde les siennes).
> - **Sinon `required(value, invariant)`** (`@cmv/shared`), une seule fonction testée : une garde
>   locale qu'aucune entrée n'atteint resterait une branche que rien ne couvre. Côté API, ce qui
>   répondait 400 ou 404 sur un invariant violé (la ligne relue après écriture, les parts d'un
>   envoi découpé) répond désormais **500** : c'est un bug, pas une requête fautive, et Sentry le
>   remonte.
> - **Quatre entrées se sont révélées vivantes : gardées, et testées.** La garde de plafond de
>   `toggleCustom` (`MetricPicker`), que la création d'une métrique maison traverse bloc plein ;
>   `messages.data ?? []` (`ConversationThread` mobile), lu par les hooks pendant le chargement ;
>   le nom du coach sur le tableau de bord, absent quand la session tombe sous un écran que
>   `CmvRoleGate` garde monté (#336) ; le `default` de `route.util` mobile, qu'atteint une app plus
>   ancienne que l'API.
> - **Trois branches mortes restent, assumées.** Les **14 métadonnées de décorateur**
>   (`typeof X === "undefined"`) de l'API : le transformateur de Vitest les produit, le build `tsc`
>   ne les émet pas — rien à supprimer dans le source. Le `label == null` de `reminder-tick` et le
>   `catch` de la file des vignettes vidéo (mobile) : lever y bloquerait pour toujours le tick de
>   TOUS les coachs, ou la file de toutes les vignettes, pour une seule ligne corrompue.
> - **Des tests sont retirés avec l'état qu'ils décrivaient** : le cycle « non situable » d'une
>   ligne d'athlète (irreprésentable depuis que `phase` ne l'est plus), le fichier sans nom du web.
>   Le déplacement d'une ligne depuis une position hors liste n'est plus garanti « même tableau »,
>   seulement « même ordre » — aucun appelant ne la passe.
> - **`CmvBox` (web) et `CmvView` (mobile) sont supprimés** : exportés, jamais appelés.
>
> Hors de cette PR, comme l'issue le prévoyait : les cas dormants jusqu'à la v1.0
> (`invoice.mapper`, `planId` nul ; `invoice.service`), `joinedAt ?? null` de
> `coach-athlete.mapper`, vivant sur une invitation `PENDING`, `LibraryPicker` et sa route (#303),
> les chips de minuteur mobile (#519, supprimées depuis en #723).

> **Tranché en [#360](https://github.com/Cimavia/cimavia/issues/360)** (le déplacement d'élément
> n'a plus qu'une définition) : `movedItem` (`@cmv/shared`, `list.util.ts`) rend **`null` quand
> rien ne bouge** — un rang hors liste, ou un élément déposé sur lui-même —, et non plus une copie
> inchangée.
>
> - **Pourquoi `null`** : chaque éditeur doit NE RIEN ÉCRIRE pour un geste sans effet. Avec une
>   copie, il re-gardait les bornes lui-même avant d'appeler la fonction, et les gardes avaient
>   divergé (deux copies sur sept testaient `from === to`). Le `null` rassemble la garde, et le
>   typage interdit à l'appelant de l'oublier. Un état React rend `current` (`?? current`) : React
>   n'en redessine rien.
> - **Les appelants** : la grille d'un exercice de bloc, les colonnes de métriques, les paliers
>   d'une échelle et les blocs d'une séance, tous éprouvés par `describeReorder` ; la branche
>   « même jour » de `dayAfterDrop`, par ses propres tests — c'est elle, pas l'écran du cycle, qui
>   décide qu'un geste sans effet n'écrit rien. La branche « autre jour » reste une insertion, pas
>   un déplacement.
> - **Les cinq autres copies** de l'issue étaient parties avec la refonte par blocs, avec le second
>   point (partager deux grilles qu'une seule a remplacées).

> **Tranché en [#387](https://github.com/Cimavia/cimavia/issues/387)** (400 lignes est un signal,
> pas une règle) : aucune garde ne compte les lignes d'un fichier, et vingt-huit fichiers de code
> hors tests le dépassent encore, ce découpage fait (2026-11-20). Le seuil invite à relire, pas à
> découper.
>
> - **On découpe par responsabilité**, quand on touche un chemin fragile, jamais pour passer sous
>   le seuil. Un service se coupe au long de ses gestes : la diffusion d'un cycle, ses semaines, la
>   journée d'un planning. Un écran se coupe au long de ses sections.
> - **Ce que #387 a sorti** :
>   - côté séance planifiée : la copie de la séance-type (`scheduled-session.draft.ts`), le contenu
>     d'une journée (`ScheduledDayService`) et ses deux gardes (`scheduled-day.rules.ts`) ;
>   - côté cycle : `PlanWeekService`, `PlanPublishService`, les écritures du calendrier
>     (`plan-week.writer.ts`) et la propagation du destinataire (`plan.recipient.ts`) ;
>   - côté web : la section médias et le rail d'envoi du débrief athlète.
> - **Pas de garde automatique** : elle ferait découper vingt-huit fichiers d'un coup, ou les
>   exempter un par un, sans qu'aucun ne soit plus lisible pour autant.

---

## Post-MVP — Protections du dépôt public ([#397](https://github.com/Cimavia/cimavia/issues/397) · [#398](https://github.com/Cimavia/cimavia/issues/398))

> **Découvert en #397** (la clé Firebase n'était pas restreinte) : l'activation de *Secret
> Protection* a remonté la clé d'API de `apps/mobile/google-services.json`, versionnée depuis
> juillet. `CONTRIBUTING.md` la disait « restreinte au package et à l'empreinte de signature » ;
> Google Cloud Console montrait **aucune** restriction d'application, et une restriction d'API
> ouverte aux 25 API Firebase du projet (Firestore, Identity Toolkit, Remote Config…). Une doc qui
> affirme une protection sans que rien ne la vérifie est pire que pas de doc : c'est elle qui avait
> justifié de versionner le fichier.
>
> **Tranché en #397** (restriction d'API, pas d'application) : la clé n'ouvre plus que Firebase
> Installations API et FCM Registration API — l'app n'utilise Firebase que pour le token push
> (`getExpoPushTokenAsync`, `usePushToken.ts`), l'envoi passant par le compte de service FCM V1
> chez Expo, pas par cette clé. La restriction par application Android est écartée : le package et
> l'empreinte SHA-1 voyagent en en-têtes que n'importe qui peut recopier depuis un APK, et une
> empreinte manquante sur l'une des trois variantes couperait son push sans aucune erreur visible.
> Contrepartie : une future fonctionnalité Firebase côté app échouera tant que son API n'est pas
> ajoutée à la liste (`CONTRIBUTING.md`, « Identifiants de build mobile »).

> **Tranché en [#398](https://github.com/Cimavia/cimavia/issues/398)** (vulnérabilités des
> dépendances) : `pnpm audit --prod` remontait 49 high, il en reste 3 et 4 moderate. Trois
> décisions que le code ne dit pas seul :
>
> - **Le critère n'est pas « zéro alerte »** mais « aucune alerte atteignable depuis le code
>   exécuté ». Ce qui reste est rejeté dans Dependabot avec sa raison : `deepmerge-ts`
>   (`@prisma/config`), `image-size`, `uuid` et `decode-uri-component` (chaîne Expo de l'API, P7-1)
>   ne se corrigent qu'en changeant de majeure ; les deux moderate de `fastify` supposent
>   `trustProxy`, que l'API ne règle pas, ou une validation par schéma Fastify, qu'elle ne fait pas
>   (Zod) — et c'est Nest qui l'épingle.
> - **Les dépendances transitives se corrigent par `overrides`** dans `pnpm-workspace.yaml`, bornés
>   à la majeure vulnérable : `pnpm up --depth Infinity` ne les remonte pas (essayé : `undici`
>   restait en 7.28.0, et metro bougeait). `fastify` en est exclu : c'est le serveur HTTP, il suit
>   Nest. `turbo prune` recopie le bloc, l'image API s'installe en `--frozen-lockfile`.
> - **La CI n'échoue pas sur `pnpm audit`.** Avec les alertes Dependabot actives depuis #397, un
>   tel check doublerait le filet et bloquerait une PR sans rapport le jour où une CVE sort.
>
> Découvert en chemin : `@fastify/static`, que l'issue disait inutilisé, sert le Swagger UI de
> `/docs` (fermé dans toute image, mais indispensable en local), et `mysql2` vient du CLI `prisma`,
> pas de better-auth.

> **Tranché en [#671](https://github.com/Cimavia/cimavia/issues/671)** (NestJS 12) : la pile Nest
> monte d'un bloc, à la main : les versions qu'on avait de `nestjs-pino`, `nestjs-cls`,
> `@nestjs/config` et `@thallesp/nestjs-better-auth` refusaient Nest 12, et `@nestjs/swagger` 12
> refuse Nest 11. Les nouvelles versions des quatre premiers acceptent les deux : un retour arrière
> ne concernerait que Nest et Swagger. Dependabot ne proposait que la CLI (#589) ; il regroupe
> désormais les majeures de la pile (`.github/dependabot.yml`, groupe `nestjs`), comme Sentry en
> #669. `fastify` suit Nest, comme le voulait #398 : la 5.12.5 arrive avec `platform-fastify`
> 12.1.3, et `js-yaml` 5.4.2 avec `@nestjs/swagger` 12, sans override.
>
> - **L'API reste en CommonJS.** Nest 12 n'est publié qu'en ESM : `tsc` compile toujours en
>   CommonJS, et Node charge Nest par `require(esm)`, actif sans drapeau depuis 22.12. **Seul
>   `node dist/main` passe par ce chemin** : le reste de la suite, sous Vitest, importe Nest en ESM
>   natif. D'où `test/compiled-dist.e2e-spec.ts`, qui lance le `dist` (construit par Turbo avant
>   les e2e, `apps/api/turbo.json`) sur un faux Sentry : une lecture scopée au Coach doit répondre,
>   et les spans Nest partir — démarrage, gardes, intercepteur, filtre. Charger Nest avant
>   `instrument` le fait tomber. Passer l'API en ESM est un autre sujet, que Nest laisse
>   optionnel.
> - **`engines` devient `^22.22.3 || ^24.15.0 || >=26.0.0`**, la plage de `@nestjs/schematics` 12
>   (son Angular devkit) ; `@thallesp/nestjs-better-auth` exigeait déjà 22.22.1 sans que `engines`
>   le dise. pnpm n'en fait qu'un avertissement (pas d'`engine-strict`) : un poste ou un build EAS
>   plus ancien installe toujours.
> - **Les pipes Zod restent les nôtres**, pas le `StandardSchemaValidationPipe` de Nest 12 : la
>   montée garde le comportement, et le pipe de Nest perdrait le contrat des 400 — `{ path,
>   message }`, en français (#319).
> - **`@fastify/cors` n'est plus une dépendance directe** : rien ne l'importait, et
>   `platform-fastify` embarque la sienne.

> **Tranché en [#670](https://github.com/Cimavia/cimavia/issues/670)** (alertes Dependabot sans
> PR) : vingt alertes, toutes transitives. Six paquets passent par un override, et il reste trois
> rejets en plus de ceux de #398. Ce que le code ne dit pas seul :
>
> - **Un correctif publié dans la majeure s'applique, même hors d'atteinte.** `seroval`, seul
>   paquet du lot à entrer dans le runtime du web, n'atteint pas le bundle : sa (dé)sérialisation ne
>   sert qu'au rendu serveur du routeur, et les sourcemaps du `vite build` n'en contiennent aucun
>   fichier. L'override coûte une ligne ; l'atteignabilité ne départage que les cas sans correctif.
> - **Override plutôt que montée du routeur**, qui tire `seroval ^1.6.7` dans ses dernières
>   versions : monter le routeur, c'est le travail de la PR groupée de Dependabot. L'override
>   devient alors inopérant, et part.
> - **Rejetés** : `postcss-selector-parser` (correctif en 7, Tailwind 3 exige la 6 : attend
>   Tailwind 4), `braces` et `node-forge` (aucun correctif publié ; build, metro et `@expo/cli`).
>   Les alertes `fastify` et `js-yaml` du relevé se sont fermées seules avec #671.
> - **Rejet levé en [#753](https://github.com/Cimavia/cimavia/issues/753)** pour
>   `postcss-selector-parser` : la 6.1.5, publiée le 2026-10-19 après cet arbitrage, corrige la
>   faille dans la majeure qu'exige Tailwind 3. Elle passe par un override, comme le veut #398 ;
>   #734 avait repris le rejet sans le revérifier.
>
> Découvert en chemin : la PR groupée `npm` ne s'ouvre plus parce que le passage du 2026-10-19
> échoue sur chaque paquet, `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Dependabot transmet son
> `cooldown` à pnpm, et le lockfile porte `@sentry/nestjs` et `@sentry/profiling-node` 11.8.0,
> publiés le 2026-10-15 et montés à la main en #669. Le blocage se lève seul le 2026-10-22 ; la
> règle est désormais dans `CONTRIBUTING.md` (« Mises à jour des dépendances »).

> **Tranché en [#734](https://github.com/Cimavia/cimavia/issues/734)** (pnpm 10.34.9, et les PR
> Dependabot en souffrance reprises d'un bloc, ferme aussi
> [#479](https://github.com/Cimavia/cimavia/issues/479)) : le groupe `npm` (#740) échouait, vitest 5
> (#742) et le runner Stryker 10 (#741) arrivaient seuls. Ce que le code ne dit pas seul :
>
> - **Repris à la main, aux versions qu'avait choisies Dependabot**, pas aux dernières : son
>   `cooldown` les avait déjà filtrées. Seul Stryker passe en 10.1.1 (publiée le 2026-10-23), pour
>   que `core` et runner, qui s'exigent à la version exacte, avancent ensemble.
> - **Deux groupes de plus**, `vitest` et `stryker`, majeures comprises, sur le modèle de Sentry
>   (#669) et Nest (#671) : `@vitest/coverage-v8` exige le `vitest` de sa version, le runner le
>   `core` de la sienne. Seul, vitest 5 cassait chaque suite ; seul, le runner 10 passait la CI
>   avec un `core` qu'il refuse.
> - **Stryker 10 lève la réserve de #626** (plus bas) : sa Babel 8 n'atteint plus le mobile, qui
>   déclare désormais son `@babel/core` 7. Sans cette ligne, `auto-install-peers` donnait au
>   `react-native` du mobile la plus haute Babel du workspace — la 8. Les majeures de `@babel/*`
>   sont ignorées par Dependabot : elles suivent la chaîne Expo.
> - **Better Auth 1.7, une mineure qui casse** : `getCookie()` d'Expo devient asynchrone (SecureStore
>   lu sans bloquer), d'où des en-têtes asynchrones dans le client de `@cmv/shared`. Ses autres
>   ruptures ne nous touchent pas : `baseURL` est statique, et les colonnes `issuer` /
>   `grantedScopes` ne concernent que les plugins SSO et OAuth, que l'API n'installe pas.
> - **TanStack Router 1.170.45 navigue dans un `startTransition`.** Une recherche relue dans l'URL
>   perdait des frappes (« bel » tapé vite devenait « l ») : les trois barres liées à `?q=` tiennent
>   leur texte (`useUrlSearchText`), et l'URL le suit. Une URL rendue ne l'écrase que si elle a
>   rattrapé `latestLocation`, que le routeur avance dès la navigation : sinon c'est un écho en
>   retard. Et toute navigation qui recopie le reste de l'URL part de `prev`, jamais du dernier
>   rendu — un segment cliqué juste après une frappe ramenait la recherche d'avant.
> - **Revue des overrides** : dix-neuf ne visaient plus rien et partent, quatre restent (bornes
>   relevées pour `undici`, `qs`, `fast-uri`), `node-forge` entre — son correctif 1.4.1 est publié.
>   Ce qui exige une majeure (`zod` 3, `glob` 13, `minimatch` de l'outillage) rejoint les rejets.
> - **Les Dockerfiles lisent pnpm et turbo** dans `package.json` (#479), par un étage `versions`
>   qui n'en garde que ces deux valeurs : la release, qui change `version` à chaque fois,
>   n'invalide plus l'installation. Une version non exacte fait échouer le build.
> - **Les patchs du SDK Expo montent aussi** (`expo` 56.0.24 et sept autres, ceux que réclame
>   `expo install --check`), chacun gardant son épinglage, exact ou `~`. Ils n'arrivent jamais
>   par Dependabot, qui ignore la chaîne Expo. `expo-updates` en fait partie : l'empreinte du
>   runtime change, et le prochain déploiement mobile demande un build EAS, pas un `eas update`.
>   Au passage, `xcode` et le `uuid` vulnérable quittent l'arbre.

> **Tranché en [#401](https://github.com/Cimavia/cimavia/issues/401)** (audit des workflows,
> ferme [#385](https://github.com/Cimavia/cimavia/issues/385)) : zizmor ne relève plus rien, même
> en mode `pedantic`, hors deux exceptions posées à la ligne. Ce que le code ne dit pas seul :
>
> - **Pas un check requis.** Une nouvelle version de zizmor ajoute des audits ; en faire une porte
>   bloquerait une PR sans rapport le jour de sa sortie. Les constats vivent dans Code scanning,
>   annotés sur la PR — même raisonnement que `pnpm audit` en #398.
> - **Les deux exceptions** : le checkout de `publish` (`promote-preview.yml`) garde son jeton parce
>   que l'étape suivante pousse `preview` avec lui ; `api-image.yml` n'a pas de `concurrency`
>   parce qu'annuler un build pouvait perdre l'image `X.Y.Z` de la release.
> - **Le jeton de l'App est restreint dans le workflow**, pas seulement par les réglages de l'App :
>   un droit ajouté plus tard à l'App ne s'étendrait pas en silence aux jobs existants.
> - **Cooldown Dependabot de 7 jours** sur les actions : une action compromise est en général
>   retirée dans ce délai. Les mises à jour de sécurité ne l'attendent pas.
>
> Découvert en chemin : `pnpm/action-setup` était épinglé sur le SHA de l'**objet tag annoté**
> `v4`, pas sur un commit. Même code exécuté, mais aucun outil ne pouvait vérifier la version
> annoncée en commentaire.

> **Tranché en [#413](https://github.com/Cimavia/cimavia/issues/413)** (setup commun, délais,
> runner) :
>
> - **Runner épinglé sur `ubuntu-26.04`**, pas `ubuntu-latest`. GitHub bascule `ubuntu-latest`
>   vers 26.04 entre le 19 octobre et le 19 novembre 2026
>   ([runner-images#14748](https://github.com/actions/runner-images/issues/14748)) : la bascule
>   se fait ici, dans une PR que la CI teste, plutôt qu'un jour non choisi. Contrepartie : plus
>   rien ne fera avancer la version seul. **Déclencheur** de la prochaine montée : l'annonce de
>   fin de support de 26.04 dans `actions/runner-images`.
> - **`timeout-minutes` à ~3× la durée observée**, la mesure en commentaire : c'est un plafond
>   contre le job bloqué (six heures par défaut), pas une cible. Plus serré, un cache froid ou un
>   runner lent ferait échouer un check requis sans raison.
> - **Plus de `DATABASE_URL` factice en CI.** Le commentaire de `ci.yml` affirmait que
>   `prisma generate` exigeait la variable ; c'était faux depuis `61d7a38` (2026-07-17), qui a
>   fait retomber `prisma.config.ts` sur une URL vide. Le piège des e2e — un DSN de job masquant
>   celui de `.env.test` — disparaît avec lui.
>
> Découvert en chemin : l'issue supposait que Dependabot suivait `.github/actions/**` depuis
> `directory: "/"`. Faux — `/` ne couvre que `.github/workflows` et un `action.yml` racine ; il a
> fallu `directories`. Et `actionlint` (1.7.12, dernière version) ne connaît ni la syntaxe `$/`
> ni l'étiquette `ubuntu-26.04` : ses erreurs sur ces deux points sont à ignorer tant qu'il n'a
> pas rattrapé GitHub.

> **Tranché en [#416](https://github.com/Cimavia/cimavia/issues/416)** (commitlint en CI) : une
> étape du job `quality`, sur `pull_request`, de la base de la PR à sa tête. `.commitlintrc.json`
> n'y est **pas** touché — il l'est en [#667](https://github.com/Cimavia/cimavia/issues/667) :
>
> - **Les bornes de ligne du corps, gardées en #416, coupées en #667.** L'issue prévoyait de couper
>   `body-max-line-length` et `footer-max-line-length`, sur la foi de lignes de 113 à 151
>   caractères dans le corps des commits Dependabot. Mesurées à la règle, pas en lançant
>   commitlint : celui-ci exempte toute ligne qui contient une URL (`@commitlint/ensure`), et ce
>   sont toutes des liens. Passés à la config d'alors, #436, #135, les PR de sécurité #419 à #425
>   et la release #432 sortaient sans un seul problème. **Déclencheur** : le premier corps de robot
>   refusé en CI — on coupe alors ces deux règles, nos commits n'ayant pas de corps. **Atteint par
>   #658** : un groupe docker-compose sur deux dossiers écrit une phrase de 127 caractères sans
>   lien (`Bumps the docker-compose group with 2 updates in the /deploy/preview directory: …`).
>   Les deux règles valent `[0]` ; rejoué sur ce message, commitlint sort en 0.
> - **Écart accepté : `subject-case` sur une mise à jour de sécurité d'action.** Elles ne sont pas
>   groupées, et leur sujet reprend le nom du paquet : `ci: bump SonarSource/sonarqube-scan-action …`
>   est refusé (vérifié). C'est la seule action du dépôt à majuscule ; les noms npm et docker sont
>   en minuscules. Remède : fermer la PR et faire le bump à la main (`CONTRIBUTING.md`, « Commits »).
>   Ignorer les commits de `dependabot[bot]` reste écarté : une exception par robot, à rallonger
>   au suivant.

> **Tranché en [#415](https://github.com/Cimavia/cimavia/issues/415)** (l'image de l'API démarre
> avant de recevoir son numéro) : `api-image.yml` pousse `sha-*`, démarre ce digest sur la base
> jetable des e2e, attend `healthy` puis `/health/ready`, et ne pose `X.Y.Z` qu'ensuite. La
> promotion n'a pas changé : elle refusait déjà une version sans ce tag.
>
> - **L'image tirée de GHCR par son digest**, pas celle du cache du builder : c'est l'artefact que
>   le numéro désignera, donc celui qui doit avoir démarré.
> - **Sur chaque build, pas seulement le bump.** Une image `sha-*` qui échoue reste publiée : le
>   run rouge sur `main` est le signal, et sans numéro elle ne peut pas être promue.
> - **La sonde de l'image est surchargée en intervalle (3 s), pas en commande** : c'est bien sa
>   `HEALTHCHECK` qui est jugée, sans attendre 30 s son premier passage.
> - **Un seul job**, dans le workflow existant : le smoke n'est pas un check lu par la promotion,
>   c'est la condition du tag. Toujours pas de `concurrency` (« Tranché en #266 »).
>
> Limite assumée : la base part de zéro. Le smoke attrape l'image qui ne démarre pas, pas la
> migration qui échoue sur le schéma et les données du NAS — ça reste la restauration de #268 et
> une vraie recette. Si #84 sort les migrations de l'entrypoint, le smoke devra jouer l'étape de
> migration avant de démarrer l'API.

> **Tranché en [#414](https://github.com/Cimavia/cimavia/issues/414)** (builds de production sur
> les PR) : un job *Builds de production* dans `ci.yml` construit l'image API, l'image web et
> l'export Expo android, chacun seulement si la PR touche l'app ou ce qu'elle consomme.
>
> - **Check requis, filtré par étape.** Le job tourne toujours ; ce sont ses étapes qui se sautent.
>   Un filtre `on.pull_request.paths` laisserait un check requis en attente pour toujours sur une
>   PR de documentation, et un `if:` de job obligerait à un second job de détection.
> - **Le cache de `main` lu, jamais écrit** par une PR : elle ne doit pas pouvoir empoisonner les
>   couches que `api-image.yml` et la promotion réutilisent.
> - **Un scope de cache par image** (`api`, `web`). Découvert en chemin : les deux écrivaient le
>   même index `buildkit` (le défaut), et le dernier à écrire effaçait l'autre — la promotion
>   reconstruisait le web à froid, et une PR aurait lu l'index de l'API pour construire le web.
> - **Pas de smoke test ici** : il porte sur l'image publiée (#415), une PR ne publie rien.
>
> `promote-preview.yml` n'exige pas ce check : il lit le commit de `main`, où ce job ne tourne pas.
> Ce qui protège la promotion côté API reste #415.

> **Tranché en [#379](https://github.com/Cimavia/cimavia/issues/379)** (images figées) : nginx
> passe sur `nginx-unprivileged` (ferme #83), toute image tirée est épinglée par digest, et
> Dependabot couvre les quatre écosystèmes du dépôt.
>
> - **Port 8080, sans relais par le port 80.** Écouter sous 1024 sans root demanderait une
>   capacité ou un sysctl sur le NAS, soit ce que l'image sans root veut éviter. Le prix : une
>   action NON versionnée, le service du hostname `app-preview` passé à `http://web:8080` dans
>   Cloudflare, au moment où le NAS tire la première version qui la contient (runbook du tier).
> - **Branche `stable` de nginx, pas `mainline`.** C'est parce que la mainline 1.27 s'est close
>   sans bruit que le tag ne bougeait plus : `stable` vit un an, et Dependabot propose la suivante.
> - **Digest ET tag**, jamais le digest seul : le tag dit à la relecture ce qui tourne, le digest
>   garantit que c'est encore vrai. Dependabot réécrit les deux ensemble.
> - **Les paquets du mobile sont ignorés par Dependabot `npm`** (Expo, React Native, `react`,
>   `react-dom` — celui du web compris, faute d'ignore par dossier). Ils avancent ensemble par
>   `expo install --fix` : un bump isolé désaligne le SDK. L'ignore ne coupe que les mises à jour
>   de version, les alertes de sécurité continuent d'arriver.
> - **Majeures de `postgres` ignorées** : le volume du NAS est dans le format de la majeure en
>   cours. Une montée passe par `pg_upgrade` ou une restauration (#268), pas par une PR.
> - **`minor` + `patch` groupés, `major` une par une**, avec 7 jours de `cooldown` : #135 est
>   restée ouverte six semaines parce qu'un groupe unique mêlait correctifs et majeures.
> - **Les derniers restes du nom `dev` du tier partent** (commentaires, repli `deploy/dev/` de
>   `pull-preview.sh` — toute version depuis v1.5.3 a `deploy/preview/`, et une promotion ne
>   revient jamais en arrière). Restent, à dessein : les volumes `cimavia-dev_*` (« Tranché en
>   #271 »), et tout ce qui désigne le développement LOCAL (identifiants `cimavia_dev_*`, variante
>   mobile `development`).

> **Tranché en [#399](https://github.com/Cimavia/cimavia/issues/399)** (Trivy) : l'image de l'API
> est scannée à chaque build, l'image web à chaque promotion, et chaque semaine les images qui
> tournent sur le NAS et les Dockerfiles. Ce que le code ne dit pas seul :
>
> - **Il alerte, il ne bloque pas.** Les constats vont dans Code scanning, aucun check n'est
>   requis. Bloquer `api-image.yml` sur une faille empêcherait aussi de publier le correctif d'une
>   autre ; même raisonnement que `pnpm audit` (#398) et zizmor (#401).
> - **Ni `trivy-action` ni `setup-trivy`.** Leurs tags ont été réécrits en mars 2026 pour voler
>   les secrets des CI (GHSA-69fq-xp46-6x23), depuis le processus de l'action. L'image officielle,
>   épinglée par digest et signée (cosign vérifié), tourne par `docker run` sans jeton, sans socket
>   Docker ni capacité : une version compromise n'aurait rien à voler. Les images de l'API et du
>   web étant **privées** (l'issue les supposait publiques), le jeton `packages: read` sert à les
>   tirer, puis est retiré avant que Trivy ne démarre. Le digest vit dans
>   `.github/actions/trivy-scan/Dockerfile`, jamais construit, pour que Dependabot le suive avec
>   son `cooldown`.
> - **`app/node_modules` n'est pas relu dans l'image de l'API** : Dependabot suit ces dépendances,
>   et ses rejets motivés (#398 : `deepmerge-ts`, `image-size`) devraient sinon être recopiés dans
>   `.trivyignore.yaml`, deux listes qui divergeraient. Trivy garde ce que Dependabot ne voit pas.
> - **Le runtime de l'API n'embarque plus npm, corepack ni yarn** (ni le pnpm de l'étage de
>   build) : c'était 18 des 21 failles corrigeables du premier scan, dans des outils que l'API ne
>   lance jamais et que npm, livré avec node, ne laissait pas corriger par une PR.
> - **Pas de SBOM ni d'attestation de provenance** : personne ne les vérifie au tirage
>   (`pull-preview.sh` ne les lit pas). **Déclencheur** : le premier tirage qui les vérifie, le
>   workflow de production le plus probablement.
> - **Snyk écarté** (2026-09-23) : dépendances, code et conteneurs font doublon avec Dependabot,
>   SonarCloud, CodeQL et Trivy ; palier gratuit plafonné ; un compte SaaS américain qui reçoit le
>   code (Snyk Code), à rebours de la trajectoire de #259. Son vrai plus, la priorisation par
>   atteignabilité, est payant et superflu à cette échelle.
>
> Écarts assumés : `trivy config` ne lit pas les **composes** — leur durcissement (utilisateur,
> capacités) n'est vérifié par aucun outil. **PostgreSQL et cloudflared** ne sont pas scannés :
> leurs constats (le Go embarqué de `gosu`, les modules de cloudflared) ne se corrigent qu'en
> montant l'image, ce que Dependabot propose déjà.
>
> Découvert en chemin : **pnpm 10.34.4**, épinglé partout, a des failles HIGH corrigées en
> 10.34.5 depuis le 2026-07-10 — montée faite en [#452](https://github.com/Cimavia/cimavia/issues/452).

> **Tranché en [#400](https://github.com/Cimavia/cimavia/issues/400)** (CodeQL) : le *default
> setup* reste, sans workflow dans le dépôt. Aucun fichier ne le montre, d'où cet encadré :
>
> - **Réglages** : suite `default`, modèle de menace `remote`, langages `actions` et
>   `javascript-typescript`, sur chaque PR, sur `main` et chaque semaine.
> - **Pas d'*advanced setup*** : la première vague, 2 alertes sur 104 règles, était entièrement
>   réelle (#385 pour la n°1, `check-i18n-keys.mjs` pour la n°2). Sans bruit, un `paths-ignore`
>   n'a rien à retirer, et un workflow de plus serait à épingler et à relire par zizmor pour rien.
>   **Déclencheur** : des alertes sur `dist/` ou du code généré, ou le besoin de requêtes maison.
>   Avant d'en arriver là, essayer la suite `security-extended`, qui se règle dans l'interface.
> - **Aucun check requis, mais une alerte bloque quand même le merge** : pas de règle *code
>   scanning* dans le ruleset `Main`, et le check `CodeQL`, rouge sur une nouvelle alerte, n'est pas
>   requis. Seulement, l'alerte arrive aussi en commentaire de revue sur la ligne fautive, et le
>   ruleset exige que les conversations soient résolues (`required_review_thread_resolution`).
>   Elle se **traite** donc avant le merge : corrigée, ou rejetée avec son motif dans l'onglet
>   *Security* (« Used in tests », « False positive »…) — pas en résolvant la conversation seule,
>   qui laisserait l'alerte ouverte. *Corrigé le 2026-09-27* : cet encadré disait « il alerte, il ne
>   bloque pas », démenti par #459, bloquée par une alerte sur `sentry.config.test.ts`.
>
> Écarts assumés : les règles de sécurité de SonarCloud font en partie doublon, et c'est accepté,
> car les deux moteurs ne trouvent pas les mêmes failles (aucune de #293, #324 ou #352 n'avait été
> vue par Sonar). CodeQL ne remplace pas les e2e d'isolation (règle dure n°1, #325) : il ne sait
> pas ce qu'est un tenant.

> **Tranché en [#461](https://github.com/Cimavia/cimavia/issues/461)** (qui suit pnpm) :
> `pnpm-version.yml` compare chaque lundi `packageManager` au dist-tag `latest-<majeure>` du
> registre npm, et ouvre `[pnpm-version]` en cas de retard. Il comble l'angle mort découvert en
> #452 : ni Dependabot, ni ses alertes, ni Trivy ne voient pnpm.
>
> - **Un workflow à part**, et non un job de `mirror-images.yml` : celui-là porte
>   `packages: write`, alors que ce contrôle n'a besoin que de `contents: read` et `issues: write`.
> - **La majeure en cours seulement** : une majeure change le format du lockfile, c'est une
>   décision, pas un retard.
> - **Pas de délai avant de signaler**, contrairement au `cooldown` de 7 jours de Dependabot : c'est
>   une issue, pas une PR. Elle donne la date de publication pour appliquer la même règle à la
>   main, sauf correctif de sécurité, qui n'attend pas.
> - **Échec plutôt que silence** : un dist-tag introuvable fait rougir le job au lieu de conclure
>   « à jour ».
> - **La liste des endroits à monter n'est pas écrite dans l'issue** : l'issue donne un `git grep`
>   de la version en place. Une liste recopiée vieillirait, et #479 va la réduire.
>
> Écarts assumés : les **avis de sécurité** de pnpm ne sont pas lus, seul le retard de version
> l'est. Un correctif passe toujours par une nouvelle version, et un avis sans version corrigée ne
> donne rien à monter. L'issue ouverte automatiquement **n'arrive pas sur le board**, comme
> `[silo-version]`, parce que le `GITHUB_TOKEN` ne peut pas écrire dans un Project v2 : à y poser à
> la main.
>
> Appris en chemin : `mirror-images.yml` cherchait l'issue `[silo-version]` déjà ouverte sur la
> première page seulement (100 issues). Le dépôt en a 161 d'ouvertes : sorti de cette page, le
> lundi suivant aurait ouvert un doublon. Les deux workflows paginent désormais.

> **Tranché en [#683](https://github.com/Cimavia/cimavia/issues/683)** (les tests sur des jobs
> parallèles) : l'étape *Test* de `quality` prenait 300 à 355 s, et Sonar l'attendait. Les quatre
> suites Vitest tournaient sous un seul `turbo test`, chacune avec ses workers, sur les 4 vCPU du
> runner.
>
> - **Quatre jobs, un agrégateur.** `lint`, `test-web`, `test-mobile` et `test-autres` tournent en
>   parallèle ; `quality` garde le nom « Lint + Typecheck + Test », que le ruleset `Main` et
>   `promote-preview.yml` lisent tels quels. Il tourne en `if: !cancelled()` et lit
>   `needs.*.result` : un check requis **sauté** compte comme réussi pour GitHub, et l'échec d'un
>   job de tests saute aussi `sonarcloud`. Sans cette lecture, un test rouge laissait la PR
>   mergeable.
> - **`test-autres` filtre par exclusion** (`!@cmv/web`, `!@cmv/mobile`) : un nouveau paquet testé
>   y tourne d'office. Son lcov reste à déclarer, dans l'upload du job et dans
>   `sonar-project.properties`.
> - **Un téléchargement par artefact, pas `pattern: coverage-*`.** Le motif range chaque artefact
>   sous un dossier à son nom, et un lcov envoyé seul perd son chemin d'origine : l'artefact ne
>   contient plus que `lcov.info`. Sonar ne le trouverait pas. Le job Sonar replace donc chacun par
>   `path:`.
> - **`sonarcloud` n'attend pas `lint`** : le lint ne produit aucune mesure, et Sonar part dès la
>   fin des tests et de l'e2e.
> - **`userEvent.setup({ delay: null })`** dans `test/render.tsx` : −8 % sur le temps des tests
>   web (251 → 230 s cumulées), aucun test changé de couleur.
> - **Les fichiers lents ne sont pas découpés.** Le « plancher » mesuré en CI (99 s pour
>   `SessionBuilderScreen.test.tsx`) venait surtout de la concurrence : seul sur son runner, le
>   fichier tient en 36 s (13 s sur un poste), pour 210 s de suite. Le découpage n'est à reprendre
>   que si un fichier redevient la queue de `test-web`.
>
> **Mesuré sur la PR #685** : 5 min 53 du premier job à la fin de Sonar, contre ~10 min. Les
> tests ont fondu sitôt seuls — mobile 226 → 64 s, api et shared (64 et 48 s) → 32 s à eux
> deux —, le web moins (347 → 217 s), parce que sa suite tient 3 workers occupés à elle seule.
> `test-web` (4 min 06) ne précède plus l'e2e (3 min 33) que d'une demi-minute : c'est le gain
> maximal qu'un découpage du web apporterait encore au chemin bloquant.
>
> Écarts assumés : **pas de cache Turbo entre runs** (« Tranché en #318 », C) ; **ni `happy-dom`
> ni `isolate: false`**, qui changent l'environnement des tests (#625). **Pas de shards Vitest**,
> bien que `test-web` dépasse les ~3 min que fixait l'issue : ce seuil supposait le web loin
> devant l'e2e, et une demi-minute ne paie ni un second setup ni une fusion de rapports de
> couverture. À rouvrir si l'écart avec l'e2e dépasse ~1 min 30. Chaque job paie son propre setup
> (~20 s) : c'est le prix du parallélisme. La porte **locale** reste sous un seul `turbo`,
> bridé à la moitié des cœurs (« Tranché en #833 »).

> **Tranché en [#833](https://github.com/Cimavia/cimavia/issues/833)** (les tests instables de
> la porte locale) : sous `pnpm turbo typecheck test`, des tests web et mobile tombaient sans que
> la branche les touche, et passaient relancés seuls. Trois causes, sans lien entre elles.
>
> - **Le budget de 5 s, dépassé sous la charge.** Les quatre suites Vitest tournent à la fois, et
>   chacune prend autant de workers que la machine a de cœurs. Le web et le mobile sont donc
>   **bridés à la moitié des cœurs, hors CI seulement** (`maxWorkers: "50%"` quand `CI` est
>   absent) : en CI, chaque suite a son runner depuis #683 et garde le défaut. L'api et shared,
>   en `node` et rapides, ne le sont pas — aucun de leurs tests n'est jamais tombé. Le budget
>   lui-même ne bouge pas : l'allonger en local cacherait un test réellement lent jusqu'à la CI.
> - **Un import à froid dans le corps d'un test** (`apps/mobile/shared/lib/auth.test.ts`) : le
>   premier cas importait le module après `vi.resetModules()`, et payait seul la transformation du
>   graphe d'Expo et de Better Auth — 859 ms à vide, au-delà de 5 s sous la charge. Un import
>   statique en tête la reporte à la collecte, qui n'a pas de budget. Le patron reste ailleurs :
>   un fichier qui tombe sur son **premier** cas, et sur lui seul, relève de ce correctif.
> - **L'horloge qui recule** : « Recharger » (#604) relisait par `fetchQuery({ staleTime: 0 })`,
>   que TanStack Query juge sur `Date.now()`. Sous WSL2, l'horloge se recale par à-coups vers
>   l'arrière (−0,9 et −1,5 s mesurés pendant une porte) : la donnée lue « après l'instant
>   présent » passait pour fraîche, la relecture rendait le cache sans rien demander, et l'écran
>   remontait sur la version même du conflit. `useStaleReload` **invalide** la requête avant de
>   la relire — l'invalidation prime sur l'horloge. C'est un défaut réel, pas seulement de test,
>   mais sa fenêtre en production est celle du recul : une relecture demandée dans la seconde.
>
> **Mesuré** sur un poste de 20 threads, par `pnpm turbo typecheck test --force --continue` :
> sans borne, 4 portes rouges sur 4 ; bridé seul, 1 rouge sur 3 (l'horloge) ; plus l'invalidation,
> 1 rouge sur 3 (l'import à froid) ; avec les trois, 3 vertes sur 3, en 100 à 110 s chacune. La
> suite web lancée seule tient en 64 s, bridée.
>
> Écarts assumés : **l'e2e Playwright de la messagerie**, tombé une fois sur la suite complète,
> est parti en [#867](https://github.com/Cimavia/cimavia/issues/867). Il tenait au même recul de
> l'horloge, mais côté API : le recul datait un message avant le précédent. C'est tranché dans
> `messagerie-et-notifications.md`. La
> même dépendance à l'horloge existe côté mobile (`usableSession`, qui relit par
> `fetchQuery({ staleTime: 0 })`) ; elle n'y a fait tomber aucun test et reste en l'état.

---

## v1.0 — Garde-fous du dépôt ([#621](https://github.com/Cimavia/cimavia/issues/621))

| # | Dette | Statut | Suivi |
|---|---|---|---|
| GF-2 | **Les règles de verrou de squawk sont exclues** (#628) : `lock_timeout`, `statement_timeout`, index non `CONCURRENTLY`, contrainte ou clé étrangère validée d'emblée. Une migration peut donc bloquer une table le temps qu'elle dure, sans signal. Sur les volumes du Coach bêta (des milliers de lignes), ce temps se compte en millisecondes, et l'API est arrêtée pendant qu'elle migre. | 🟢 | — *(déclencheur : une table qui dépasse le million de lignes, ou une prod où l'API sert pendant la migration — #84 ; retirer alors ces règles de `excluded_rules`)* |
| GF-3 | **Des mutants survivent encore dans `@cmv/shared`** (#635) : le cliquet est à 92, pas à 100. Le lot `util/` et motifs est livré ; restent les schémas de réponse qu'aucun test de shared ne parse, les bornes `.min`/`.max` jamais testées à leur valeur exacte, la lecture d'horloge de `date.util` et les documents riches. Chaque lot remonte le cliquet du score qu'il gagne. | 🟢 | [#635](https://github.com/Cimavia/cimavia/issues/635) |
| GF-5 | **91 % des mutants de la tenancy rejouent toute la suite** (#677) : leurs fixtures vivent dans des `beforeAll`, dont Stryker ne rattache la couverture à aucun test. Chacun coûte les 1 113 tests, d'où 2 h 49 en CI à trois workers. | 🟢 | [#815](https://github.com/Cimavia/cimavia/issues/815) *(déclencheur : le job tenancy dépasse à nouveau ses 300 min)* |

*Résolues, à l'[archive](archive.md) : GF-1, GF-4.*

> **Tranché en [#623](https://github.com/Cimavia/cimavia/issues/623)** (quatre règles dures
> vérifiées par Biome) : des plugins **GritQL**, et non les règles natives. `style/noJsxLiterals`
> ne voit que le texte enfant sans option ; avec `noStrings`, il signale aussi des chaînes hors du
> JSX ; et son `allowedStrings` compare le texte espaces compris, `" · "` n'y valant pas `"·"`. Le
> critère retenu pour la règle 6 est **« contient une lettre »**, hors entité HTML : les glyphes,
> la ponctuation et les nombres passent sans liste à tenir. Une expression compte si elle **rend**
> du texte — branche de ternaire, droite d'un `&&`, opérande de `+` — et non quand elle choisit une
> clé (`t(c ? "a" : "b")`) ou teste une valeur (`status === "DONE"`). `style/noHexColors` reste,
> mais pour le CSS seul.
>
> Une couleur hex de **3 ou 4 chiffres** n'est signalée que seule dans sa chaîne ou entre crochets
> Tailwind (`bg-[#abc]`) : ailleurs, « #602 » est un renvoi d'issue. Celles de 6 ou 8 chiffres le
> sont partout où le `#` n'est pas collé à un mot — une ancre d'url (`doc#facade`) n'est pas une
> couleur.
>
> Les **exceptions vivent dans le code**, en `biome-ignore` justifié, et non dans `biome.json` :
> le fichier n'accepte pas de commentaire, une liste sans raison n'aurait rien dit, et une
> suppression devenue inutile est signalée là où elle traîne. Les `includes` d'un plugin portent
> son **périmètre** (tests, tokens, layouts), jamais un cas particulier.
>
> Les `_layout.tsx` ne sont pas hors règle : ils ne portent que leur composant. La pastille de
> l'onglet notifications en est sortie pour `shared/lib/tabs.ts`, où elle se teste seule.
>
> Une règle GritQL qui ne trouve plus rien **se tait** au lieu d'échouer — un nœud renommé à une
> montée de Biome suffit. D'où `check:lint-rules` et ses fixtures, qui vérifient aussi le
> périmètre : un hex signalé sous `theme/` échoue autant qu'un hex ignoré ailleurs. Chaque marque
> nomme sa règle (`✗ noRawSql`) : Biome ne nomme pas le plugin dans son rapport, le script le
> reconnaît à son message, lu dans le `.grit`.

> **Tranché en [#372](https://github.com/Cimavia/cimavia/issues/372)** (`shared/` ne dépend
> d'aucune feature, et une règle Biome le tient) : la revue du 16/09 avait vu un import de feature
> dans le design system web ; au moment de le traiter, il y en avait trois. `CmvAppShell` montait la
> cloche (`feature/notification`), `CmvRoleGate` la reconnexion sur place (`feature/auth`, #439),
> et `shared/lib/account-reset` purgeait le presse-papier du plan (`feature/plan`, #341). Les deux
> derniers étaient arrivés **le même jour**, faute de règle qui le refuse — d'où le plugin
> `noFeatureImportInShared`, sur `apps/web/src/shared` et `apps/mobile/shared` (le mobile n'en
> avait aucun) : `import`, `export … from` et `import()`, par alias comme par chemin relatif. Les
> tests en sont exclus : un test de `shared/` peut s'appuyer sur une feature sans que le code en
> dépende.
>
> Chacun est rendu à une feature plutôt que réinjecté par une prop ou un contexte : le cadre devient
> **`feature/shell`** (`AppShell`, `BackLink`), la garde **`feature/auth`** (`RoleGate`), la purge
> **`feature/auth/util/account-reset.util.ts`** — le cycle de session, que connexion et reconnexion
> appellent déjà. Ils perdent le préfixe `Cmv`, réservé au design system (architecture-choice §5) ;
> les encadrés plus anciens les nomment encore `CmvAppShell` et `CmvRoleGate`. La purge mobile
> reste dans `shared/lib` : elle ne touche que des stockages partagés, rien qui soit à une feature.
>
> Ce qui **n'en découle pas** : les sept tests d'écran qui bouchonnaient `@/feature/notification`
> le faisaient parce qu'ils montaient le VRAI cadre, dont la cloche interroge l'API — pas à cause
> du barrel. Deux autres (`AthleteFeedbackScreen`, `AthleteSessionScreen`) le montaient sans rien
> bouchonner. Les neuf sont passés sur `StubAppShell`, comme les treize autres ; c'est ce geste, et
> non le déménagement, qui a retiré les mocks. Tous les tests d'écran doublent désormais le cadre :
> seul `AppShell.test.tsx` monte le vrai.

> **Tranché en [#624](https://github.com/Cimavia/cimavia/issues/624)** (le journal se range par
> domaine, et c'est le découpage qui l'allège, pas l'archive) : à 5 574 lignes, les dettes ✅ n'en
> pesaient que 41 ; les encadrés, 85 %. Sortir les dettes résolues ne gagnait presque rien, et les
> encadrés ne s'archivent pas : une décision reste vraie après la dette qui l'a fait naître. Le
> journal se lit donc par **domaine** — neuf fichiers sous `docs/dette/`, sections inchangées et
> dans leur ordre de naissance — et non par épic (la plupart des sections n'en ont pas) ni par
> label `area:` (une décision traverse les couches).
>
> `docs/dette-technique.md` **garde son chemin** et devient l'index : aucune issue ne pointe le
> fichier par URL — elles citent un identifiant (« P2-1 ») ou un titre d'encadré (« Tranché en
> #10 »), qu'un `grep -rn` sur `docs/dette/` retrouve où qu'il ait été rangé. Un renvoi « § Section »
> du code a suivi son domaine, sauf celui de la migration `20260824070000_…`, qui ne se modifie plus
> une fois jouée : il mène à l'index, qui mène au domaine.
>
> L'archive trie par **statut**, jamais par identifiant barré : `~~P2-1~~ / ~~P3-2~~` existe en 🟡,
> un « nouveau cas » ouvert d'une dette déjà close. Le domaine garde, sous le tableau qu'une dette
> a quitté, la ligne « *Résolues, à l'archive : …* » qui la nomme.
>
> La liste des dettes sans issue n'est **plus écrite** : `pnpm check:dette` la calcule. Elle avait
> déjà dérivé — **MI-1**, résolue, y restait ; **L-1** n'y était jamais entrée — et le même relevé a
> trouvé deux **R-1** et deux **R-2** : celles de la refonte d'exercice (#157) sont devenues **EX-1**
> et **EX-2**, la ligne gardant son ancien nom. Une liste générée dans l'index aurait demandé à
> chaque PR de la régénérer ; un script qui la rend à la demande et refuse ce qui la fausserait
> (identifiant en double, dette ouverte sans suivi, ligne hors tableau — **M-6** en était une, écrite
> sous un encadré, affichée en barres verticales) ne demande rien.

> **Tranché en [#625](https://github.com/Cimavia/cimavia/issues/625)** (la suite d'isolation
> découpée) : **une seule spec**, `isolation.e2e-spec.ts`, monte l'app et charge chaque domaine de
> `test/isolation/` par `import.meta.glob` ; les acteurs et les données de base vivent dans
> `test/support/`. Un domaine ajouté n'a rien à déclarer, et ne peut donc pas être oublié.
>
> Deux voies plus naturelles ont été mesurées, puis écartées :
> - **une spec par domaine** : chaque fichier réimporte le graphe d'`AppModule` dans un contexte
>   neuf, soit ≈ 1,4 s, ce qui fait ≈ +20 s pour seize domaines sur une étape E2E de 62 s. Démarrer
>   Nest ne coûte presque rien ; c'est l'import qui coûte ;
> - **`isolate: false`** : il garde l'import (+0,1 s par fichier), mais partage le cache de modules.
>   `signup-mode.e2e-spec.ts` lit alors un `AppModule` évalué en mode ouvert, et six refus
>   échouent. Le contourner par `vi.resetModules()` fait pire : le graphe « fermé » reste en cache
>   pour les fichiers suivants.
>
> Ce que l'entrée unique impose aux domaines : **aucun hook de niveau fichier**, puisqu'il vaudrait
> pour toute la suite (celui d'`organization`, qui vidait `sentMails`, est descendu dans ses deux
> blocs lecteurs) ; des adresses à soi, puisque la base n'est vidée qu'une fois ; et `-t` pour
> lancer un seul domaine, puisqu'un module n'est pas une spec. `-t` étant une regex, on coupe le
> titre avant sa parenthèse : « (#44) » n'attrape rien, et tout passe en vert sans avoir tourné. Restent des specs à part celles
> qui exigent leur propre app : `signup-mode` (un autre environnement) et `route-declarations`
> (un module compilé avec `DiscoveryModule`, sans serveur).

> **Tranché en [#626](https://github.com/Cimavia/cimavia/issues/626)** (mutation testing) : la
> couverture dit qu'une ligne a tourné, pas qu'un test l'a vérifiée. **Stryker** mute deux cibles,
> choisies pour ce qu'une erreur y coûte : `@cmv/shared`, où vit la logique pure, et la **tenancy**
> de l'API — l'extension Prisma, l'interceptor qui pose l'acteur, le décorateur qui dit à quel
> titre une route l'exerce. `CapabilitiesGuard` n'en est pas : elle répond 403, elle ne scope rien.
>
> Le **juge de la tenancy est la suite e2e**, pas un mock : un filtre tenant ne se vérifie que
> contre une vraie base. D'où une passe longue (un worker à l'origine, sur un seul port et une seule
> base ; trois depuis #677, chacun sur les siens) et un `timeoutMS` de 60 s — Stryker compte un
> timeout comme un mutant tué, et la marge par défaut aurait gonflé le score sur un simple boot
> lent de Nest. Elle tourne **chaque
> lundi et à la demande**, et sur une PR seulement quand sa propre configuration change ; shared,
> sur **chaque PR qui le touche**, en mode incrémental, et aussi sur `main` — à chaque merge qui le
> touche depuis #647, le lundi et à la demande : ce sont ces runs qui alimentent le fichier d'état
> que les PR relisent depuis le cache. Sous son seuil, un job
> **échoue** ; mais **aucun des deux n'est requis** : le rouge se voit, il ne bloque pas un merge.
>
> Les seuils diffèrent par nature. La tenancy est à **100 %** (`break: 100`) : un survivant y est
> un filtre qu'on pourrait retirer sans que rien ne le voie. Shared suit un **cliquet** — le score
> mesuré, arrondi en dessous, et qui ne fait que monter : 89 au départ, ses 457 survivants sont
> suivis en [#635](https://github.com/Cimavia/cimavia/issues/635). Un mutant qu'aucun test ne
> peut tuer se déclare **à sa ligne**, `// Stryker disable next-line <mutateur>: <raison>`, jamais
> par une exclusion de configuration : la raison reste lisible là où elle vaut.
>
> Le tri des 21 survivants de la tenancy :
> - **quatre clés athlète fermées** — `AthleteSheet`, `PlanWeek` et les deux tables de rattachement
>   des exercices planifiés. Aucune route ne les traversait : l'athlète les lit imbriquées, et une
>   clé ouverte sans usage est une surface sans test ;
> - **trois opérations testées** que l'extension autorisait sans appelant (`findFirstOrThrow`,
>   `aggregate`, `createManyAndReturn`), et les refus de `?as=` ;
> - **deux mutations rendues sans objet** : l'interceptor confie la route sans titre à
>   `resolveExercisedCapability` au lieu de la tester lui-même, et lit `request.query`, que Fastify
>   pose toujours, sans `?.` ;
> - **cinq mutants déclarés équivalents**, chacun avec sa raison : la clé coach de `FeedbackMedia`
>   qu'impose le type, deux valeurs de métadonnées opaques, deux décorateurs dont la mutation
>   empêche les tests de se charger (Stryker compte alors un survivant à zéro test).
>
> **Le détour de `findUnique` par `findFirst` est retiré.** Il datait d'un Prisma qui refusait un
> champ non unique à côté de la clé ; la v5 l'admet, et `update` et `delete` passaient déjà par là.
> Trois survivants l'ont montré : le vider ne changeait rien. Une raison de le garder a été pesée —
> Prisma **regroupe** les `findUnique` d'un même tick, par modèle et forme d'arguments, sans leurs
> valeurs, donc entre tenants. Constaté sur la base e2e : deux coachs lisant le même id partent en
> un seul `SELECT … WHERE (id, coachId A) OR (id, coachId B)`, et Prisma rend à chacun sa ligne en
> comparant tout le `where`. Ce tri est ce qui sépare les deux tenants : un e2e le tient désormais,
> au lieu d'un détour qui l'évitait sans que rien ne dise pourquoi *(levé en #814 : le filtre
> passe sous `AND`, et Prisma ne regroupe plus ces lectures)*. Effet de bord voulu : un
> `findUnique` sur le client de transaction lit enfin DANS la transaction, là où le détour passait
> par le client de base.
>
> L'outillage : **Stryker 9.6.1**, pas la 10, qui tire Babel 8 et bascule la résolution des pairs de
> la chaîne Expo jusqu'au mobile *(levé en #734 : le mobile déclare son `@babel/core` 7, et Stryker
> passe en 10)*. Sous pnpm, le runner Vitest se déclare **par chemin**
> (`plugins`) : Stryker ne le trouve pas à côté de son propre paquet. Ce runner impose
> `pool: "threads"`, où `env.TZ` ne change plus le fuseau, qui appartient au process : shared le
> pose dans sa config Stryker (Paris, #382), et son test des Antilles saute hors du thread
> principal. La tenancy n'en pose pas — un `TZ` là changerait le fuseau de toute la suite e2e. Le
> bac à sable `.stryker-tmp` est exclu des configs Vitest : sans quoi `pnpm test` rejouait ses
> copies, dépendances comprises.

> **Tranché en [#635](https://github.com/Cimavia/cimavia/issues/635)** (les survivants de shared,
> premier lot) : `util/` et les motifs, livrés ensemble ; l'issue reste ouverte pour la suite,
> suivie en GF-3. Quatre règles, qui valent pour les lots suivants :
> - **un refus Zod** se vérifie par `expectRefusal(schema, input, path)`
>   (`packages/shared/test/`) : il tombe au bon champ, avec un message qui n'est ni vide ni le repli
>   anglais de Zod. Le texte n'est pas recopié — une reformulation casserait le test sans rien
>   casser d'autre ;
> - **un schéma de réponse** (`*DtoSchema`), qu'aucun test de shared ne parse, se déclare par
>   bloc : `// Stryker disable all: <raison>` … `// Stryker restore all` ;
> - **une borne `.min`/`.max`** se teste dans shared, sur sa valeur exacte et la suivante ;
> - **un invariant `required(…)`** que rien n'atteint déclare son message (`StringLiteral`) : le
>   tester obligerait à fabriquer une donnée que le typage interdit.
>
> Ce que les survivants ont montré. Choisir le plus récent ou le plus tôt dépendait de l'ordre
> d'arrivée à date égale — deux cycles partis le même lundi, deux débriefs ou deux factures à la
> même seconde : tout départage se fait désormais par le **plus petit `id`**, et `plan.util` n'a
> plus qu'un comparateur. Un règlement à l'instant illisible, rangé après toute date dans l'ordre
> des chaînes, masquait le dernier règlement lisible. Et du code mort : le motif de
> `parseIsoDate`, que l'aller-retour rendait sans objet ; les gardes de `parseTrainingDuration`
> qu'aucune suite de chiffres ne franchit ; le filtre des cycles diffusés d'`athlete-row`, doublé
> par `currentAthletePlan`. Le cliquet passe de 89 à 92.
>
> **Le cliquet se remonte sur une mesure complète.** Le mode incrémental ne rejoue un survivant
> que si un test qui le couvre est apparu. Un mutant **statique** — une regex, une constante, un
> schéma posés au niveau du module — n'a pas de couverture par test : son « survivant » était relu
> à vie, même tué depuis. La PR mesurait ainsi 91,30 % là où le score réel est 92,03 %, et le run
> du lundi, incrémental lui aussi, n'aurait jamais assaini le cache. Désormais `main` (à chaque
> merge dans shared depuis #647, le lundi et à la demande) et toute PR qui touche
> `stryker.config.mjs` passent `--force` ; les autres PR restent incrémentales.

> **Tranché en [#647](https://github.com/Cimavia/cimavia/issues/647)** (le cache que relisent les
> PR) : une PR doit être mesurée sur le `main` courant. Elle l'était sur le run du lundi précédent —
> #646 a relu un cache vieux de plusieurs merges et hérité de 29 survivants tués depuis : 91,32 %
> au lieu de 92,06 %. Pire, sur rien : un cache inutilisé sept jours est effacé, et le premier run
> de #673 a tout mesuré faute d'en trouver un. Trois règles :
> - **chaque merge qui touche shared** lance une mesure complète sur `main`, qui réécrit le cache.
>   Préféré à un `--force` sur la PR quand son cache date d'avant le dernier `stryker.config.mjs` :
>   lui ne couvrait que la remontée du cliquet, pas un cache en retard de plusieurs merges ;
> - **une PR lit le cache, ne l'écrit plus.** Le cache cherche d'abord dans la branche du run : une
>   PR relisait le sien avant celui de `main`, et restait mesurée sur le `main` de son premier run.
>   Relancer une PR après un run de `main` ne changeait donc rien. Le prix : un run relancé rejoue
>   toute la différence avec `main`, pas son dernier incrément — quelques dizaines de secondes ;
> - **un groupe de concurrence par événement.** GitHub ne garde qu'un run en attente par groupe :
>   dans un groupe commun, un merge aurait annulé un run du lundi ou à la demande qui attendait son
>   tour, tenancy comprise, ou attendu 90 min derrière elle. La tenancy ne tourne pas au merge.

> **Tranché en [#677](https://github.com/Cimavia/cimavia/issues/677)** (la tenancy ne tenait plus
> son délai) : du 19/10 au 9/11, quatre runs du lundi ont été tués à 90 min sans laisser une ligne.
> La passe suit le code muté — 200 mutants le 12/10, 538 le 11/11 avec l'épic entreprise (#593) — et
> la suite qui la juge, passée à 1 113 tests.
>
> **Ce que Stryker appelle « statique » n'est pas ce qu'on croyait.** Son runner Vitest ne rattache
> une ligne à un test qu'entre `beforeEach` et `afterEach` ; tout ce qui tourne dans un `beforeAll`
> compte comme couvert hors test. Or la suite pose ses fixtures dans 132 `beforeAll` (11
> `beforeEach`) : 91 % des mutants sont « statiques » parce qu'un filtre tenant sert à monter les
> données, pas parce qu'ils vivent au chargement d'un module. Chacun rejoue toute la suite. D'où
> **`ignoreStatic` écarté** : un mutant que seules les fixtures touchent ne serait plus jugé du tout,
> les autres par les seuls tests qui le touchent dans leur corps — sur le juge d'une règle dure.
>
> **Trois workers, chacun sur sa base et ses ports**, plutôt qu'une matrice de jobs : la matrice
> repaie l'installation et la passe à blanc par job, et son découpage de `mutate` est à rééquilibrer
> quand le code bouge. Stryker numérote ses process (`STRYKER_MUTATOR_WORKER`) ; `@cmv/e2e` en
> dérive `cimavia_db_mut<n>_e2e` (après le worktree s'il y en a un) et deux ports. Sous Stryker, **un
> partage ne se voit pas** : le `beforeAll` qui tombe sur un port pris ou une base vidée par un
> voisin emporte ses tests, et chacun compte comme un mutant tué. D'où trois règles :
> - **les ports suivent aussi le worktree**, contrairement aux e2e où un port pris échoue en le
>   disant : 100 numéros par rang, de 10001 à 20000, loin des ports de dev et sous les éphémères ;
> - **le numéro n'est pas borné par la `concurrency`** : un process relancé après un mutant en
>   timeout prend le suivant, et migre une base neuve. Au-delà de 99, la suite refuse de démarrer
>   plutôt que de déborder sur le rang voisin. Les bases des numéros passés restent dans le volume
>   e2e local ; la CI repart d'un conteneur neuf ;
> - **un environnement décalé pour un autre worker fait refuser le démarrage**, au lieu de garder
>   la base et le port d'avant.
>
> Le bucket SILO reste commun, ses clés étant uniques. Le job tourne sur une PR qui touche ce
> harnais (`vitest.config.e2e.ts`, `@cmv/e2e`) : cassé, il fausserait le score sans rien dire.
>
> La passe prend **1 h 24 en local, 2 h 49 sur un runner hébergé** (job de la PR, 2026-11-11). Son
> délai est porté à **300 min** : ~1,8× la mesure, et non ~3× comme le veut la règle de #413 — ce
> serait au-delà du plafond de 360 d'un runner hébergé. Un job hebdomadaire, non requis, sur les
> minutes gratuites d'un dépôt public : sa durée compte moins que le fait qu'il finisse. Le
> dépasser à nouveau déclenche GF-5. Turbo l'écrit en `--log-order=stream`, qui
> regroupait sinon sa sortie jusqu'à la fin : un job tué au timeout perdait toute sa progression.

> **Tranché en [#814](https://github.com/Cimavia/cimavia/issues/814)** (la tenancy retrouve ses
> 100 %) : **la référence est le rapport de la CI, pas une passe locale.** Les trois jobs complets
> disponibles (PR #813, `tech/782`, `main` du 16/11) comptent les mêmes 18 survivants. La passe locale
> du 11/11 en comptait 14, parce que neuf mutants y sont sortis en `RuntimeError` sur un
> `EADDRINUSE` du port d'un worker : un port pris ne compte donc pas toujours comme un mutant tué
> (« Tranché en #677 »), il peut aussi sortir le mutant du score. Le seul écart de la CI, `:180` tué
> une fois sur trois, venait d'un test de course instable
> ([#872](https://github.com/Cimavia/cimavia/issues/872)), pas de l'ordre des tests (#815). Les cinq
> timeouts locaux sont tués par une assertion en CI.
>
> Le tri des 18 :
> - **cinq filtres ou contrôles que rien ne tenait**, tenus maintenant par l'attaque directe du
>   client tenant (`tenancy.ts`) : le filtre gardé quand l'appelant pose la relation qu'il suit,
>   la conversation créée sans son acteur, ses participants, `kind` et `participantKey` réécrits ;
> - **`scopeFor` rend `null`**, pas `undefined`, pour un modèle d'entreprise sans capacité ;
> - **neuf équivalents, retirés par le code plutôt que déclarés.** Stryker ne déclare un mutant
>   que par mutateur, et chaque ligne en portait un autre, tué : la déclaration l'aurait caché aussi.
>   - **Le filtre s'ajoute toujours sous `AND`** (`scopeWhere`). À plat ou sous `AND`, c'était la
>     même condition, d'où cinq survivants. Effet voulu : Prisma ne regroupe plus les `findUnique`
>     d'un même tick, constaté sur la base e2e avec Prisma 7.10 (deux requêtes au lieu d'une). Le
>     tri par lequel chacun recevait sa ligne, dont GF-1 craignait l'ordre, n'a plus lieu. Les
>     racines partagées étaient déjà dans ce cas depuis #605, leur filtre étant un `AND`. Le prix :
>     N lectures par id lancées ensemble font N requêtes, et aucun service n'en lance. Un Prisma
>     qui regrouperait de nouveau un `where` composé rouvrirait GF-1.
>   - **`membershipFrozenOrThrow` reçoit `TenantFilter | undefined`**, ce que Prisma lui passe :
>     trois survivants testaient un `null` ou un `data` qui n'était pas un objet.
>   - **La lecture du parent passe toujours par `requestTransaction`**, qui sans transaction lit
>     comme la lecture nue. Déclarer le ternaire aurait caché son autre mutant, la lecture hors
>     transaction. La dépendance à cet interne s'élargit d'autant (MC-3), et casserait bruyamment.
> - **trois équivalents déclarés à leur ligne** :
>   - l'invariant du registre de `coachesWhoRead`, que le type `CoachReadModel` rend inatteignable ;
>   - **la mise en minuscule du délégué parent** : Prisma résout aussi `prisma.Exercise`
>     (`modelsLayer`), mais sans le typer ni le documenter, et on ne s'y appuie pas. La déclaration
>     cache deux mutants tués de la même ligne : un nom de délégué faux, qui ferait échouer
>     bruyamment toute création d'enfant.

> **Tranché en [#627](https://github.com/Cimavia/cimavia/issues/627)** (les parcours du Coach
> dans un navigateur) : **Playwright**, dans `apps/web/e2e/`, sur quatre parcours — connexion et
> garde, création puis diffusion d'un cycle, lecture d'un débrief, facture réglée. Les tests de
> rendu simulent l'API, les e2e de l'API n'ont pas de navigateur : seuls ceux-ci voient le
> routage, le cookie de session, le cache TanStack Query et le rendu réel ensemble.
>
> **Une API et un web à eux.** Le job E2E de l'API n'expose aucun serveur — Nest y tourne dans le
> process de Vitest. La config Playwright lance donc l'API construite (`node dist/main.js`, port
> 3101) et le bundle de **production** du web (`vite preview`, port 4310), pas le serveur de dev.
> Aucun serveur déjà présent n'est réutilisé : une API restée là tournerait sur du code périmé, un
> `vite preview` ordinaire (4173) viserait l'API de dev. Leur base, `cimavia_db_web_e2e`, vit dans
> le même conteneur que celle de l'API (5434) mais n'est pas la sienne : la suite de l'API la vide à
> l'ouverture, et les deux se seraient vidées l'une sous l'autre. Elles tournent ensemble — et,
> depuis #630, d'un worktree à l'autre aussi.
>
> **La base avant l'API, pas en `globalSetup`** : Playwright démarre ses `webServer` AVANT le
> global setup, et l'API serait partie sur une base pas encore créée. `prepare-database.mjs`
> ouvre donc la commande de l'API : `migrate deploy`, qui crée la base au besoin, puis un
> `TRUNCATE` des tables lues au catalogue. Pas de `migrate reset`, que Prisma refuse quand un
> agent le lance.
>
> **Un environnement entièrement écrit.** `ConfigModule` et `instrument.ts` chargent
> `apps/api/.env` pour toute variable que le process ne pose pas : l'API de test serait partie
> avec le Sentry, l'Axiom et le SMTP du poste. La config pose donc VIDE chaque clé du schéma d'env
> (`envSchema.shape`, pas une liste à tenir), puis les quelques valeurs de test par-dessus —
> `process.env` l'emporte sur le fichier, même vide, et le schéma lit le vide comme absent. Pas
> de SILO : aucun parcours ne touche aux médias.
>
> **Les données par l'API, jamais par Prisma.** Le seed (`@cmv/e2e/seed`) inscrit, invite, crée,
> facture, diffuse et débriefe par les routes : les données franchissent les mêmes règles que
> dans l'app. Chaque test inscrit ses propres comptes, suffixés d'un identifiant aléatoire — une
> relance ne heurte pas ses adresses. Le navigateur reçoit la session par son cookie ; seul le
> parcours de connexion passe par l'écran.
>
> **Les sélecteurs par libellé, tirés de `fr.json`** par un i18next sur le vrai catalogue : une
> reformulation ne casse rien, une clé supprimée échoue. Les tests de rendu, eux, restent sur les
> clés (`test/i18n.ts`). Les specs s'appellent `*.e2e-spec.ts` : le motif par défaut de Vitest
> ramasserait un `*.spec.ts`.
>
> **Chromium seul, et un job non requis.** Un navigateur flake plus qu'une API : sa stabilité se
> juge avant de lui confier une porte. En CI, un essai de plus marque le test « flaky » dans le
> rapport sans faire rougir le job ; les traces partent en artefact sur échec, et les logs de
> l'API sont dans ceux du job. Le job est filtré
> par étapes, comme *Builds de production*, pour pouvoir devenir requis sans changer de forme.
> Le mobile (Maestro) n'est pas dans ce lot : il demande un émulateur, cassé sous WSL2 et coûteux
> en CI — suivi en [#638](https://github.com/Cimavia/cimavia/issues/638), livré depuis (encadré
> suivant). L'émulateur de WSL2 n'était cassé que pour la vidéo, qu'aucun parcours ne joue.

> **Tranché en [#638](https://github.com/Cimavia/cimavia/issues/638)** (les parcours de l'Athlete
> sur le mobile) : **Maestro**, dans `apps/mobile/e2e/`, sur quatre parcours — connexion (refus,
> puis session gardée à la relance), séance du jour ouverte, débrief enregistré, réponse au Coach
> dans la messagerie. Maestro joue la build release en boîte noire, sans instrumenter l'app :
> Detox demanderait son propre build de test et un pont natif à tenir à chaque montée d'Expo.
>
> **Playwright reste le runner, sans navigateur.** Il porte ce que #627 a déjà réglé : l'API de
> test et sa base (`@cmv/e2e/api-server`, partagé avec le web), le seed (`@cmv/e2e/seed`), les
> relances et le rapport. Chaque test pose ses données par l'API, puis lance un flux YAML
> (`e2e/flows/`) ; les assertions sur ce que l'écran a écrit se font ensuite par l'API. La base est
> à eux, `cimavia_db_mobile_e2e`, l'API sur 3151 (décalé par worktree, comme le reste).
>
> **Une variante de build, `e2e`.** Son propre identifiant (`fr.cimavia.app.e2e`) : elle cohabite
> sur l'appareil avec le dev client et la preview. Les mises à jour OTA coupées — une mise à jour
> remplacerait le bundle testé —, pas de Firebase, et le trafic en clair permis : l'API de test
> parle HTTP. L'appareil la joint par **son propre `localhost`**, que `adb reverse` relie à la
> machine du serveur adb : le même chemin vaut pour la CI, WSL et un téléphone en USB, là où
> `10.0.2.2` ne vaut que pour un émulateur local. L'URL est inlinée dans le bundle : une empreinte
> rangée à côté de l'APK refuse d'installer une build faite pour un autre worktree. Le lien est
> **reposé avant chaque flux** ([#899](https://github.com/Cimavia/cimavia/issues/899)) : il vit avec
> la connexion adb, que l'émulateur du runner perd parfois en cours de suite, et tous les parcours
> suivants échouaient alors sur l'écran de connexion. Une coupure en plein flux fait encore échouer
> cet essai, mais son retry repart avec un lien neuf.
>
> **Le fuseau de l'appareil est posé**, et remis après la suite : la séance « du jour » est datée
> à Paris par le seed, l'app la cherche dans le jour de l'appareil, et un émulateur neuf est à GMT.
>
> **Les sélecteurs par libellé, tirés de `fr.json`** comme pour le web, passés à Maestro en
> variables (`-e`) : un flux ne contient aucun texte en dur. Deux contrôles n'avaient aucun nom —
> les champs de `CmvTextField`, dont le libellé est un texte voisin, et le bouton d'envoi de la
> messagerie, une icône seule. Nommés dans ce lot, pour TalkBack et VoiceOver d'abord. Le champ
> l'est par un **lien** vers son libellé (`aria-labelledby`), pas par un `accessibilityLabel` :
> sur Android, c'est un `contentDescription`, que TalkBack lirait à la place de la valeur saisie.
> Maestro ne lit pas ce lien : il touche le libellé, qui met le curseur dans le champ comme un
> `<label>`. Il ne sait saisir que de l'ASCII : les textes tapés sont sans accent.
>
> **Un job non requis, comme le web**, filtré par étapes, sur les PR qui touchent le mobile, l'API
> ou leurs paquets. La build release s'y paie à chaque run, sur un cache Gradle écrit par la PR :
> le job ne tourne jamais sur `main`, et seuls les pushs suivants de la même PR en profitent. Le
> premier run de chaque PR reste à froid. En local depuis WSL2, l'émulateur
> est celui de Windows : `scripts/dev-portproxy.ps1` relaie son serveur adb vers WSL seulement, et
> la suite le relaie à son tour sur `localhost:5037`, où Maestro le cherche (`CMV_ADB_SERVER`). Le
> `prebuild --clean` régénère `apps/mobile/android/`, celui du dev client, qu'un `expo run:android`
> ne refait pas : il est mis de côté le temps de la build, puis remis, et l'APK sort avant.

> **Tranché en [#628](https://github.com/Cimavia/cimavia/issues/628)** (une migration destructive
> signalée en CI) : **squawk 2.67**, sur les seuls `migration.sql` qu'une PR ajoute, modifie ou
> renomme — une migration jouée ne se modifie plus. `pnpm check:migrations`, étape du job *Lint +
> Typecheck + Test* sur les PR, comme commitlint : elle hérite de son statut requis sans ajouter
> de check au ruleset. Le paquet npm tire son binaire par `optionalDependencies`, sans script
> d'installation : il passe sous `--ignore-scripts`.
>
> **Les migrations neuves sont atomiques.** Prisma ne joue PAS un `migration.sql` dans une
> transaction — constaté sur Prisma 7.8, base jetable : une instruction qui échoue laisse en place
> les tables et colonnes créées avant elle, la migration reste « en échec » et `migrate deploy`
> refuse de continuer. Sur preview, c'était un schéma à réparer en `psql` sur le NAS. Enveloppé
> dans `BEGIN;` … `COMMIT;`, le même échec n'a rien laissé, et `migrate resolve --rolled-back` puis
> la migration corrigée sont passés. D'où `assume_in_transaction = false` — la vérité — et
> `prefer-robust-stmts` **gardée** : une migration est atomique, ou rejouable (`IF NOT EXISTS`),
> ce qui est la voie d'un futur `CREATE INDEX CONCURRENTLY`. Le prix : `--create-only` avant chaque
> migration, le `BEGIN`/`COMMIT` que Prisma pose lui-même autour d'un `AlterEnum` à retirer
> (`transaction-nesting`), et une erreur masquée — Prisma écrit `current transaction is aborted`
> au lieu de la cause, que les logs du Postgres gardent. Les 41 migrations d'avant ne sont pas
> enveloppées, et ne le seront pas : on ne modifie pas une migration jouée.
>
> **Ce que la config garde** : ce qui perd des données ou empêche l'API de démarrer —
> `ban-drop-column`, `ban-drop-table`, `ban-drop-type`, `ban-truncate-cascade`,
> `changing-column-type`, `adding-required-field`, `adding-not-nullable-field`, plus les défauts de
> squawk qu'aucune migration n'a encore touchés. **Ce qu'elle exclut**, chaque règle avec sa raison
> dans `.squawk.toml` : les conventions de Prisma (`timestamp` en UTC, `integer`, ordre d'enum),
> les verrous (GF-2), et la compatibilité entre deux versions sur un même schéma — l'API est une
> instance unique, arrêtée avant de migrer, jamais ramenée en arrière (« Tranché en #266 »). Prisma
> ne génère d'ailleurs jamais de `RENAME` : un renommage écrit à la main est la voie sans perte.
> Rejouée sur l'historique, la config signale les trois `DROP COLUMN` (`retrait_categorie_exercice`,
> `invitation_nominative`), le `DROP TYPE` et le `SET NOT NULL` — chacun voulu, chacun aurait porté
> son exception.
>
> **Une exception se déclare à l'instruction**, `-- squawk-ignore <règle> -- <raison>`, comme un
> `biome-ignore` : squawk accepte une exception muette, le script la refuse, ainsi qu'un
> `squawk-ignore-file` qui ne nomme aucune règle. Un nom de règle mal écrit, squawk le signale
> (`unused-ignore`) ; une exception devenue inutile, non — sans objet sur un fichier qui ne bouge
> plus.
>
> **Un banc**, comme `check:lint-rules` : `scripts/migration-lint/fixtures/`, où `-- ✗ <règle>`
> marque la ligne suivante. squawk refuse un nom inconnu dans `excluded_rules`, mais une règle
> gardée qu'une montée retirerait se tairait sans rien casser.
>
> **Limite assumée** : squawk lit la structure, pas les données. Un `DELETE` ou un `UPDATE` de
> reprise (la purge de `conversation_not_self`) passe sans signal. Prisma n'en génère jamais : ils
> s'écrivent à la main, avec le commentaire qui les justifie, et se relisent.

> **Tranché en [#629](https://github.com/Cimavia/cimavia/issues/629)** (requêtes par route et
> taille du bundle mesurées) : on mesure, on n'optimise pas — #114 garde son déclencheur. Le
> premier relevé n'a trouvé **aucun N+1** : les vingt routes de liste émettent le même nombre de
> requêtes avec un élément et avec quatre.
>
> **Les requêtes, comptées par l'événement `query` de Prisma**, que Prisma 7 émet aussi derrière
> `adapter-pg`. Il faut le déclarer à la construction du client : `PrismaService` prend donc un
> journal par le jeton `PRISMA_LOG`, que `PrismaModule` fournit vide — la prod ne journalise rien —
> et que le harnais e2e remplace, en laissant Nest construire le service
> (`test/support/query-count.ts`). L'OpenTelemetry de Prisma aurait évité de toucher au service,
> au prix des dépendances OpenTelemetry pour un compteur. Les ordres de transaction ne comptent
> pas : Prisma rapporte le `COMMIT` mais jamais le `BEGIN`.
>
> **Un budget exact, et identique sur deux jeux** (`test/isolation/query-budget.ts`). Chaque route
> est lue sur un petit jeu puis sur un grand, et doit émettre exactement son chiffre les deux
> fois : l'égalité attrape le N+1, le chiffre exact une requête ajoutée sans le dire. Pas de
> marge, qui l'aurait laissée passer. Le chiffre compte tout, la lecture de session de Better Auth
> comprise : une montée qui y ajoute une requête bouge les vingt budgets d'un coup, ce qui se voit
> et se corrige d'un remplacement. Le test vérifie aussi que le grand jeu a **nourri** la route —
> une liste restée vide ne mesure rien ; c'est lui qui a sorti `/me/counterparts`, deux booléens et
> non une liste. Un domaine de la suite d'isolation plutôt qu'une spec à part (« Tranché en
> #625 ») : ≈ 4 s de plus au job E2E, et autant à chaque passe de Stryker sur la tenancy.
>
> **Le bundle, en octets bruts et par un plugin Vite** (`apps/web/bundle-budget.ts`). Le job
> *Builds de production* construit le web DANS l'image, en `cacheonly` : aucun `dist` n'en sort,
> et une étape à part aurait reconstruit le bundle. Le plugin fait échouer `vite build` lui-même,
> donc ce job, le poste et l'e2e web. Brut et non gzip, qui dépend de la version de zlib. JS et
> CSS, qui bloque le rendu autant que le JS ; les polices et images en fichiers à part n'y sont
> pas. Deux budgets, le premier affichage (l'entrée, ses imports statiques et leurs feuilles) et le
> total, à 534 949 et 1 384 272 octets mesurés plus 10 % : une dépendance qui double le bundle
> est refusée, la croissance ordinaire consomme la marge, et le budget se relève dans la PR qui le
> justifie. Mesuré en `writeBundle`, une fois les préchargements réécrits par Vite. **Pas quand
> Sentry téléverse** : son plugin injecte quelques centaines d'octets par chunk, et l'image de
> `main` échouerait sur un code que la PR a déjà fait passer. Le mobile n'a pas de budget : hors périmètre de l'issue.
> Relevé en #719 : le constructeur par blocs porte le premier affichage de 562 407 à 594 205
> octets (+5,7 %) et le total de 1 453 373 à 1 525 504, sans dépendance nouvelle. Les budgets
> repartent de cette mesure, plus 10 % : 653 000 et 1 678 000 octets.

> **Tranché en [#630](https://github.com/Cimavia/cimavia/issues/630)** (un port et une base e2e
> par worktree) : deux worktrees qui lançaient leurs e2e ensemble écoutaient sur le même port et
> vidaient la même base l'un sous l'autre. Le dépôt principal et la CI gardent `3001` et
> `cimavia_db_e2e` ; un worktree lié les dérive de git, sans rien à configurer
> (`@cmv/e2e`, que les e2e de l'API et ceux du web importent).
>
> **La base par le nom du worktree, les ports par son rang.** Le nom que git donne au worktree
> (`.git/worktrees/<nom>`) est unique et stable : deux suites ne partagent donc jamais une base
> (`cimavia_db_wt_<nom>_<empreinte>_e2e`, que `migrate deploy` crée). Le `wt_` sépare le nom de
> la suite de celui du worktree — sans lui, l'API d'un worktree `web` visait la base des e2e web ;
> l'empreinte du nom brut départage `tech-630` et `tech_630`, qu'un identifiant Postgres confond.
> Un port demande un nombre : c'est le rang du worktree parmi les worktrees liés, triés par octets
> et non selon la locale du shell — deux ports par rang pour l'API (3001 + 2 ×
> rang, `signup-mode` prend le second), un pour l'API et le web des e2e web (3101 et 4310 +
> rang), 49 rangs avant que l'API ne déborde sur le web. Un rang glisse si l'on crée ou supprime
> un worktree pendant qu'une suite tourne : la collision qui en résulte est un port pris, qui
> échoue en le disant, jamais une base vidée sous une autre suite. Un hash du chemin aurait évité
> le glissement, au prix de collisions muettes dans une plage aussi courte. Une base qui ne finit
> pas par `_e2e` n'est pas réécrite : lui donner le suffixe ferait taire la garde qui la refuse.
> La réécriture ne se fait qu'une fois par environnement (`CMV_E2E_WORKTREE`, et `CMV_E2E_WORKER`
> depuis #677) : le mode watch et les process enfants de Stryker réévaluent la config sur un
> environnement déjà décalé. Les workers de Stryker suivent la même règle, dans leur plage à eux
> (« Tranché en #677 »).
>
> **Un paquet à part, `@cmv/e2e`, et non un fichier d'`apps/api` que le web importerait.** Ce fut
> la première version : l'image web est tombée, son `tsc` vérifiant `e2e/` sur un arbre élagué par
> `turbo prune @cmv/web`, qui n'a pas `apps/api` — et le cache turbo du typecheck web ignorait le
> fichier. Déclaré en `devDependency` des deux apps, le paquet entre dans les deux élagages, et
> turbo suit la dépendance. `pnpm deploy --prod` ne l'embarque pas dans l'image de l'API.
> **Un seul fichier, sans import relatif** : Vitest charge sa config en laissant les paquets à Node,
> qui lit le `.ts` lui-même (types effacés, Node ≥ 22.18 — d'où `engines`) mais refuse un import
> sans extension. Le scinder casserait les e2e de l'API au démarrage.
>
> **Le bucket reste partagé.** Ses clés naissent des identifiants de la base : deux suites ne s'y
> écrasent pas, et la clé de l'API ne sait pas lister. Seul `silo-setup` le vide — à ne pas lancer
> pendant qu'un autre worktree fait tourner ses e2e.
>
> **Les `.env` recopiés au `pnpm install`** (`scripts/worktree-env.mjs`, au `prepare`) : c'est le
> seul passage commun à `git worktree add`, à herdr et à Claude Code — aucun des trois n'a de hook
> de création qui serve aux autres. Les `.env*` ignorés de la racine et des paquets, jamais un
> fichier déjà là ; hors worktree, ou sous `--ignore-scripts` (CI), rien. L'image de l'API, elle,
> joue ce `prepare` (`pnpm deploy`) sur un arbre élagué par `turbo prune`, sans `scripts/` : l'appel
> tolère donc un module introuvable, et lui seul — c'était le job *Builds de production* en rouge.
>
> **Un hook de fin de réponse** (`.claude/hooks/stop-gate.sh`) passe `biome ci .` et `check:i18n`
> quand la session a modifié un fichier pendant sa réponse — une revue lancée en lecture seule dans
> le même worktree n'est jamais bloquée par les fichiers en cours d'une autre. Un échec est rendu à
> Claude ; au second d'affilée, il rend la main avec le rapport plutôt que de boucler. Une
> modification faite par une commande shell ne l'arme pas, comme elle échappe déjà au Biome par
> fichier : la porte qualité reste la vérification. `.claude/settings.local.json`, réécrit par Claude
> Code à chaque permission accordée, entre au `.gitignore` du dépôt : Biome ne lit pas l'ignore
> global, et `biome ci .` échouait dessus.

> **Tranché en [#178](https://github.com/Cimavia/cimavia/issues/178)** (une classe vers un token
> inexistant) : **Tailwind juge, pas une table**. L'issue prévoyait de relire les échelles du preset
> et d'écrire à la main quel préfixe va avec quelle échelle (`rounded-` → rayons, `text-` →
> couleurs ∪ tailles…) : c'était recopier Tailwind, et la table se serait périmée à la première
> extension du preset. `check:tokens` monte plutôt Tailwind avec la vraie config de l'app (preset
> NativeWind compris) et lui demande, classe par classe, si chaque jeton `*-cmv-*` relevé produit
> une règle — préfixe inconnu, mauvaise échelle, variantes et opacité compris. Le contrôle vérifie
> donc que la classe est **générée**, ce que l'issue avait renoncé à faire. Un contexte Tailwind par
> app, sous la seconde pour les deux.
>
> **`getClassOrder`, pas le CSS produit** : un premier jet générait le CSS de toutes les classes
> d'un coup et relevait les classes de ses sélecteurs. Une classe citée dans la variante arbitraire
> d'une autre (`[&_.text-cmv-text-low]:p-cmv-sm`) y passait pour générée. `getClassOrder` juge
> chaque classe seule et rend `null` quand rien n'est produit ; c'est l'API du contexte qu'utilise
> le plugin Prettier de Tailwind, hors de ses exports publics, mais Tailwind 3 est figé en 3.4 et
> le banc échouerait si elle changeait.
>
> Le relevé suit le **`content`** de chaque config — ce que Tailwind lit est ce qu'on vérifie —,
> plus les **e2e web**, dont les sélecteurs Playwright visent des classes. **Tests compris** : un
> `toHaveClass` sur une classe inexistante reste vert. Il lit le texte brut,
> commentaires compris, plutôt qu'un AST : la prose s'écarte par sa forme (token nu, motif `*`,
> variable `--cmv-`) et un sélecteur de test se lit comme la classe qu'il vise. Il trouvait à sa
> naissance, en plus des deux `text-cmv-accent-fg` connus, un `text-cmv-h3` arrivé avec la refonte
> par blocs : les titres de bloc web n'avaient aucune taille.
>
> À la montée vers Tailwind 4 ([#852](https://github.com/Cimavia/cimavia/issues/852)), le script
> se réécrit : la 4 se pilote par `compile().build(candidates)`, plus direct encore.

> **Tranché en [#838](https://github.com/Cimavia/cimavia/pull/838)** (Biome 2.6) : **le formateur
> Markdown reste coupé** (`markdown.formatter.enabled: false`). Arrivé actif avec la 2.6, il
> réécrivait quatorze `.md` d'un coup, et glissait une ligne vide sous le `---` d'ouverture de
> l'en-tête YAML des skills et des agents `.claude/` — un en-tête dont rien ne dit que leur
> chargeur le tolère. Le linter Markdown, lui, reste ce que la version livre.
>
> **`useMathMinMax` reste active, mais ne voit pas les types** : elle signale un ternaire qui
> choisit le plus grand de deux opérandes, et le corrige en `Math.max` — qui rend `NaN` sur deux
> dates ISO, des chaînes. Les sites sur dates portent donc un `biome-ignore` justifié ; le correctif
> « unsafe » ne s'applique jamais en lot. Un `biome-ignore` doit être le commentaire **juste
> au-dessus** du nœud : un `// Stryker disable next-line` intercalé le rend inopérant, et
> l'inverse aussi. Là où les deux se rencontrent (`plan-row.util.ts`), Stryker passe en bloc
> `disable` … `restore`.
