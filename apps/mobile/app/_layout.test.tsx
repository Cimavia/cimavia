import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "@/app/_layout";
import { CmvCrashScreen } from "@/shared/component/CmvCrashScreen";

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
});
