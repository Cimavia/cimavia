import { joinNames, type Phrase, type PhraseTools, translatePhrases } from "@cmv/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Le texte d'une phrase de `@cmv/shared` (#715) : ses clés traduites, ses listes de noms assemblées
 * dans la langue de l'athlète (« Squat et Tractions »). Le pendant mobile du hook web : les deux
 * passent par `joinNames`, pour écrire la même phrase.
 */
export function usePhraseText(): (phrases: readonly Phrase[]) => string {
  const { t } = useTranslation();
  return useMemo(() => {
    const tools: PhraseTools = {
      translate: (key, params) => t(key, params),
      formatList: (items) => joinNames(items, t("common.and")),
    };
    return (phrases) => translatePhrases(phrases, tools);
  }, [t]);
}
