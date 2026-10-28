import type {
  CreateScheduledSessionInput,
  PlanDto,
  PlanWeekInput,
  ScheduledCompositionInput,
  UpdatePlanInput,
  UpdatePlanWeekInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPlanWeek,
  composeScheduledSession,
  copyPlanWeek,
  createScheduledSession,
  deletePlanWeek,
  deleteScheduledSession,
  getPlan,
  getScheduledSession,
  getScheduledSessionCopies,
  planKeys,
  reorderPlanDay,
  resetScheduledComposition,
  scheduledSessionKeys,
  updatePlan,
  updatePlanWeek,
  updateScheduledSession,
} from "@/feature/plan/api";
import { forgetPlanClipboardSource } from "@/feature/plan/hook/usePlanClipboard";
import { useStaleWriteError } from "@/feature/plan/hook/useStaleWriteError";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { isStaleWriteError } from "@/shared/lib/api";

// La version de la semaine telle que le geste l'a vue (#604) : l'API refuse une grille périmée.
type AtWeekVersion = { expectedUpdatedAt: string };

// La semaine QUI REÇOIT et celle qu'on recopie — nommées, parce que deux `string` côte à côte
// s'inversent en silence. La version est celle de la cible : c'est elle que le collage écrase.
type PasteWeekVariables = AtWeekVersion & { targetWeekId: string; sourcePlanWeekId: string };

// La journée visée et l'ordre voulu, en entier — l'API refuse un sous-ensemble.
type ReorderDayVariables = AtWeekVersion & { weekId: string; date: string; sessionIds: string[] };

type RemoveWeekVariables = AtWeekVersion & { weekId: string };

// La séance ouverte, et la version sur laquelle la saisie a commencé (#604).
type OpenedSessionVariables = { sessionId: string; expectedUpdatedAt: string };

export const planDetailQuery = (id: string) => ({
  queryKey: planKeys.detail(id),
  queryFn: () => getPlan(id),
});

/**
 * Toutes les écritures d'un cycle portent cette clé : l'occupation se lit sur le CYCLE, pas sur
 * l'instance du hook. Une séance enregistrée depuis le panneau fait avancer sa semaine (#604) ; la
 * carte de la semaine doit attendre la relecture, sans quoi son geste suivant citerait la version
 * d'avant.
 */
const planWriteKey = (planId: string) => ["plans", "write", planId] as const;

/** La lecture d'une séance planifiée, partagée par le panneau et son « Recharger » (#604). */
export const scheduledSessionDetailQuery = (id: string) => ({
  queryKey: scheduledSessionKeys.detail(id),
  queryFn: () => getScheduledSession(id),
});

/** Les copies de la séance-type dans le cycle (#720) : la fenêtre « Pour quelles semaines ? » les coche. */
export function useScheduledSessionCopies(sessionId: string) {
  return useQuery({
    queryKey: scheduledSessionKeys.copies(sessionId),
    queryFn: () => getScheduledSessionCopies(sessionId),
  });
}

export function usePlan(planId: string) {
  return useQuery<PlanDto>(planDetailQuery(planId));
}

/**
 * Écritures du builder. Toutes invalident les DEUX racines : `plans` (le détail du cycle et les
 * compteurs de la liste) et `scheduled-sessions` (le détail d'une instance ouverte). Sans quoi le
 * panneau rouvert afficherait la composition d'avant l'enregistrement.
 * Chaque mutation confirme son effet par un toast — succès comme erreur.
 */
