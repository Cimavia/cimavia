# Dette technique — Qualité et dépôt

Un domaine du [journal de dette](../dette-technique.md) : la règle de capture, les statuts et la
liste des domaines vivent dans l'index.

---

## Post-MVP — Qualité & analyse statique

| # | Dette | Statut | Suivi |
|---|---|---|---|
| ~~Q-1~~ | ~~**Couverture non mesurée sur le web et le mobile**~~ : `sonar.coverage.exclusions` n'écartait la mesure que sur `@cmv/shared`, les trois autres paquets étant hors de vue. Les trois tiers sont levés — API en **#57** (e2e instrumentés, 2,6 % → ~86 %), web en **#58**, mobile en **#59** (Vitest, périmètre total). | ✅ | [#56](https://github.com/Cimavia/cimavia/issues/56) → ~~[#57](https://github.com/Cimavia/cimavia/issues/57)~~ ~~[#58](https://github.com/Cimavia/cimavia/issues/58)~~ ~~[#59](https://github.com/Cimavia/cimavia/issues/59)~~ |
| ~~Q-2~~ | ~~**nginx tourne en root dans l'image web**~~ (`apps/web/Dockerfile`), signalé par Sonar (`docker:S6471`). Passée à `nginxinc/nginx-unprivileged` (uid 101, port 8080). | ✅ | ~~[#83](https://github.com/Cimavia/cimavia/issues/83)~~ résolu en [#379](https://github.com/Cimavia/cimavia/issues/379) |
| ~~Q-3~~ | ~~**Les e2e ne sont pas typecheckés**~~ : `apps/api/test/` était hors de l'`include` du tsconfig, donc le seul filet de la couche API (cf. Q-1) tournait sans vérification de types — 16 erreurs y dormaient. | ✅ | résolu en **#130** ([#126](https://github.com/Cimavia/cimavia/issues/126)), complété en **#57** — `tsconfig.test.json` couvre `test/` **et** les deux configs Vitest, branché sur le `typecheck` de l'API |
| ~~Q-4~~ | ~~**Les composants et écrans web n'ont pas de filet** : la couverture est mesurée depuis #56, elle affiche ce qu'elle mesure. 169 fichiers `component/` + `screen/` (105 web, 64 mobile), dont **89** portent de la logique — état dérivé, filtres, tris, `switch` ; les 80 autres n'ont rien à affirmer.~~ Le harnais de rendu web et les **8 plus chargés** sont livrés en **#188** ; celui du mobile en **#156**. Le reste est faisable au coup par coup, le jour où on y touche. La bibliothèque (`feature/library`) est couverte en **#507**, le reste du web en **#508** : 99,9 % des lignes, 97,9 % des conditions, hors gardes mortes, supprimées en #512. Le mobile l'est en **#509** : 99,0 % des lignes, 97,2 % des conditions, hors gardes mortes (#512) et hors [#519](https://github.com/Cimavia/cimavia/issues/519). | ✅ | résolue en [#507](https://github.com/Cimavia/cimavia/issues/507), [#508](https://github.com/Cimavia/cimavia/issues/508) et [#509](https://github.com/Cimavia/cimavia/issues/509) — [#188](https://github.com/Cimavia/cimavia/issues/188) · volet mobile : **#156** (et non #137, qui ne traite que des adaptateurs de formatage — pointeur corrigé en #156) |
| ~~Q-5~~ | ~~**La Quality Gate bloque la CI alors que `main` est rouge**~~ : la période de code neuf était `days: 30`, héritée de l'instance et jamais choisie ; tout ce qui avait moins d'un mois pesait dans `new_coverage`, et le job sur `push: main` échouait à chaque merge. Le mode « previous version » n'était pas disponible tant qu'aucune version n'était envoyée au scan. | ✅ | [#186](https://github.com/Cimavia/cimavia/issues/186) pose `sonar.projectVersion` ; période passée en `previous_version` dans SonarCloud (constaté par l'API le 2026-09-25) ; [#318](https://github.com/Cimavia/cimavia/issues/318) rend sa référence juste — voir « Tranché en #318 » |
| Q-6 | **`accessibilityState` est invisible du harnais de rendu mobile** : `react-native-web` ne mappe PAS cette prop React Native héritée sur un attribut ARIA, là où `aria-checked` moderne passe. Le rendu **natif** l'honore — ce n'est donc pas un défaut d'accessibilité de l'app —, mais aucun test ne peut l'affirmer : `TrackingList` s'éprouve sur le « ✓ » que l'athlète voit. Trois autres composants en portent un (`RegisterScreen`, `ProfileScreen`, `CmvCapabilitySwitch`). **Même angle mort depuis #536** : `accessibilityActions`/`onAccessibilityAction` ne passent pas non plus — le pas d'accessibilité de `CmvSeekBar` s'éprouve en fonction pure (`nudge`), son câblage non. Sa valeur, elle, passe par `aria-value*`, rendues. | 🟢 | — *(déclencheur : un test qui voudrait affirmer sur l'état ARIA d'un composant mobile — la sortie est de passer ces quatre composants aux props modernes)* |
| Q-7 | **Le harnais de test mobile ne charge pas `@testing-library/jest-dom`**, là où celui du web le fait (`apps/web/vitest.setup.ts`) : ni `toBeDisabled`, ni `toHaveAttribute`, ni les autres matchers DOM. Un test qui veut affirmer sur l'état d'un bouton interroge donc `aria-disabled` à la main (`PlanningScreen.test.tsx`, #236). | 🟢 | — *(déclencheur : un deuxième fichier qui recopie le contournement — la sortie est la dépendance plus son import dans `test/setup.ts`, deux lignes)* |

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
> nœuds que `getAllByText` remonte. L'index disparaîtra le jour où le rôle sera posé.

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
> - **Une seule suite pour le déplacement : `describeReorder` (`apps/web/test/reorder.tsx`).** Sept
>   éditeurs recopient le même déplacement ([#360](https://github.com/Cimavia/cimavia/issues/360)) ;
>   ils passent tous la même suite de gestes — flèche, poignée au clavier, glisser —, qui dira à la
>   fusion qu'aucun n'a changé de sens. Le montage peut être asynchrone, pour les écrans routés.
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
> les chips de minuteur mobile (#519).

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
> n'est **pas** touché :
>
> - **Les bornes de ligne du corps restent.** L'issue prévoyait de couper `body-max-line-length`
>   et `footer-max-line-length`, sur la foi de lignes de 113 à 151 caractères dans le corps des
>   commits Dependabot. Mesurées à la règle, pas en lançant commitlint : celui-ci exempte toute
>   ligne qui contient une URL (`@commitlint/ensure`), et ce sont toutes des liens. Passés à la
>   config actuelle, #436, #135, les PR de sécurité #419 à #425 et la release #432 sortent sans un
>   seul problème. **Déclencheur** : le premier corps de robot refusé en CI — on coupe alors ces
>   deux règles, nos commits n'ayant pas de corps.
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

---

## v1.0 — Garde-fous du dépôt ([#621](https://github.com/Cimavia/cimavia/issues/621))

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
