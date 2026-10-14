import {
  type ChangeAccessInput,
  type CreateSessionInput,
  LibraryScope,
  type SessionDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeSessionAccess,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  reloadSessionExercise,
  sessionKeys,
  updateSession,
} from "@/feature/library/api";

export function useSessions(scope: LibraryScope = LibraryScope.ALL) {
  return useQuery<SessionDto[]>({
    queryKey: sessionKeys.list(scope),
    queryFn: () => listSessions(scope),
  });
}

/**
 * La séance que la saisie édite, et la version sur laquelle elle a commencé (#604) : l'API refuse
 * en 409 un enregistrement dont la séance a changé depuis.
 */
export type SessionVersion = Pick<SessionDto, "id" | "updatedAt">;

type SaveSessionArgs = {
  // null = création ; sinon édition de cette séance.
  session: SessionVersion | null;
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
            expectedUpdatedAt: session.updatedAt,
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });

  return { save: mutation.mutateAsync, isSaving: mutation.isPending, error: mutation.error };
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    // La version affichée voyage avec l'id (#605, MC-8) : supprimer ce qu'on n'a pas vu est un 409.
    mutationFn: ({ id, updatedAt }: SessionVersion) =>
      deleteSession(id, { expectedUpdatedAt: updatedAt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

/** La lecture d'une séance, partagée par l'écran et son « Recharger » (#604). */
export const sessionDetailQuery = (id: string) => ({
  queryKey: sessionKeys.detail(id),
  queryFn: () => getSession(id),
});

export function useSession(id: string | undefined) {
  return useQuery<SessionDto>({
    ...sessionDetailQuery(id ?? ""),
    // « new » n'a pas d'id : la requête ne part pas, plutôt qu'un GET /sessions/undefined.
    enabled: id != null,
  });
}

type ReloadSessionExerciseArgs = { session: SessionVersion; sessionExerciseId: string };

/**
 * Recharge un exercice composé depuis la bibliothèque, en citant la version de la séance (#604).
 * Le cache est invalidé en entier : la réponse porte la séance complète, mais la liste et les
 * compteurs en dépendent aussi.
 */
export function useReloadSessionExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ session, sessionExerciseId }: ReloadSessionExerciseArgs) =>
      reloadSessionExercise(session.id, sessionExerciseId, {
        expectedUpdatedAt: session.updatedAt,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

/** Change les droits des séances sélectionnées (#606), sur le modèle des exercices. */
export function useChangeSessionAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeAccessInput) => changeSessionAccess(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
