import {
  ProblemType,
  type StructureDto,
  type StructureInput,
  type StructureLibraryDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStructure,
  deleteStructure,
  getStructure,
  listStructures,
  sessionKeys,
  structureKeys,
  updateStructure,
} from "@/feature/library/api";
import { ApiError } from "@/shared/lib/api";

/** Bibliothèque › Structures : les prêtes et celles du Coach, en une lecture. */
export function useStructureLibrary() {
  return useQuery<StructureLibraryDto>({
    queryKey: structureKeys.library(),
    queryFn: listStructures,
  });
}

/** La lecture d'une structure, partagée par l'écran et son « Recharger » (#604). */
export const structureDetailQuery = (id: string) => ({
  queryKey: structureKeys.detail(id),
  queryFn: () => getStructure(id),
});

export function useStructure(id: string | undefined) {
  return useQuery<StructureDto>({
    ...structureDetailQuery(id ?? ""),
    // « new » n'a pas d'id : la requête ne part pas.
    enabled: id != null,
  });
}

/** La structure que la saisie édite, et la version sur laquelle elle a commencé (#604). */
export type StructureVersion = Pick<StructureDto, "id" | "updatedAt">;

type SaveStructureArgs = {
  /** `null` = création ; sinon la modification de cette structure. */
  structure: StructureVersion | null;
  input: StructureInput;
};

export function useSaveStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ structure, input }: SaveStructureArgs) =>
      structure == null
        ? createStructure(input)
        : updateStructure(structure.id, { ...input, expectedUpdatedAt: structure.updatedAt }),
    // Sans attendre la relecture : la saisie apprend son id d'abord, sinon la liste relue lui
    // montrerait un instant son propre nom comme pris (#717).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: structureKeys.all });
    },
    // Un nom refusé est porté par une structure que la liste ne connaît pas encore : elle se relit,
    // et c'est elle qui dira ensuite si le nom est toujours pris.
    onError: (error) => {
      if (error instanceof ApiError && error.type === ProblemType.STRUCTURE_NAME_TAKEN) {
        void queryClient.invalidateQueries({ queryKey: structureKeys.library() });
      }
    },
  });
}

export function useDeleteStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: StructureVersion) =>
      deleteStructure(id, { expectedUpdatedAt: updatedAt }),
    onSuccess: async (_, { id }) => {
      // Comme une séance supprimée : sa relecture, un 404 retenté, retiendrait la sortie.
      queryClient.removeQueries({ queryKey: structureKeys.detail(id) });
      // Les blocs qui la citaient perdent leur origine (`SetNull`) : les séances se relisent.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: structureKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
      ]);
    },
  });
}
