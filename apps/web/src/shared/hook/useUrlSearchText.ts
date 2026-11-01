import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Le `?q=` d'une URL tel que les routes le valident : une chaîne non vide, ou rien. `?q=42` tapé à
 * la main est lu comme un nombre par le routeur, et écarté. Une seule règle pour les routes et pour
 * `useUrlSearchText`, qui compare la sienne à celle du routeur : deux lectures divergentes
 * l'empêcheraient de reconnaître une URL à jour.
 */
export function searchTextFromUrl(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

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
 * La comparaison se fait À CHAQUE RENDU, et pas dans un effet : une remise à zéro qui laisse `?q=`
 * comme le dernier rendu l'avait — une frappe pas encore rendue, puis Réinitialiser — ne change
 * pas `fromUrl`, et un effet qui en dépendrait ne la verrait pas. Pendant le rendu, le champ se
 * recale aussi sans afficher une image de l'ancien texte.
 *
 * `write` reçoit `undefined` pour un champ vide : un `?q=` vide dans l'URL serait du bruit.
 */
export function useUrlSearchText(
  fromUrl: string | undefined,
  write: (next: string | undefined) => void,
): [string, (next: string) => void] {
  const router = useRouter();
  const [text, setText] = useState(fromUrl ?? "");

  const latest = searchTextFromUrl((router.latestLocation.search as { q?: unknown }).q);
  if (fromUrl === latest && (fromUrl ?? "") !== text) setText(fromUrl ?? "");

  const change = (next: string) => {
    setText(next);
    write(next || undefined);
  };
  return [text, change];
}
