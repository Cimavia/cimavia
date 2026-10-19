import { useRef } from "react";

/**
 * Un enregistrement à la fois : appelé pendant qu'un envoi est en vol, `run` rend CELUI-LÀ au lieu
 * d'en lancer un second.
 *
 * Deux gestes enregistrent le même écran depuis #682 — son bouton, et « Enregistrer » du dialogue
 * de sortie, que le coach peut ouvrir pendant que le premier envoi attend sa réponse. Doublé, une
 * création partait deux fois, et une modification citait une version que l'envoi précédent venait
 * de dépasser : un conflit contre soi-même. Rejoindre l'envoi en vol enregistre ce que le coach a
 * demandé, une fois.
 */
export function useSingleFlight<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  const inFlight = useRef<Promise<Result> | null>(null);
  return (...args) => {
    if (inFlight.current != null) return inFlight.current;
    const started = run(...args).finally(() => {
      inFlight.current = null;
    });
    inFlight.current = started;
    return started;
  };
}
