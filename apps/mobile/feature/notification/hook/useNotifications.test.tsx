import { notificationKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationApi } from "@/feature/notification/api";
import {
  useUnreadByCapability,
  useUnreadNotificationCount,
} from "@/feature/notification/hook/useNotifications";

// Seul l'appel est remplacé : `notificationKeys` reste le VRAI.
vi.mock("@/feature/notification/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/notification/api")>();
  return {
    ...original,
    notificationApi: { ...original.notificationApi, unreadCount: vi.fn() },
  };
});

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const UNREAD = { count: 3, coach: 1, athlete: 2 };

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.mocked(notificationApi.unreadCount).mockResolvedValue(UNREAD);
});

/**
 * Une entrée de cache, deux vues : le total pour le badge, la ventilation pour le sélecteur
 * d'espace. Deux clés feraient partir la requête deux fois ; deux `queryFn` sous une clé, c'est
 * une course où la cloche reçoit un objet au lieu d'un nombre.
 */
describe("le compteur de non-lus", () => {
  it("sert le total et la ventilation depuis une seule requête", async () => {
    const total = renderHook(() => useUnreadNotificationCount(), { wrapper });
    const split = renderHook(() => useUnreadByCapability(), { wrapper });

    await waitFor(() => expect(total.result.current.data).toBe(3));
    await waitFor(() => expect(split.result.current.data).toEqual(UNREAD));
    expect(notificationApi.unreadCount).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(notificationKeys.unreadCount())).toEqual(UNREAD);
  });

  /** Sélecteur d'espace monté sans le badge : la ventilation va chercher le compteur elle-même. */
  it("va chercher la ventilation seule quand rien d'autre ne l'a lue", async () => {
    const split = renderHook(() => useUnreadByCapability(), { wrapper });

    await waitFor(() => expect(split.result.current.data).toEqual(UNREAD));
    expect(notificationApi.unreadCount).toHaveBeenCalledOnce();
  });
});
