import { snoozedDueAt } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi } from "@/feature/reminder/api";
import { SnoozeReminderButton } from "@/feature/reminder/component/SnoozeReminderButton";
import { pressButton, renderRn } from "@/test/render";

// Seul l'appel est remplacé : le hook de report et ce qu'il fait au cache restent les VRAIS.
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/reminder/api")>();
  return { ...original, reminderApi: { ...original.reminderApi, update: vi.fn() } };
});

const NOW = new Date("2026-09-30T10:00:00.000Z");

beforeEach(() => {
  // Seule l'horloge est figée : l'échéance se calcule à l'instant du tap.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(reminderApi.update).mockResolvedValue({ id: "r-1" } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SnoozeReminderButton", () => {
  it("ne montre que « Repousser » au repos", () => {
    const { container } = renderRn(<SnoozeReminderButton reminderId="r-1" />);

    expect(container.textContent).toBe("reminder.snooze.label");
  });

  it("repousse à l'échéance choisie, calculée à l'instant du tap, puis se replie", async () => {
    const { container } = renderRn(<SnoozeReminderButton reminderId="r-1" />);

    pressButton(container, "reminder.snooze.label");
    pressButton(container, "reminder.snooze.TOMORROW");

    await waitFor(() =>
      expect(reminderApi.update).toHaveBeenCalledWith("r-1", {
        dueAt: snoozedDueAt("TOMORROW", NOW),
      }),
    );
    expect(container.textContent).toBe("reminder.snooze.label");
  });

  /** Déplier n'est pas s'engager : se raviser ne doit rien envoyer. */
  it("se replie sans rien envoyer quand le coach se ravise", () => {
    const { container } = renderRn(<SnoozeReminderButton reminderId="r-1" />);

    pressButton(container, "reminder.snooze.label");
    pressButton(container, "common.cancel");

    expect(container.textContent).toBe("reminder.snooze.label");
    expect(reminderApi.update).not.toHaveBeenCalled();
  });

  it("ferme le report tant que le précédent est en route", async () => {
    vi.mocked(reminderApi.update).mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<SnoozeReminderButton reminderId="r-1" />);

    pressButton(container, "reminder.snooze.label");
    pressButton(container, "reminder.snooze.NEXT_WEEK");

    await waitFor(() =>
      expect(container.querySelector('[aria-disabled="true"]')?.textContent).toBe(
        "reminder.snooze.label",
      ),
    );
  });
});
