import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Harnais de test du mobile. **Vitest et non `jest-expo`**, et depuis #156 il rend aussi de VRAIS
 * composants React Native — les deux tiennent ensemble, contrairement à ce que #59 supposait.
 *
 * #59 fermait `jest-expo` sur deux raisons, toutes deux encore valides : `architecture-choice.md`
 * §11 dit « Vitest » pour les trois couches, et ce que le préréglage Expo apporte est le rendu
 * d'un arbre natif, que les cibles d'alors ne traversaient pas. La conclusion tirée à l'époque —
 * « le jour où l'on voudra rendre un écran, la question se rouvrira » — n'avait pas envisagé la
 * TROISIÈME voie : `react-native-web`. C'est un alias de résolution, pas un second runner ; §11
 * reste tenue, et rien de la chaîne Metro n'est touché (`expo export` ne lit pas ce fichier).
 *
 * Ce que l'alias résout : Vite transforme avec esbuild, qui ne sait PAS effacer les annotations
 * Flow dont `react-native` est écrit. Le paquet natif est donc hors de portée par construction, et
 * pas seulement lourd à charger. `react-native-web` est déjà une dépendance de production (Expo
 * web) et rend le même arbre en DOM — ce qui rend Testing Library utilisable tel quel.
 */
export default defineConfig({
  /**
   * `__DEV__` est une globale que Metro injecte et que Vite ignore : sans elle, `expo-modules-core`
   * lève une `ReferenceError` au premier import. `true` et non `false` — c'est la valeur d'un
   * environnement de développement, celle sous laquelle les assertions de développement tournent.
   */
  define: { __DEV__: "true" },
  resolve: {
    /**
     * Table sous forme de LISTE et non d'objet : un alias objet fait du remplacement de PRÉFIXE,
     * si bien que `"react-native"` réécrirait aussi `react-native-keyboard-controller` en
     * `react-native-webkeyboard-controller`. L'ancre `$` de la regex est ce qui l'en empêche.
     *
     * Aucun alias n'est hérité d'un `vite.config.ts` ici — le mobile n'en a pas, il est bâti par
     * Metro. Le `@/` est donc redéclaré, en miroir des `paths` du tsconfig.
     */
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, ".")}/` },
      {
        find: /^@cmv\/shared$/,
        replacement: path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
      },
      {
        find: /^@cmv\/tokens$/,
        replacement: path.resolve(import.meta.dirname, "../../packages/tokens/src/index.ts"),
      },
    ],
  },
  test: {
    /**
     * `jsdom` pour que React ait un hôte où monter — c'est en DOM que `react-native-web` rend, et
     * `react-dom` est déjà une dépendance du mobile.
     */
    environment: "jsdom",
    setupFiles: ["./test/setup.ts", "./test/native.tsx"],
    server: {
      deps: {
        /**
         * Ces paquets doivent passer par la transformation de Vite plutôt que par le chargeur de
         * Node. Deux raisons distinctes, et il faut les deux : `@expo/vector-icons` importe SANS
         * extension (`./createIconSet`), que Node ESM refuse de résoudre ; `expo-modules-core`
         * publie du TypeScript brut, que Node refuse de compiler depuis `node_modules`.
         */
        inline: [/expo/, /react-native/, /@react-native/, /nativewind/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      /**
       * Tout le code du mobile, `app/` compris. Ce dossier ne fait que 243 lignes, presque toutes
       * des shells d'une ligne (règle dure n°4) : l'exclure serait un réflexe, pas une raison.
       * Sans `include`, un fichier qu'aucun test n'importe disparaîtrait du lcov — et Sonar lit un
       * fichier absent comme 0 %, pas comme non mesuré (« Tranché en #57 »).
       */
      include: ["{app,feature,shared}/**/*.{ts,tsx}"],
      // Chaque ligne a sa jumelle dans `sonar.coverage.exclusions` : une exclusion posée d'un seul
      // côté fait compter zéro au lieu de retirer du calcul.
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/index.ts"],
    },
  },
});
