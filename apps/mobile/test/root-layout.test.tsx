import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout, { ErrorBoundary } from "@/app/_layout";
import { CmvCrashScreen } from "@/shared/component/CmvCrashScreen";
import { useSentryUser } from "@/shared/hook/useSentryUser";

vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Ce test vit ICI et non à côté de `app/_layout.tsx`, contre l'usage du dépôt — et ce n'est pas
 * un choix de rangement.
 *
 * Expo-router construit ses routes par `require.context(APP_ROOT, true, /.*\.[tj]sx?$/)` : TOUT
 * fichier `.ts`/`.tsx` sous `app/` est embarqué comme une route, seuls `+api` et `+html` étant
 * exclus. Un fichier de test y importerait `vitest`, donc `vite`, dont le code Node contient un
 * `import(filepath)` dynamique que Metro refuse — et le bundle mobile ENTIER cesse de se
 * construire, avec une erreur qui ne nomme ni le test ni la route.
 *
 * Contrairement à TanStack côté web, qui avertit et se laisse configurer, expo-router n'offre
 * aucun moyen d'ignorer un fichier. `app/` ne peut donc contenir aucun test, jamais.
 */
describe("layout racine", () => {
  it("expose l'écran de crash sous le nom qu'expo-router branche", () => {
    /**
     * Ce test ne vérifie pas un comportement mais un CÂBLAGE, invisible autrement : expo-router
     * n'enveloppe le layout dans son `Try` que si le fichier exporte un nom `ErrorBoundary`
     * exactement. Renommer cet export, ou le retirer en « nettoyant » un fichier qui n'a par
     * ailleurs aucune raison de contenir autre chose qu'un shell, ferait retomber l'app au
     * comportement d'avant — fermeture pure et simple — sans qu'aucun test ne devienne rouge.
     */
    expect(ErrorBoundary).toBe(CmvCrashScreen);
  });

  it("pose l'identité Sentry ici, et pas dans un écran", () => {
    render(<RootLayout />);

    // C'est le seul composant monté sur TOUTES les routes. Déplacer cet appel dans un écran —
    // même celui du tableau de bord — le retirerait des écrans d'authentification, où un crash
    // redeviendrait anonyme. Ce test est ce qui rend ce déplacement rouge.
    expect(useSentryUser).toHaveBeenCalled();
  });
});
