import { type Phrase, type PhraseTools, translatePhrases } from "@cmv/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Le texte d'une phrase de `@cmv/shared` (#715) : ses clés traduites, ses listes de noms assemblées
 * dans la langue du Coach (« KB swing et Burpees »). La règle choisit les clés, l'app les écrit.
 */
export function usePhraseText(): (phrases: readonly Phrase[]) => string {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const list = new Intl.ListFormat(i18n.language, { style: "long", type: "conjunction" });
    const tools: PhraseTools = {
      translate: (key, params) => t(key, params),
      formatList: (items) => list.format(items),
    };
    return (phrases) => translatePhrases(phrases, tools);
  }, [t, i18n.language]);
}
