import type { CreateSessionInput, SessionDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSession,
  deleteSession,
  listSessions,
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
