import { useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/component/CmvToast";
import { createTestI18n } from "../../../test/i18n";
import { renderWithQueryClient } from "../../../test/query";
import { useStaleReload } from "./useStaleReload";

type Item = { id: string; title: string };

const KEY = ["items", "it-1"] as const;
const SEEN: Item = { id: "it-1", title: "Lue à l'ouverture" };
const LATEST: Item = { id: "it-1", title: "Changée par un autre coach" };

/**
 * L'élément est en cache, tel que l'écran l'a lu à l'ouverture, et l'écran l'observe — c'est ce qui
 * le garde en cache. `read` est sa relecture.
 */
function setup() {
  const { queryClient, wrapper: QueryWrapper } = renderWithQueryClient();
  queryClient.setQueryData(KEY, SEEN);
  const read = vi.fn<() => Promise<Item>>().mockResolvedValue(LATEST);
  const detail = (id: string) => ({ queryKey: ["items", id], queryFn: read });
  const i18n = createTestI18n();
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <I18nextProvider i18n={i18n}>
      <QueryWrapper>
        <ToastProvider>{children}</ToastProvider>
      </QueryWrapper>
    </I18nextProvider>
  );
  const { result } = renderHook(
    () => {
      useQuery({ ...detail("it-1"), enabled: false });
      return useStaleReload("it-1", detail);
    },
    { wrapper },
  );
  return { result, read, queryClient };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStaleReload", () => {
  it("relit l'élément, et remonte la saisie sur ce qu'il a relu", async () => {
    const { result, read, queryClient } = setup();

    act(() => result.current.reload("it-1"));

    await waitFor(() => expect(result.current.generation).toBe(1));
    expect(read).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(KEY)).toEqual(LATEST);
  });

  // Une horloge recalée — NTP, une VM chargée — recule d'une seconde et plus (#833). Jugée sur
  // `Date.now()`, la donnée lue « après » l'instant présent passait pour fraîche : la relecture
  // rendait le cache sans rien demander, et la saisie remontait sur la version même du conflit.
  it("relit l'élément même quand l'horloge a reculé depuis sa lecture", async () => {
    const { result, read, queryClient } = setup();
    const readAt = queryClient.getQueryState(KEY)?.dataUpdatedAt;
    expect(readAt).toBeTypeOf("number");
    vi.spyOn(Date, "now").mockReturnValue(Number(readAt) - 1500);

    act(() => result.current.reload("it-1"));

    await waitFor(() => expect(result.current.generation).toBe(1));
    expect(read).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(KEY)).toEqual(LATEST);
  });
});
