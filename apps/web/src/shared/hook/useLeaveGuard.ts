import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export type LeaveGuard = {
  /**
   * Laisse partir la sortie qui suit : elle vient d'un enregistrement ou d'une suppression
   * réussis. À appeler juste avant de naviguer — l'écran n'a pas encore relu son état, et la
   * garde croirait la saisie toujours en attente.
   */
  release: () => void;
  /** À donner tel quel à `CmvLeaveDialog`. */
  dialog: { open: boolean; onStay: () => void; onLeave: () => void };
};

/**
 * Les écrans gardés MONTÉS, chacun par sa façon de poser la question. Un état de module plutôt
 * qu'un contexte, comme la pile de `CmvPanel` : ce qui le consulte (la barre latérale, la fenêtre
 * de reconnexion) ne vit pas sous l'écran gardé dans l'arbre React.
 */
const mountedGuards = new Set<() => Promise<boolean>>();

/**
 * Pour une sortie qui agit AVANT de naviguer — se déconnecter, changer de compte : elle demande
 * d'abord, et n'agit que sur « Quitter sans enregistrer » (#327). Sans saisie en attente, vrai
 * d'emblée.
 *
 * La garde du routeur ne suffit pas ici : elle ne voit que la navigation, qui vient en dernier. Le
 * coach qui choisissait « Rester » se retrouvait déjà déconnecté, sur un écran qu'il croyait garder.
 */
export function confirmLeave(): Promise<boolean> {
  const ask = [...mountedGuards].at(-1);
  return ask == null ? Promise.resolve(true) : ask();
}

/**
 * Demande confirmation avant de quitter un écran qui porte une saisie non enregistrée (#327) — lien
 * de la barre latérale, retour arrière, bouton Annuler, F5, fermeture d'onglet.
 *
 * Ne garde que ce qui CHANGE DE PAGE : un paramètre d'URL réécrit sur place (le `?add` qu'un
 * constructeur retire une fois lu, #303) ne fait rien perdre.
 *
 * L'état est lu par ref, pas par la fermeture du rendu : une sortie qui suit un enregistrement
 * part dans la même tâche que lui, avant que l'écran ne se redessine. La fonction de blocage
 * reste aussi STABLE — neuve à chaque rendu, le routeur la réinscrirait à chaque frappe.
 *
 * Fermer l'onglet ou recharger ne passe pas par le dialogue : le navigateur montre le sien, dont
 * aucun site ne choisit le texte.
 */
export function useLeaveGuard(isDirty: boolean): LeaveGuard {
  const dirty = useRef(isDirty);
  dirty.current = isDirty;
  const released = useRef(false);

  const isGuarded = useCallback(() => dirty.current && !released.current, []);
  const shouldBlockFn = useCallback(
    ({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
      current.pathname !== next.pathname && isGuarded(),
    [isGuarded],
  );

  const blocker = useBlocker({ shouldBlockFn, enableBeforeUnload: isGuarded, withResolver: true });

  // La question posée par `confirmLeave`, en attente de sa réponse.
  const [answer, setAnswer] = useState<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    const ask = () =>
      isGuarded()
        ? new Promise<boolean>((resolve) => setAnswer(() => resolve))
        : Promise.resolve(true);
    mountedGuards.add(ask);
    return () => {
      mountedGuards.delete(ask);
    };
  }, [isGuarded]);

  // Partir, c'est aussi lever la garde : la navigation qui suit la déconnexion ne doit pas
  // reposer la question.
  function reply(leave: boolean) {
    if (leave) released.current = true;
    answer?.(leave);
    setAnswer(null);
  }

  return {
    release: () => {
      released.current = true;
    },
    dialog: {
      open: blocker.status === "blocked" || answer != null,
      // Hors question de `confirmLeave`, c'est le routeur qui attend : `reset` refuse la
      // navigation, `proceed` la laisse partir. Hors blocage, ni l'un ni l'autre n'existe, et le
      // dialogue fermé n'a aucun bouton pour les appeler.
      onStay: () => (answer == null ? blocker.reset?.() : reply(false)),
      onLeave: () => (answer == null ? blocker.proceed?.() : reply(true)),
    },
  };
}
