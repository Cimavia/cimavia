import { type ReminderDto, ReminderEntityType, ReminderStatus } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reminderApi } from "@/feature/reminder/api";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/feature/reminder/util/datetime-local.util";
import { renderWithProviders } from "../../../../test/render";
import { ScheduleReminderButton } from "./ScheduleReminderButton";

// Le VRAI `useCreateReminder`, seul `api.ts` est bouchonné (« Tranché en #507 »).
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/reminder/api")>();
  return { ...actual, reminderApi: { ...actual.reminderApi, create: vi.fn() } };
});

const SUBMIT = "reminder.form.submit";
const PANEL = "complementary";
const TITLE = "reminder.form.title";

// Dans une semaine, à 9 h, dans le fuseau du lecteur — la valeur que le coach voit pré-remplie.
function defaultDueAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(date);
}

async function open() {
  const view = renderWithProviders(
    <ScheduleReminderButton
      entityType={ReminderEntityType.PLAN}
      entityId="pln_1"
      targetLabel="Cycle bloc"
    />,
  );
  await view.user.click(view.getByRole("button", { name: "reminder.schedule" }));
  return {
    ...view,
    dueAt: view.getByLabelText("reminder.form.dueAt") as HTMLInputElement,
    note: view.getByLabelText("reminder.form.note") as HTMLTextAreaElement,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reminderApi.create).mockImplementation(
    async (input) =>
      ({ id: "r_1", ...input, status: ReminderStatus.PENDING }) as unknown as ReminderDto,
  );
});

describe("ScheduleReminderButton", () => {
  it("propose une échéance dans une semaine à 9 h, et rien à envoyer sans note", async () => {
    const { dueAt, note, getByRole } = await open();

    expect(getByRole(PANEL, { name: TITLE })).toBeInTheDocument();
    expect(dueAt.value).toBe(defaultDueAt());
    expect(note.value).toBe("");
    expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  // La note EST le rappel : des espaces ne sont pas une note.
  it("n'envoie ni une note blanche, ni une échéance vide", async () => {
    const { user, dueAt, note, getByRole } = await open();

    await user.type(note, "   ");
    expect(getByRole("button", { name: SUBMIT })).toBeDisabled();

    await user.type(note, "Relancer");
    fireEvent.change(dueAt, { target: { value: "" } });
    expect(getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  it("crée le rappel sur la cible du bouton, note nettoyée, puis referme et le dit", async () => {
    const { user, note, getByRole, queryByRole, findByRole } = await open();

    await user.type(note, "  Relancer Léa  ");
    await user.click(getByRole("button", { name: SUBMIT }));

    expect(reminderApi.create).toHaveBeenCalledWith({
      entityType: ReminderEntityType.PLAN,
      entityId: "pln_1",
      dueAt: fromDatetimeLocalValue(defaultDueAt()),
      note: "Relancer Léa",
    });
    expect(await findByRole("status")).toHaveTextContent("reminder.toast.created");
    await waitFor(() => expect(queryByRole(PANEL, { name: TITLE })).toBeNull());
  });

  it("dit l'envoi en cours, bouton éteint", async () => {
    vi.mocked(reminderApi.create).mockReturnValue(new Promise(() => {}));
    const { user, note, getByRole } = await open();

    await user.type(note, "Relancer");
    await user.click(getByRole("button", { name: SUBMIT }));

    expect(getByRole("button", { name: "reminder.form.submitting" })).toBeDisabled();
  });

  it("reste ouvert sur un échec, la saisie intacte", async () => {
    vi.mocked(reminderApi.create).mockRejectedValue(new Error("réseau"));
    const { user, note, getByRole, findByRole } = await open();

    await user.type(note, "Relancer");
    await user.click(getByRole("button", { name: SUBMIT }));

    expect(await findByRole("status")).toHaveTextContent("common.error");
    expect(getByRole(PANEL, { name: TITLE })).toBeInTheDocument();
    expect(note.value).toBe("Relancer");
  });

  // Un panneau qui garderait la note d'avant laisserait croire qu'il reste un rappel à valider.
  it("repart d'un formulaire vierge à chaque ouverture", async () => {
    const { user, note, getByRole, getByLabelText, queryByRole } = await open();
    await user.type(note, "Brouillon");

    await user.click(getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(queryByRole(PANEL, { name: TITLE })).toBeNull());
    await user.click(getByRole("button", { name: "reminder.schedule" }));

    expect((getByLabelText("reminder.form.note") as HTMLTextAreaElement).value).toBe("");
  });

  // Fermé par Échap : le bouton de fermeture porte un nom en dur (#342), on ne le fige pas.
  it("se referme sur Échap sans rien créer", async () => {
    const { user, queryByRole } = await open();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(queryByRole(PANEL, { name: TITLE })).toBeNull());
    expect(reminderApi.create).not.toHaveBeenCalled();
  });
});
