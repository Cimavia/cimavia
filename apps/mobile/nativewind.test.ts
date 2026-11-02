import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Le dossier physique du paquet résolu depuis `from` : pnpm installe une copie par version ET par
 * jeu de pairs, et seul le chemin réel dit si deux résolutions tombent sur la même.
 */
function physicalCopy(packageName: string, from: string): string {
  return realpathSync(createRequire(from).resolve(`${packageName}/package.json`));
}

describe("nativewind — une seule copie de react-native-css-interop", () => {
  it("résout depuis l'app la copie dont dépend nativewind", () => {
    // Deux copies, et plus aucune classe ne s'applique — sans erreur ni avertissement (1.16.0) :
    // Metro remplace `global.css` par un import résolu depuis l'APP, qui enregistre les styles,
    // tandis que `jsxImportSource: "nativewind"` les lit par la copie de NATIVEWIND. La version
    // déclarée par `@cmv/mobile` doit donc rester celle, exacte, qu'exige `nativewind`.
    const fromApp = import.meta.filename;
    const fromNativewind = createRequire(fromApp).resolve("nativewind/package.json");

    expect(physicalCopy("react-native-css-interop", fromApp)).toBe(
      physicalCopy("react-native-css-interop", fromNativewind),
    );
  });
});
