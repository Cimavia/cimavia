import { type ReminderDto, ReminderEntityType, ReminderStatus } from "@cmv/shared";
import { router } from "expo-router";
import { describe, expect, it, vi } from "vitest";
import { ReminderCard } from "@/feature/reminder/component/ReminderCard";
import { pressButton, renderRn } from "@/test/render";

// La pastille rend sa variante sans classe lisible dans le DOM (NativeWind) : on la double pour
// que la couleur choisie — ce que la carte DÉCIDE — reste observable.
vi.mock("@/shared/component", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/component")>();
  return {
    ...original,
    CmvBadge: ({ label, variant }: Readonly<{ label: string; variant: string }>) => (
      <span data-variant={variant}>{label}</span>
    ),
  };
});

// Le report a ses propres tests : ici, il suffit de savoir qu'il est posé ou non.
vi.mock("@/feature/reminder/component/SnoozeReminderButton", () => ({
  SnoozeReminderButton: ({ reminderId }: Readonly<{ reminderId: string }>) => (
    <span data-snooze={reminderId} />
  ),
}));

function reminder(overrides: Partial<ReminderDto> = {}): ReminderDto {
  return {
    id: "r-1",
    entityType: ReminderEntityType.INVOICE,
    entityId: "inv-1",
    targetLabel: "2026-09",
    dueAt: "2099-01-01T09:00:00.000Z",
    note: "Relancer Léa",
    reason: null,
    status: ReminderStatus.PENDING,
    readAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function renderCard(dto: ReminderDto, busy = false) {
  const handlers = { onMarkDone: vi.fn(), onDismiss: vi.fn(), onReopen: vi.fn() };
  const result = renderRn(<ReminderCard reminder={dto} busy={busy} {...handlers} />);
  return { ...result, ...handlers };
}

const pressableOf = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("[tabindex]")].find((node) => node.textContent === text);

describe("ReminderCard — le titre", () => {
  it("titre le rappel par la note du coach", () => {
    const { queryByText } = renderCard(reminder());

    expect(queryByText("Relancer Léa")).not.toBeNull();
  });

  /** Rappel auto-généré : le motif voyage comme clé et se traduit ici, jamais figé en base. */
  it("titre un rappel généré par le libellé de son motif", () => {
    const { queryByText } = renderCard(reminder({ note: null, reason: "INVOICE_OVERDUE" }));

    expect(queryByText("reminder.reason.invoiceOverdue")).not.toBeNull();
  });

  it("rend « — » plutôt qu'un titre inventé quand ni note ni motif n'existent", () => {
    const { queryByText } = renderCard(reminder({ note: null, reason: null }));

    expect(queryByText("—")).not.toBeNull();
  });
});

describe("ReminderCard — l'état", () => {
  it.each([
    ["à venir", reminder(), "warning", "reminder.state.pending"],
    ["dû", reminder({ dueAt: "2020-01-01T09:00:00.000Z" }), "error", "reminder.state.overdue"],
    ["fait", reminder({ status: ReminderStatus.DONE }), "success", "reminder.state.done"],
    [
      "abandonné",
      reminder({ status: ReminderStatus.DISMISSED }),
      "neutral",
      "reminder.state.dismissed",
    ],
  ])("marque un rappel %s de sa propre pastille", (_, dto, variant, label) => {
    const { container } = renderCard(dto);

    const badge = container.querySelector("[data-variant]");
    expect(badge?.getAttribute("data-variant")).toBe(variant);
    expect(badge?.textContent).toBe(label);
  });
});

describe("ReminderCard — les gestes", () => {
  it("offre de faire, repousser ou abandonner un rappel à traiter", () => {
    const { container, onMarkDone, onDismiss, onReopen } = renderCard(reminder());

    pressButton(container, "reminder.markDone");
    pressButton(container, "reminder.dismiss");

    expect(onMarkDone).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-snooze="r-1"]')).not.toBeNull();
    expect(container.textContent).not.toContain("reminder.reopen");
    expect(onReopen).not.toHaveBeenCalled();
  });

  /** Réversible : un rappel marqué par erreur se rouvre, il n'y a pas à en recréer un. */
  it("n'offre que de rouvrir un rappel traité", () => {
    const { container, onReopen } = renderCard(reminder({ status: ReminderStatus.DONE }));

    pressButton(container, "reminder.reopen");

    expect(onReopen).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("reminder.markDone");
    expect(container.querySelector("[data-snooze]")).toBeNull();
  });

  it("ferme ses gestes pendant qu'une mutation part", () => {
    const { container } = renderCard(reminder(), true);

    for (const label of ["reminder.markDone", "reminder.dismiss"]) {
      expect(pressableOf(container, label)?.getAttribute("aria-disabled")).toBe("true");
    }
  });
});

describe("ReminderCard — la cible", () => {
  it("mène une facture à l'écran des factures", () => {
    const { container } = renderCard(reminder());

    pressButton(container, "reminder.targetLine");

    expect(router.push).toHaveBeenCalledWith("/invoices");
  });

  /** Le builder est web-only (#20) : un cycle se nomme, sans lien mort vers un écran absent. */
  it("nomme un cycle sans rien ouvrir", () => {
    const { container } = renderCard(
      reminder({ entityType: ReminderEntityType.PLAN, targetLabel: "Bloc force" }),
    );

    expect(container.textContent).toContain("reminder.targetLine");
    expect(pressableOf(container, "reminder.targetLine")).toBeUndefined();
  });

  /** Cible disparue (dette N-4) : la ligne reste, sans lien vers ce qui n'existe plus. */
  it("n'ouvre rien vers une facture disparue", () => {
    const { container } = renderCard(reminder({ targetLabel: null }));

    expect(container.textContent).toContain("reminder.targetLine");
    expect(pressableOf(container, "reminder.targetLine")).toBeUndefined();
  });
});
