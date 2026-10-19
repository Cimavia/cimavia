import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/component/CmvToast";

/**
 * L'enregistrement d'un écran par TOUS ses gestes — son bouton, et « Enregistrer » du dialogue de
 * sortie (#682), qui enregistre sans passer par le bouton fermé :
 *
 * - `blocker` dit ce qui retient l'envoi — une clé i18n, annoncée par un toast — ou `null` ;
 * - `submit` envoie, et rend ce qui est enregistré ;
 * - un échec rend `null` : il se dit par le toast de la mutation, ou par `onError`. `mutateAsync`
 *   REJETTE : sans cette capture, le rejet remonterait non capturé.
 *
 * Un geste lancé pendant qu'un envoi attend sa réponse ATTEND celui-là, puis rend `null` : rester.
 * Doublé, l'envoi créait deux fois ou se faisait refuser par sa propre version (#604) ; repris à son
 * compte, le résultat de l'envoi en vol taisait ce que le coach avait saisi depuis, et le dialogue
 * partait en le perdant. Seule la suite du premier geste agit.
 */
export function useCheckedSave<Args extends unknown[], Saved>(
  blocker: () => string | null,
  submit: (...args: Args) => Promise<Saved>,
  onError?: (error: unknown) => void,
): (...args: Args) => Promise<Saved | null> {
  const { t } = useTranslation();
  const toast = useToast();
  const inFlight = useRef<Promise<unknown> | null>(null);

  return async (...args) => {
    if (inFlight.current != null) {
      await inFlight.current;
      return null;
    }
    const blocked = blocker();
    if (blocked != null) {
      toast.error(t(blocked));
      return null;
    }
    const sent = submit(...args);
    // Ce que les gestes suivants attendent : réussi ou non, l'envoi est fini.
    inFlight.current = sent.catch(() => undefined);
    try {
      return await sent;
    } catch (error) {
      onError?.(error);
      return null;
    } finally {
      inFlight.current = null;
    }
  };
}
