import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { PlanDayCell } from "./PlanDayCell";

const DATE = "2026-10-12";
const HANDLE = (rank: number) => `plan.week.moveSession ${rank}`;

const session = (id: string, title: string, position: number): ScheduledSessionSummaryDto => ({
  id,
  planId: "p_1",
  planWeekId: "pw_1",
  sourceSessionId: null,
  title,
  notes: null,
  scheduledDate: DATE,
  position,
  status: ScheduledSessionStatus.PLANNED,
  exerciseCount: 3,
});

const three = [
  session("ss_1", "Force", 0),
  session("ss_2", "Volume", 1),
  session("ss_3", "Technique", 2),
];

function setup(sessions: ScheduledSessionSummaryDto[] = three) {
  const handlers = {
    onAddSession: vi.fn(),
    onEditSession: vi.fn(),
    onReorder: vi.fn(),
  };
  const view = renderWithProviders(
    <PlanDayCell date={DATE} sessions={sessions} isBusy={false} {...handlers} />,
  );
  return { ...view, ...handlers };
}

describe("PlanDayCell", () => {
  it("ouvre la séance dont on clique le titre", async () => {
    const { user, getByRole, onEditSession } = setup();

    await user.click(getByRole("button", { name: /Volume/ }));

    expect(onEditSession).toHaveBeenCalledWith(three[1]);
  });

  /**
   * Une journée d'une seule séance n'a rien à réordonner : la poignée y serait du décor, et elle
   * volerait de la place à une case qui fait déjà un septième de la largeur.
   */
  it("n'offre aucune poignée quand la journée ne porte qu'une séance", () => {
    const { queryByRole } = setup([session("ss_1", "Force", 0)]);

    expect(queryByRole("button", { name: HANDLE(1) })).not.toBeInTheDocument();
  });

  it("n'offre aucune poignée sur une journée vide", () => {
    const { queryByRole } = setup([]);

    expect(queryByRole("button", { name: HANDLE(1) })).not.toBeInTheDocument();
  });

  describe("le réordonnancement", () => {
    // L'ordre remonte EN ENTIER : l'API attend une permutation, et refuse un sous-ensemble.
    it("remonte la journée entière dans son nouvel ordre", () => {
      const { getByRole, onReorder } = setup();

      const target = getByRole("button", { name: HANDLE(1) });
      fireEvent.dragStart(getByRole("button", { name: HANDLE(3) }));
      fireEvent.dragOver(target);
      fireEvent.drop(target);

      expect(onReorder).toHaveBeenCalledWith(DATE, ["ss_3", "ss_1", "ss_2"]);
    });

    // La poignée est le SEUL chemin clavier de cette case — il n'y a pas de flèches à côté.
    it("réordonne au clavier depuis la poignée", async () => {
      const { user, getByRole, onReorder } = setup();

      getByRole("button", { name: HANDLE(1) }).focus();
      await user.keyboard("{ArrowDown}");

      expect(onReorder).toHaveBeenCalledWith(DATE, ["ss_2", "ss_1", "ss_3"]);
    });

    // Monter la première séance n'a nulle part où aller : ne rien émettre évite une écriture qui
    // ne changerait rien, et le bruit de notification qui va avec sur un cycle diffusé.
    it("n'émet rien quand le déplacement sort de la journée", async () => {
      const { user, getByRole, onReorder } = setup();

      getByRole("button", { name: HANDLE(1) }).focus();
      await user.keyboard("{ArrowUp}");

      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
