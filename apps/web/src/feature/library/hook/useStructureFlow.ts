import { type StructureSettings, settingsPhrase } from "@cmv/shared";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/**
 * Le déroulé d'une structure seule, sans exercice : on y dit « tours » (`settingsPhrase`). La liste
 * des structures et le sélecteur du constructeur de séance (#719) le lisent de la même façon.
 */
export function useStructureFlow(): (settings: StructureSettings) => string {
  const text = usePhraseText();
  // Sans exercice, « un seul par bip » ne peut pas manquer de bips : la phrase existe toujours.
  return (settings) => text(settingsPhrase(settings, null) ?? []);
}
