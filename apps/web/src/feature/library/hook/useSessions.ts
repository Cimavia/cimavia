import type { CreateSessionInput, SessionDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  reloadSessionExercise,
  sessionKeys,
  updateSession,
} from "@/feature/library/api";

export function useSessions() {
  return useQuery<SessionDto[]>({
    queryKey: sessionKeys.list(),
    queryFn: listSessions,
  });
}

type SaveSessionArgs = {
  // null = création ; sinon édition de cette séance.
  session: SessionDto | null;
  input: CreateSessionInput;
};

export function useSaveSession() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ session, input }: SaveSessionArgs) =>
      session == null
        ? createSession(input)
        : // Le PUT exige la représentation complète : title + notes + composition.
          updateSession(session.id, {
            title: input.title,
            notes: input.notes ?? null,
            exercises: input.exercises,
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });

  return { save: mutation.mutateAsync, isSaving: mutation.isPending, error: mutation.error };
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

export function useSession(id: string | undefined) {
  return useQuery<SessionDto>({
    queryKey: sessionKeys.detail(id ?? ""),
    queryFn: () => getSession(id as string),
    // « new » n'a pas d'id : la requête ne part pas, plutôt qu'un GET /sessions/undefined.
    enabled: id != null,
  });
}

/**
 * Recharge un exercice composé depuis la bibliothèque. Le cache est invalidé en entier : la
 * réponse porte la séance complète, mais la liste et les compteurs en dépendent aussi.
 */
export function useReloadSessionExercise(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionExerciseId: string) =>
      reloadSessionExercise(sessionId as string, sessionExerciseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
