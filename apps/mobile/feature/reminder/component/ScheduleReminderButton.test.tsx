import { ReminderEntityType, snoozedDueAt } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi } from "@/feature/reminder/api";
import { ScheduleReminderButton } from "@/feature/reminder/component/ScheduleReminderButton";
import { pressButton, renderRn } from "@/test/render";

// Seul l'appel est remplacé : le hook de création et ce qu'il fait au cache restent les VRAIS.
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/reminder/api")>();
  return { ...original, reminderApi: { ...original.reminderApi, create: vi.fn() } };
});

const NOW = new Date("2026-09-30T10:00:00.000Z");

/**
 * Le `Modal` de react-native-web rend dans un PORTAIL accroché au `body`, et ne s'y retire qu'à
 * la fin d'un fondu que jsdom ne joue pas — même dispositif que `CmvImageViewer.test.tsx`.
 */
function finishFade(inside: Element): void {
  for (let node = inside.parentElement; node != null; node = node.parentElement) {
    fireEvent(node, new Event("webkitAnimationEnd", { bubbles: true }));
  }
}

function openForm() {
  const result = renderRn(
    <ScheduleReminderButton
      entityType={ReminderEntityType.INVOICE}
      entityId="inv-1"
      targetLabel="Facture de septembre"
    />,
  );
  pressButton(result.container, "reminder.schedule");
  const body = result.baseElement as HTMLElement;
  const note = body.querySelector("textarea");
  if (note == null) throw new Error("formulaire introuvable");
  finishFade(note);
  return { ...result, body, note };
}

const submit = (body: HTMLElement) =>
  [...body.querySelectorAll("[tabindex]")].find(
    (node) => node.textContent === "reminder.form.submit",
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(reminderApi.create).mockResolvedValue({ id: "r-1" } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleReminderButton", () => {
  /** La note EST le rappel : sans elle, le bouton reste éteint plutôt que d'aller chercher un 400. */
  it("n'envoie rien tant que la note est vide ou blanche", () => {
    const { body, note } = openForm();

    fireEvent.change(note, { target: { value: "   " } });
    pressButton(body, "reminder.form.submit");

    expect(submit(body)?.getAttribute("aria-disabled")).toBe("true");
    expect(reminderApi.create).not.toHaveBeenCalled();
  });

  it("programme la note nettoyée à la semaine prochaine par défaut", async () => {
    const { body, note } = openForm();

    fireEvent.change(note, { target: { value: "  Relancer Léa  " } });
    pressButton(body, "reminder.form.submit");

    await waitFor(() =>
      expect(reminderApi.create).toHaveBeenCalledWith({
        entityType: ReminderEntityType.INVOICE,
        entityId: "inv-1",
        dueAt: snoozedDueAt("NEXT_WEEK", NOW),
        note: "Relancer Léa",
      }),
    );
  });

  it("programme à l'échéance choisie", async () => {
    const { body, note } = openForm();

    fireEvent.change(note, { target: { value: "Relancer Léa" } });
    pressButton(body, "reminder.snooze.TOMORROW");
    pressButton(body, "reminder.form.submit");

    await waitFor(() =>
      expect(reminderApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt: snoozedDueAt("TOMORROW", NOW) }),
      ),
    );
  });

  it("dit l'envoi en cours et ferme le bouton le temps qu'il parte", async () => {
    vi.mocked(reminderApi.create).mockReturnValue(new Promise(() => undefined));
    const { body, note, findByText } = openForm();

    fireEvent.change(note, { target: { value: "Relancer Léa" } });
    pressButton(body, "reminder.form.submit");

    expect(await findByText("reminder.form.submitting")).toBeTruthy();
    pressButton(body, "reminder.form.submitting");
    expect(reminderApi.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["une fois programmé", true],
    ["quand le coach annule", false],
  ])("referme le formulaire %s", async (_, send) => {
    const { body, note } = openForm();
    fireEvent.change(note, { target: { value: "Relancer Léa" } });

    pressButton(body, send ? "reminder.form.submit" : "common.cancel");
    if (send) await waitFor(() => expect(reminderApi.create).toHaveBeenCalled());
    await waitFor(() => {
      finishFade(note);
      expect(body.querySelector("textarea")).toBeNull();
    });
  });

  /** Réinitialisé à chaque ouverture : une note déjà envoyée ferait croire à un rappel en attente. */
  it("repart d'une note vide à la réouverture", async () => {
    const { container, body, note } = openForm();
    fireEvent.change(note, { target: { value: "Relancer Léa" } });
    pressButton(body, "common.cancel");
    await waitFor(() => {
      finishFade(note);
      expect(body.querySelector("textarea")).toBeNull();
    });

    pressButton(container, "reminder.schedule");

    expect(body.querySelector("textarea")?.value).toBe("");
  });
});
