import { renderHook } from "@testing-library/react";
import i18next from "i18next";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { usePhraseText } from "./usePhraseText";

/** Une vraie instance en français : la liste, sa conjonction traduite et l'interpolation. */
async function frenchWrapper() {
  const instance = i18next.createInstance();
  await instance.init({
    lng: "fr",
    resources: {
      fr: {
        translation: {
          common: { and: "et" },
          phrase: { who: "{{names}} en alternance", every: "toutes les {{duration}}" },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={instance}>{children}</I18nextProvider>
  );
}

describe("usePhraseText", () => {
  it("traduit les clés et assemble les listes dans la langue du Coach", async () => {
    const wrapper = await frenchWrapper();
    const { result } = renderHook(() => usePhraseText(), { wrapper });

    expect(
      result.current([
        { key: "phrase.every", params: { duration: "4'" } },
        { key: "phrase.who", params: { names: ["KB swing", "Burpees", "Gainage"] } },
      ]),
    ).toBe("toutes les 4'KB swing, Burpees et Gainage en alternance");
  });
});
