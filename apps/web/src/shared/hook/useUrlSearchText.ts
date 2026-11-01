import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Le texte d'une barre de recherche écrite dans l'URL (`?q=`), tenu par le champ lui-même (#734).
 *
 * Le routeur applique chaque navigation dans un `startTransition` : un champ dont la valeur serait
 * relue dans l'URL retomberait sur l'ancienne à chaque frappe, le temps que la transition aboutisse,
 * et une frappe plus rapide qu'elle repartirait de ce texte périmé — « bel » tapé vite devenait
 * « l ». Le champ garde donc sa saisie, et l'URL la suit.
 *
 * L'URL rendue (`fromUrl`) n'écrase la saisie que si elle est À JOUR : le routeur tient
 * `latestLocation` dès la navigation, sans attendre la transition. Une URL rendue qui en diffère
 * est l'écho en retard d'une frappe déjà dépassée, et n'efface rien ; une URL rendue qui l'a
 * rattrapée et dit autre chose que le champ vient d'ailleurs (Réinitialiser, bouton Retour). Rien à
 * tenir en file : une transition qui saute des étapes ne laisse pas d'écho en suspens.
 *
 * `write` reçoit `undefined` pour un champ vide : un `?q=` vide dans l'URL serait du bruit.
 */
export function useUrlSearchText(
  fromUrl: string | undefined,
  write: (next: string | undefined) => void,
): [string, (next: string) => void] {
  const router = useRouter();
  const [text, setText] = useState(fromUrl ?? "");

  useEffect(() => {
    const latest = router.latestLocation.search as { q?: unknown };
    const current = typeof latest.q === "string" && latest.q.length > 0 ? latest.q : undefined;
    if (fromUrl === current && (fromUrl ?? "") !== text) setText(fromUrl ?? "");
  }, [router, fromUrl, text]);

  const change = (next: string) => {
    setText(next);
    write(next || undefined);
  };
  return [text, change];
}
