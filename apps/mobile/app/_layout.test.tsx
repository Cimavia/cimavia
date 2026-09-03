import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout, { ErrorBoundary } from "@/app/_layout";
import { CmvCrashScreen } from "@/shared/component/CmvCrashScreen";
import { useSentryUser } from "@/shared/hook/useSentryUser";

vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

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
