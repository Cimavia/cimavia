import type {
  CreateScheduledSessionInput,
  PlanDto,
  PlanWeekInput,
  UpdatePlanInput,
  UpdatePlanWeekInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPlanWeek,
  copyPlanWeek,
  createScheduledSession,
  deletePlanWeek,
  deleteScheduledSession,
  getPlan,
  planKeys,
  scheduledSessionKeys,
  updatePlan,
  updatePlanWeek,
  updateScheduledSession,
} from "@/feature/plan/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// La semaine QUI REÇOIT et celle qu'on recopie — nommées, parce que deux `string` côte à côte
// s'inversent en silence.
type PasteWeekVariables = { targetWeekId: string; sourcePlanWeekId: string };

export function usePlan(planId: string) {
  return useQuery<PlanDto>({
    queryKey: planKeys.detail(planId),
    queryFn: () => getPlan(planId),
  });
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
   * Ce qui définit le cycle : son titre, sa description, son début, son destinataire (#207).
   * Rangée avec les écritures du builder parce qu'elle invalide exactement les mêmes caches —
   * déplacer le début rejoue les dates de toutes les séances, et changer de destinataire déplace
   * le cycle ENTIER d'une vue athlète à une autre.
   *
   * Un seul toast pour les quatre champs : le formulaire les montre tous à l'écran, une
   * confirmation n'a pas à répéter ce qu'on vient d'y lire.
   */
  const saveHeader = useMutation({
    mutationFn: (input: UpdatePlanInput) => updatePlan(planId, input),
    onSuccess: done("plan.toast.headerSaved"),
    onError: toast.onError,
  });

  const addWeek = useMutation({
    mutationFn: (input: PlanWeekInput) => addPlanWeek(planId, input),
    onSuccess: done("plan.toast.weekAdded"),
    onError: toast.onError,
  });

  const updateWeek = useMutation({
    mutationFn: ({ weekId, input }: { weekId: string; input: UpdatePlanWeekInput }) =>
      updatePlanWeek(weekId, input),
    onSuccess: done("plan.toast.weekUpdated"),
    onError: toast.onError,
  });

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine (côté API).
  const removeWeek = useMutation({
    mutationFn: (weekId: string) => deletePlanWeek(weekId),
    onSuccess: done("plan.toast.weekDeleted"),
    onError: toast.onError,
  });

  /**
   * Colle une semaine ici — le contenu de la cible est REMPLACÉ (#4). Le toast annonce ce qui a
   * atterri : sans ce chiffre, un collage qui remplace 4 séances par 2 passerait inaperçu.
   */
  const pasteWeek = useMutation({
    mutationFn: ({ targetWeekId, sourcePlanWeekId }: PasteWeekVariables) =>
      copyPlanWeek(targetWeekId, { sourcePlanWeekId }),
    onSuccess: async (plan, { targetWeekId }) => {
      await invalidate();
      const pasted = plan.weeks.find((week) => week.id === targetWeekId);
      // La semaine cible est forcément dans la réponse (l'API rend le plan cible). Si elle
      // manquait, on confirme sans chiffre plutôt que d'annoncer un « 0 séance » inventé.
      if (pasted == null) {
        toast.onSuccess("plan.toast.weekPastedPlain");
        return;
      }
      toast.onSuccess("plan.toast.weekPasted", { count: String(pasted.sessions.length) });
    },
    onError: toast.onError,
  });

  const createSession = useMutation({
    mutationFn: ({ weekId, input }: { weekId: string; input: CreateScheduledSessionInput }) =>
      createScheduledSession(weekId, input),
    onSuccess: done("plan.toast.sessionCreated"),
    onError: toast.onError,
  });

  const saveSession = useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: UpdateScheduledSessionInput }) =>
      updateScheduledSession(sessionId, input),
    onSuccess: done("plan.toast.sessionSaved"),
    onError: toast.onError,
  });

  const removeSession = useMutation({
    mutationFn: (sessionId: string) => deleteScheduledSession(sessionId),
    onSuccess: done("plan.toast.sessionDeleted"),
    onError: toast.onError,
  });

  const isBusy =
    saveHeader.isPending ||
    addWeek.isPending ||
    updateWeek.isPending ||
    removeWeek.isPending ||
    pasteWeek.isPending ||
    createSession.isPending ||
    saveSession.isPending ||
    removeSession.isPending;

  return {
    saveHeader,
    addWeek,
    updateWeek,
    removeWeek,
    pasteWeek,
    createSession,
    saveSession,
    removeSession,
    isBusy,
  };
}
