import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Harnais de test du mobile. **Vitest et non `jest-expo`**, contrairement à ce que #59 posait
 * comme un choix ouvert :
 *
 *  1. `architecture-choice.md` §11 a déjà tranché — Vitest pour les tests, dans les trois couches.
 *     Un second runner dans le monorepo aurait exigé une décision qui contredise ce doc.
 *  2. Surtout, ce que `jest-expo` apporte est le RENDU d'un arbre React Native (son transformeur,
 *     ses mocks de modules natifs). Or les cibles d'ici n'importent aucun runtime natif : `tabs.ts`
 *     et `route.util.ts` ne prennent d'`expo-router` qu'un type, et `useSegmentRunner` ne dépend que
 *     de React. Payer le préréglage Expo pour du code qui n'en traverse rien serait cher pour rien.
 *
 * Aucun alias n'est hérité d'un `vite.config.ts` ici — le mobile n'en a pas, il est bâti par Metro.
 * Le `@/` est donc redéclaré, en miroir des `paths` du tsconfig.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "@cmv/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
      "@cmv/tokens": path.resolve(import.meta.dirname, "../../packages/tokens/src/index.ts"),
    },
  },
  test: {
    /**
     * `jsdom` pour que React ait un hôte où monter : `renderHook` a besoin d'un renderer, et
     * `react-dom` est DÉJÀ une dépendance du mobile (react-native-web). Ce qu'on éprouve reste la
     * machine à états du hook — pas un rendu natif, qui n'est pas le sujet.
     */
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
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
