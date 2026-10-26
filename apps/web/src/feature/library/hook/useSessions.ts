import {
  type ChangeAccessInput,
  LibraryScope,
  type SessionBlock,
  type SessionDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeSessionAccess,
  createSession,
  deleteSession,
  getSession,
  listSessions,
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

/** Ce que le constructeur enregistre : la séance composée par blocs (#719). */
export type SessionBlocksInput = { title: string; notes: string | null; blocks: SessionBlock[] };

type SaveSessionArgs = {
  // null = création ; sinon édition de cette séance.
  session: SessionVersion | null;
  input: SessionBlocksInput;
};

export function useSaveSession() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ session, input }: SaveSessionArgs) =>
      session == null
        ? // Une seule composition à la fois : des blocs, et la liste par exercices vide.
          createSession({ ...input, exercises: [] })
        : // Le PUT exige la représentation complète : title + notes + composition.
          updateSession(session.id, { ...input, expectedUpdatedAt: session.updatedAt }),
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
    onSuccess: (_, { id }) => {
      // La séance supprimée ne se relit pas : le constructeur qui la montre s'en va, et sa
      // relecture — un 404, retenté — retiendrait la navigation qui suit.
      queryClient.removeQueries({ queryKey: sessionKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
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

/** Change les droits des séances sélectionnées (#606), sur le modèle des exercices. */
export function useChangeSessionAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeAccessInput) => changeSessionAccess(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
