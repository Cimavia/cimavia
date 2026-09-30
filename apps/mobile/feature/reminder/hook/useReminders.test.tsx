import { notificationKeys, type ReminderDto } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi, reminderKeys } from "@/feature/reminder/api";
import {
  useCreateReminder,
  useReminderSummary,
  useUpdateReminder,
  useUpdateReminderStatus,
} from "@/feature/reminder/hook/useReminders";

// Seuls les appels sont remplacés : `reminderKeys` reste le VRAI, c'est sur lui que tout le reste
// du cache s'invalide.
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/reminder/api")>();
  return {
    ...original,
    reminderApi: {
      ...original.reminderApi,
      summary: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
    },
  };
});

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const REMINDER = { id: "r-1" } as ReminderDto;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.mocked(reminderApi.create).mockResolvedValue(REMINDER);
  vi.mocked(reminderApi.updateStatus).mockResolvedValue(REMINDER);
  vi.mocked(reminderApi.update).mockResolvedValue(REMINDER);
});

describe("useReminderSummary", () => {
  it("lit les compteurs sous la racine des rappels, qu'une mutation périme donc déjà", async () => {
    vi.mocked(reminderApi.summary).mockResolvedValue({ dueCount: 2, pendingCount: 5 });

    const { result } = renderHook(() => useReminderSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(reminderKeys.summary())).toEqual({
      dueCount: 2,
      pendingCount: 5,
    });
  });
});

/**
 * Un rappel dû figure AUSSI dans le centre de notifications (#51) : le traiter doit périmer les
 * deux racines, sans quoi il quitterait la liste en restant dans la pastille.
 */
describe("les mutations de rappel", () => {
  it.each([
    ["la création", () => useCreateReminder(), { note: "Relancer" }, () => reminderApi.create],
    [
      "le changement de statut",
      () => useUpdateReminderStatus(),
      { id: "r-1", status: "DONE" },
      () => reminderApi.updateStatus,
    ],
    [
      "le report",
      () => useUpdateReminder(),
      { id: "r-1", input: { dueAt: "2026-10-01T09:00:00.000Z" } },
      () => reminderApi.update,
    ],
  ] as const)("%s périme les rappels et le centre de notifications", async (_, hook, input, call) => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper });

    await act(() => (result.current.mutateAsync as (value: unknown) => Promise<unknown>)(input));

    expect(call()).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: reminderKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });

  it("transmet le statut et le report à l'appel qui les porte", async () => {
    const status = renderHook(() => useUpdateReminderStatus(), { wrapper });
    const snooze = renderHook(() => useUpdateReminder(), { wrapper });

    await act(() => status.result.current.mutateAsync({ id: "r-1", status: "DONE" }));
    await act(() =>
      snooze.result.current.mutateAsync({
        id: "r-2",
        input: { dueAt: "2026-10-01T09:00:00.000Z" },
      }),
    );

    expect(reminderApi.updateStatus).toHaveBeenCalledWith("r-1", { status: "DONE" });
    expect(reminderApi.update).toHaveBeenCalledWith("r-2", { dueAt: "2026-10-01T09:00:00.000Z" });
  });
});
