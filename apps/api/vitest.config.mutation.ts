import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import e2e from "./vitest.config.e2e";

/**
 * Le juge du mutation testing de la tenancy (#626) : la suite e2e, et non un mock — l'extension se
 * teste en intégration (« Tranché en #506 »), c'est donc là qu'un filtre retiré doit faire échouer
 * un test. S'y ajoutent les unitaires des deux dossiers mutés, qui tiennent ce que le HTTP
 * n'atteint pas (contexte absent, `?as=` invalide) : `mergeConfig` concatène les `include`.
 */
export default mergeConfig(
  e2e,
  defineConfig({
    test: {
      include: ["src/tenancy/**/*.test.ts", "src/auth/decorator/**/*.test.ts"],
      // Le `dist` compilé ne porte aucun mutant : cette spec ne jugerait rien, et `test:mutation`
      // ne le construit pas (#671).
      exclude: [...configDefaults.exclude, "test/compiled-dist.e2e-spec.ts"],
      coverage: { enabled: false },
    },
  }),
);
