import { useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../test/query";
import { useFreshMediaUrl } from "./useFreshMediaUrl";

/**
 * La re-signature elle-même est testée dans `@cmv/shared` (`resolveUsableSignedUrl`). Ce hook ne
 * décide qu'une chose : QUELLE requête recharger — celle de la surface affichée, et pas ses voisines.
 */
describe("useFreshMediaUrl", () => {
  it("recharge exactement la requête de la surface affichée, et rien d'autre", async () => {
    const thread = vi.fn(async () => ({ messages: [] }));
    const neighbour = vi.fn(async () => ({ messages: [] }));
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(
      () => {
        const threadQuery = useQuery({ queryKey: ["thread", "t-1"], queryFn: thread });
        useQuery({ queryKey: ["thread", "t-1", "older"], queryFn: neighbour });
        return { resolve: useFreshMediaUrl(["thread", "t-1"]), loaded: threadQuery.isSuccess };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    thread.mockClear();
    neighbour.mockClear();

    // Aucun média connu sous cet id : la requête repart, et l'URL reste introuvable.
    await expect(result.current.resolve("m-inconnu")).resolves.toBeNull();

    expect(thread).toHaveBeenCalledOnce();
    expect(neighbour).not.toHaveBeenCalled();
  });
});
