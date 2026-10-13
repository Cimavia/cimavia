import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useMutationToast } from "@/shared/hook/useMutationToast";

/**
 * « Recharger » après un conflit d'édition (#604), pour un écran dont la saisie naît de l'élément
 * au montage : la remplacer par la dernière version, c'est repartir de zéro.
 *
 * - `reload(id)` relit l'élément en passant outre le cache, et ne réussit qu'une fois la dernière
 *   version REÇUE — sur une relecture ratée, l'écran garde la saisie et le bandeau, et un toast
 *   dit pourquoi rien n'a changé ;
 * - `generation` avance alors : en `key` du formulaire, elle le remonte sur la version relue ;
 * - `onReloaded`, s'il est donné, suit le même succès : de quoi oublier le refus qui a ouvert le
 *   bandeau, quand l'erreur vit hors du formulaire remonté ;
 * - `loadedId` est l'élément à afficher. Celui que l'URL désigne, ou, sur un écran ouvert en
 *   création, celui qu'un enregistrement interrompu a CRÉÉ : l'écran passe alors en édition, comme
 *   il l'aurait dû.
 */
export function useStaleReload(
  routeId: string | undefined,
  detail: (id: string) => { queryKey: QueryKey; queryFn: () => Promise<unknown> },
) {
  const queryClient = useQueryClient();
  const { onFailure } = useMutationToast();
  const [reloaded, setReloaded] = useState<{ id: string; generation: number } | null>(null);
  const mutation = useMutation({
    mutationFn: (id: string) => queryClient.fetchQuery({ ...detail(id), staleTime: 0 }),
  });

  function reload(id: string, onReloaded?: () => void) {
    mutation.mutate(id, {
      onSuccess: () => {
        setReloaded((last) => ({ id, generation: (last?.generation ?? 0) + 1 }));
        onReloaded?.();
      },
      onError: (error) => onFailure("common.staleReloadFailed", error),
    });
  }

  return {
    loadedId: routeId ?? reloaded?.id,
    generation: reloaded?.generation ?? 0,
    reload,
    isReloading: mutation.isPending,
  };
}