export function usePlanMutations(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  const mutationKey = planWriteKey(planId);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: planKeys.all });
    await queryClient.invalidateQueries({ queryKey: scheduledSessionKeys.all });
    // Ajuster un cycle DIFFUSÉ change ce que lit l'athlète, et en auto-coaching c'est le MÊME
    // cache (#14). Sans effet pour un coach pur, dont le cache n'a pas cette clé.
    await queryClient.invalidateQueries({ queryKey: myPlanKeys.all });
  };

  const done = (messageKey: string) => async () => {
    await invalidate();
    toast.onSuccess(messageKey);
  };

  /**
   * Le cycle rendu par un geste sur une semaine porte déjà ses nouvelles versions (#604) : posé en
   * cache avant la relecture, il évite qu'un geste enchaîné cite la version d'avant et se voie
   * refuser le sien.
   */
  const settle = async (plan: PlanDto) => {
    queryClient.setQueryData(planKeys.detail(planId), plan);
    await invalidate();
  };

  const settled = (messageKey: string) => async (plan: PlanDto) => {
    await settle(plan);
    toast.onSuccess(messageKey);
  };

  // Glisser, coller, retirer, changer un type, ajouter : un geste sans saisie (#604).
  const onGestureError = useStaleWriteError("plan.toast.stale", invalidate);

  /**
   * Un formulaire avec saisie — l'en-tête, le panneau de séance — refusé sur une version périmée
   * (#604) : pas de toast, le formulaire le dit à côté de la saisie, avec de quoi recharger.
   */
  const onFormError = (error: unknown) => {
    if (!isStaleWriteError(error)) toast.onError(error);
  };

  /**
   * Ce qui définit le cycle : son titre, sa description, son début, son destinataire (#207).
   * Rangée avec les écritures du builder parce qu'elle invalide exactement les mêmes caches —
   * déplacer le début rejoue les dates de toutes les séances, et changer de destinataire déplace
   * le cycle ENTIER d'une vue athlète à une autre.
   *
   * Un seul toast pour les quatre champs : le formulaire les montre tous à l'écran, une
   * confirmation n'a pas à répéter ce qu'on vient d'y lire.
   */
  const saveHeader = useMutation({
    mutationKey,
    mutationFn: (input: UpdatePlanInput) => updatePlan(planId, input),
    onSuccess: done("plan.toast.headerSaved"),
    onError: onFormError,
  });

  const addWeek = useMutation({
    mutationKey,
    mutationFn: (input: PlanWeekInput) => addPlanWeek(planId, input),
    onSuccess: settled("plan.toast.weekAdded"),
    // Sans version, mais deux ajouts croisés visent le même numéro : le refusé reçoit un 409.
    onError: onGestureError,
  });

  const updateWeek = useMutation({
    mutationKey,
    mutationFn: ({ weekId, input }: { weekId: string; input: UpdatePlanWeekInput }) =>
      updatePlanWeek(weekId, input),
    onSuccess: settled("plan.toast.weekUpdated"),
    onError: onGestureError,
  });

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine (côté API).
  const removeWeek = useMutation({
    mutationKey,
    mutationFn: ({ weekId, expectedUpdatedAt }: RemoveWeekVariables) =>
      deletePlanWeek(weekId, { expectedUpdatedAt }),
    onSuccess: async (plan, { weekId }) => {
      // Si c'était la semaine copiée, le bandeau ne doit plus proposer de la coller (#341).
      forgetPlanClipboardSource({ planWeekId: weekId });
      await settled("plan.toast.weekDeleted")(plan);
    },
    onError: onGestureError,
  });

  /**
   * Colle une semaine ici — le contenu de la cible est REMPLACÉ (#4). Le toast annonce ce qui a
   * atterri : sans ce chiffre, un collage qui remplace 4 séances par 2 passerait inaperçu.
   */
  const pasteWeek = useMutation({
    mutationKey,
    mutationFn: ({ targetWeekId, ...input }: PasteWeekVariables) =>
      copyPlanWeek(targetWeekId, input),
    onSuccess: async (plan, { targetWeekId }) => {
      await settle(plan);
      const pasted = plan.weeks.find((week) => week.id === targetWeekId);
      // La semaine cible est forcément dans la réponse (l'API rend le plan cible). Si elle
      // manquait, on confirme sans chiffre plutôt que d'annoncer un « 0 séance » inventé.
      if (pasted == null) {
        toast.onSuccess("plan.toast.weekPastedPlain");
        return;
      }
      toast.onSuccess("plan.toast.weekPasted", { count: String(pasted.sessions.length) });
    },
    onError: onGestureError,
  });

  /**
   * L'ordre des séances d'une journée (#148). Aucun toast de succès : le coach vient de déposer la
   * carte à sa nouvelle place et la voit y rester — le lui confirmer par un bandeau à chaque
   * glissement transformerait un geste fluide en notification permanente. L'échec, lui, se dit.
   */
  const reorderDay = useMutation({
    mutationKey,
    mutationFn: ({ weekId, date, ...input }: ReorderDayVariables) =>
      reorderPlanDay(weekId, date, input),
    onSuccess: settle,
    onError: onGestureError,
  });

  const createSession = useMutation({
    mutationKey,
    mutationFn: ({ weekId, input }: { weekId: string; input: CreateScheduledSessionInput }) =>
      createScheduledSession(weekId, input),
    onSuccess: done("plan.toast.sessionCreated"),
    onError: toast.onError,
  });

  const saveSession = useMutation({
    mutationKey,
    mutationFn: ({ sessionId, input }: { sessionId: string; input: UpdateScheduledSessionInput }) =>
      updateScheduledSession(sessionId, input),
    onSuccess: done("plan.toast.sessionSaved"),
    onError: onFormError,
  });

  const removeSession = useMutation({
    mutationKey,
    mutationFn: ({ sessionId, expectedUpdatedAt }: OpenedSessionVariables) =>
      deleteScheduledSession(sessionId, { expectedUpdatedAt }),
    onSuccess: done("plan.toast.sessionDeleted"),
    onError: onFormError,
  });

  /**
   * La composition d'une séance par blocs (#720), écrite geste par geste. Rend les copies, d'où le
   * panneau tire la nouvelle version de sa séance : « Enregistrer » la citera ensuite.
   */
  const composeSession = useMutation({
    mutationKey,
    mutationFn: ({ sessionId, input }: { sessionId: string; input: ScheduledCompositionInput }) =>
      composeScheduledSession(sessionId, input),
    onSuccess: done("plan.toast.compositionSaved"),
    onError: onFormError,
  });

  const resetComposition = useMutation({
    mutationKey,
    mutationFn: ({ sessionId, expectedUpdatedAt }: OpenedSessionVariables) =>
      resetScheduledComposition(sessionId, { expectedUpdatedAt }),
    onSuccess: done("plan.toast.compositionReset"),
    onError: onFormError,
  });

  const isBusy = useIsMutating({ mutationKey }) > 0;

  return {
    saveHeader,
    addWeek,
    updateWeek,
    removeWeek,
    pasteWeek,
    reorderDay,
    createSession,
    saveSession,
    removeSession,
    composeSession,
    resetComposition,
    isBusy,
  };
}
