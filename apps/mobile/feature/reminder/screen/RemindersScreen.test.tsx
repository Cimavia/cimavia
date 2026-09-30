import { type ReminderDto, ReminderEntityType, ReminderStatus } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi } from "@/feature/reminder/api";
import { RemindersScreen } from "@/feature/reminder/screen/RemindersScreen";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

// Seuls les appels sont remplacés : les hooks, leurs clés et leurs invalidations restent les VRAIS.
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/reminder/api")>();
  return {
    ...original,
    reminderApi: { ...original.reminderApi, list: vi.fn(), updateStatus: vi.fn() },
  };
});

vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const list = vi.mocked(reminderApi.list);

function reminder(id: string, status: ReminderDto["status"], note: string): ReminderDto {
  return {
    id,
    entityType: ReminderEntityType.INVOICE,
    entityId: "inv-1",
    targetLabel: "2026-09",
    dueAt: "2099-01-01T09:00:00.000Z",
    note,
    reason: null,
    status,
    readAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
}

const TODO = reminder("r-1", ReminderStatus.PENDING, "Relancer Léa");
const DONE = reminder("r-2", ReminderStatus.DONE, "Envoyer le cycle");

const refresh = (container: HTMLElement) =>
  press(container.querySelector("[data-refresh]") as HTMLElement);

beforeEach(() => {
  list.mockResolvedValue([TODO, DONE]);
  vi.mocked(reminderApi.updateStatus).mockResolvedValue(TODO);
});

describe("RemindersScreen — les deux vues", () => {
  it("ouvre sur les rappels à traiter", async () => {
    const { findByText, queryByText } = renderRn(<RemindersScreen />);

    expect(await findByText("Relancer Léa")).toBeTruthy();
    expect(queryByText("Envoyer le cycle")).toBeNull();
  });

  /** Un rappel traité n'est pas supprimé : il reste consultable dans l'historique. */
  it("bascule sur l'historique des rappels traités", async () => {
    const { container, findByText, queryByText } = renderRn(<RemindersScreen />);
    await findByText("Relancer Léa");

    pressButton(container, "reminder.segment.HANDLED");

    expect(queryByText("Envoyer le cycle")).not.toBeNull();
    expect(queryByText("Relancer Léa")).toBeNull();
  });

  it.each([
    ["à traiter", [DONE], "reminder.empty.PENDING.title", null],
    ["traités", [TODO], "reminder.empty.HANDLED.title", "reminder.segment.HANDLED"],
  ])("dit qu'il n'y a rien %s, dans la vue concernée", async (_, served, empty, segment) => {
    list.mockResolvedValue(served);
    const { container, findByText } = renderRn(<RemindersScreen />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    if (segment != null) pressButton(container, segment);

    expect(await findByText(empty)).toBeTruthy();
  });
});

describe("RemindersScreen — les gestes", () => {
  it.each([
    ["fait", "reminder.markDone", ReminderStatus.DONE, null],
    ["abandonné", "reminder.dismiss", ReminderStatus.DISMISSED, null],
    ["rouvert", "reminder.reopen", ReminderStatus.PENDING, "reminder.segment.HANDLED"],
  ])("marque le rappel %s", async (_, label, status, segment) => {
    const { container, findByText } = renderRn(<RemindersScreen />);
    await findByText("Relancer Léa");
    if (segment != null) pressButton(container, segment);

    pressButton(container, label);

    const id = segment == null ? "r-1" : "r-2";
    await waitFor(() => expect(reminderApi.updateStatus).toHaveBeenCalledWith(id, { status }));
  });
});

describe("RemindersScreen — le chargement et la panne", () => {
  it("n'affirme rien tant que la liste charge", () => {
    list.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<RemindersScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.textContent).not.toContain("reminder.empty");
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("dit la panne plutôt qu'une liste vide, et offre de réessayer", async () => {
    list.mockRejectedValue(new ApiError(500, "boom", null));
    const { container, findByText } = renderRn(<RemindersScreen />);

    expect(await findByText("common.retry")).toBeTruthy();
    expect(container.textContent).not.toContain("reminder.empty");

    list.mockResolvedValue([TODO]);
    pressButton(container, "common.retry");

    expect(await findByText("Relancer Léa")).toBeTruthy();
  });

  /** Une liste déjà lue reste à l'écran quand un rafraîchissement échoue. */
  it("garde les rappels déjà lus quand le rafraîchissement échoue", async () => {
    const { container, findByText, queryByText } = renderRn(<RemindersScreen />);
    await findByText("Relancer Léa");
    const calls = list.mock.calls.length;

    list.mockRejectedValue(new ApiError(500, "boom", null));
    refresh(container);

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(container.querySelector('[data-refresh="idle"]')).not.toBeNull());
    expect(queryByText("Relancer Léa")).not.toBeNull();
    expect(queryByText("common.retry")).toBeNull();
  });

  it("recharge la liste quand le coach tire l'écran", async () => {
    const { container, findByText } = renderRn(<RemindersScreen />);
    await findByText("Relancer Léa");
    const calls = list.mock.calls.length;

    refresh(container);

    await waitFor(() => expect(list.mock.calls.length).toBe(calls + 1));
  });
});
