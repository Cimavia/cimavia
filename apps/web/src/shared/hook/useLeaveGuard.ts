import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Enregistre la saisie de l'écran SANS le quitter, et dit si tout est parti. Un refus — titre
 * manquant, saisie refusée, conflit, envoi interrompu — rend `false` et le dit lui-même, à l'écran :
 * la garde, elle, ne fait que retenir la sortie. Ne rejette jamais.
 */
export type SaveBeforeLeaving = () => Promise<boolean>;

/** Ce que `CmvLeaveDialog` reçoit — de la garde, ou de la fermeture d'un panneau. */
export type LeaveDialogProps = {
  open: boolean;
  /** Un enregistrement court : les trois boutons sont fermés, Échap ne fait rien. */
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export type LeaveGuard = {
  /**
   * Laisse partir la sortie qui suit : elle vient d'un enregistrement ou d'une suppression
   * réussis. À appeler juste avant de naviguer — l'écran n'a pas encore relu son état, et la
   * garde croirait la saisie toujours en attente.
   */
  release: () => void;
  /** À donner tel quel à `CmvLeaveDialog`. */
  dialog: LeaveDialogProps;
};

/**
 * La réponse du coach à `confirmLeave` : `save` (enregistrer, puis partir), `leave` (partir sans
 * enregistrer — ou rien à enregistrer), `stay` (rester).
 */
export type LeaveChoice = "save" | "leave" | "stay";

/** Un écran gardé MONTÉ, tel que `confirmLeave` et `saveBeforeLeaving` le consultent. */
type MountedGuard = {
  ask: (saveNow: boolean) => Promise<LeaveChoice>;
  save: SaveBeforeLeaving;
};

/**
 * Les écrans gardés MONTÉS. Un état de module plutôt qu'un contexte, comme la pile de `CmvPanel` :
 * ce qui le consulte (la barre latérale, la fenêtre de reconnexion) ne vit pas sous l'écran gardé
 * dans l'arbre React.
 */
const mountedGuards = new Set<MountedGuard>();

const topGuard = () => [...mountedGuards].at(-1);

/**
 * Pour une sortie qui agit AVANT de naviguer — se déconnecter, changer de compte : elle demande
 * d'abord, et n'agit que si le coach part (#327). Sans saisie en attente, `leave` d'emblée.
 *
 * La garde du routeur ne suffit pas ici : elle ne voit que la navigation, qui vient en dernier. Le
 * coach qui choisissait « Rester » se retrouvait déjà déconnecté, sur un écran qu'il croyait garder.
 *
 * `saveNow` (par défaut) : « Enregistrer » enregistre DANS le dialogue, qui reste ouvert le temps
 * de l'envoi ; `save` veut alors dire « enregistré », et un échec répond `stay` (#682). Faux, la
 * question se ferme sur `save` sans rien envoyer, et l'appelant enregistre quand il le peut
 * (`saveBeforeLeaving`) — la session perdue, qui doit d'abord être reprise.
 */
export function confirmLeave({ saveNow = true } = {}): Promise<LeaveChoice> {
  return topGuard()?.ask(saveNow) ?? Promise.resolve("leave");
}

/**
 * Enregistre l'écran gardé, puis lève sa garde si tout est parti : la sortie qui suit n'a plus
 * rien à demander. Le pendant de `confirmLeave({ saveNow: false })`. Vrai sans écran gardé.
 */
export function saveBeforeLeaving(): Promise<boolean> {
  return topGuard()?.save() ?? Promise.resolve(true);
}

/**
 * Demande quoi faire avant de quitter un écran qui porte une saisie non enregistrée (#327) — lien
 * de la barre latérale, retour arrière, bouton Annuler, F5, fermeture d'onglet. « Enregistrer »
 * passe par `save`, et ne part que s'il a TOUT envoyé (#682) : un refus ferme le dialogue et
 * refuse la navigation, l'écran dit pourquoi.
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
export function useLeaveGuard(isDirty: boolean, save: SaveBeforeLeaving): LeaveGuard {
  const dirty = useRef(isDirty);
  dirty.current = isDirty;
  const latestSave = useRef(save);
  latestSave.current = save;
  const released = useRef(false);
  // Rien en attente : la levée a servi. Une saisie reprise ensuite — la déconnexion qui suit
  // l'enregistrement a échoué, le coach est resté — se garde de nouveau.
  if (!isDirty) released.current = false;
  const [isSaving, setSaving] = useState(false);

  const isGuarded = useCallback(() => dirty.current && !released.current, []);
  const shouldBlockFn = useCallback(
    ({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
      current.pathname !== next.pathname && isGuarded(),
    [isGuarded],
  );

  const blocker = useBlocker({ shouldBlockFn, enableBeforeUnload: isGuarded, withResolver: true });

  /** Enregistre, et lève la garde si tout est parti. L'état occupé ferme le dialogue au geste. */
  const saveAndRelease = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await latestSave.current();
      if (saved) released.current = true;
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  // La question posée par `confirmLeave`, en attente de sa réponse.
  const [question, setQuestion] = useState<{
    saveNow: boolean;
    answer: (choice: LeaveChoice) => void;
  } | null>(null);
  useEffect(() => {
    const guard: MountedGuard = {
      ask: (saveNow) =>
        isGuarded()
          ? new Promise<LeaveChoice>((answer) => setQuestion({ saveNow, answer }))
          : Promise.resolve("leave"),
      save: () => (isGuarded() ? saveAndRelease() : Promise.resolve(true)),
    };
    mountedGuards.add(guard);
    return () => {
      mountedGuards.delete(guard);
    };
  }, [isGuarded, saveAndRelease]);

  // Partir sans enregistrer, c'est aussi lever la garde : la navigation qui suit la déconnexion
  // ne doit pas reposer la question. Un `save` différé, lui, ne la lève qu'une fois enregistré.
  function reply(choice: LeaveChoice) {
    if (choice === "leave") released.current = true;
    question?.answer(choice);
    setQuestion(null);
  }

  // Hors question de `confirmLeave`, c'est le routeur qui attend : `reset` refuse la navigation,
  // `proceed` la laisse partir. Hors blocage, ni l'un ni l'autre n'existe, et le dialogue fermé
  // n'a aucun bouton pour les appeler.
  async function onSave() {
    if (question?.saveNow === false) {
      reply("save");
      return;
    }
    const saved = await saveAndRelease();
    if (question != null) reply(saved ? "save" : "stay");
    else if (saved) blocker.proceed?.();
    else blocker.reset?.();
  }

  return {
    release: () => {
      released.current = true;
    },
    dialog: {
      open: blocker.status === "blocked" || question != null,
      isSaving,
      onSave,
      onDiscard: () => (question == null ? blocker.proceed?.() : reply("leave")),
      onCancel: () => (question == null ? blocker.reset?.() : reply("stay")),
    },
  };
}
