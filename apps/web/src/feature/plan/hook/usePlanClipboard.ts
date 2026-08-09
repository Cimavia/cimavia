import { useSyncExternalStore } from "react";

// Ce que le presse-papier retient : de quoi coller (`planWeekId`), et de quoi le DIRE au coach
// pendant qu'il navigue vers un autre cycle — sans le titre, le bandeau ne saurait pas nommer
// ce qui est armé.
export type PlanWeekClipboard = {
  planWeekId: string;
  planId: string;
  planTitle: string;
  weekNumber: number;
};

/**
 * Presse-papier de semaine (#4). Trois contraintes le décident :
 *
 * - il doit survivre au CHANGEMENT DE ROUTE — copier dans un cycle pour coller dans un autre est
 *   la moitié de la feature, et un `useState` mourrait au démontage du builder ;
 * - il doit mourir avec l'ONGLET — une semaine copiée la semaine dernière ne doit pas rouvrir un
 *   bouton « Coller » armé sur un cycle qu'on ne regarde plus ;
 * - il est lu par des composants FRÈRES (chaque carte de semaine, plus le bandeau du builder).
 *
 * D'où `sessionStorage` + `useSyncExternalStore` plutôt qu'un provider : le stockage EST déjà
 * l'état partagé, un contexte ne ferait que le recopier en mémoire.
 */
const STORAGE_KEY = "cmv.planClipboard";

const listeners = new Set<() => void>();
let snapshot: PlanWeekClipboard | null = readStorage();

function readStorage(): PlanWeekClipboard | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as PlanWeekClipboard;
  } catch {
    // Contenu illisible (format changé entre deux versions, écriture interrompue) : on repart de
    // rien plutôt que de laisser un presse-papier corrompu armer un bouton destructeur.
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function write(next: PlanWeekClipboard | null): void {
  snapshot = next;
  if (next == null) {
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// `useSyncExternalStore` exige un instantané STABLE en identité : on rend la valeur mise en cache
// par `write`, jamais un `JSON.parse` frais (qui rendrait un nouvel objet à chaque rendu → boucle).
function getSnapshot(): PlanWeekClipboard | null {
  return snapshot;
}

export function usePlanClipboard() {
  const clipboard = useSyncExternalStore(subscribe, getSnapshot);

  return {
    clipboard,
    copyWeek: (entry: PlanWeekClipboard) => write(entry),
    // Coller ne vide PAS le presse-papier : reproduire une même semaine sur plusieurs semaines du
    // cycle est le geste courant. Le coach le désarme lui-même, depuis le bandeau.
    clearClipboard: () => write(null),
  };
}
