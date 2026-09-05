import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { useWeekDrag, type WeekSlot } from "../hook/useWeekDrag";
import { PlanDayCell } from "./PlanDayCell";

const MONDAY = "2026-10-12";
const TUESDAY = "2026-10-13";
const HANDLE = (rank: number) => `plan.week.moveSession ${rank}`;
const ADD = "plan.week.addSession";

const session = (id: string, title: string, position: number, date = MONDAY) =>
  ({
    id,
    planId: "p_1",
    planWeekId: "pw_1",
    sourceSessionId: null,
    title,
    notes: null,
    scheduledDate: date,
    position,
    status: ScheduledSessionStatus.PLANNED,
    exerciseCount: 3,
  }) satisfies ScheduledSessionSummaryDto;

const monday = [
  session("ss_1", "Force", 0),
  session("ss_2", "Volume", 1),
  session("ss_3", "Technique", 2),
];

/**
 * Deux cases côte à côte, sur le MÊME glisser — c'est la seule façon de vérifier ce qui compte
 * ici : qu'une séance sorte de sa journée, et que la case n'écrase pas le rang visé par la carte.
 */
function Week({
  onDrop,
  days,
  onEditSession = vi.fn(),
}: Readonly<{
  onDrop: (from: WeekSlot, to: WeekSlot) => void;
  days: Record<string, ScheduledSessionSummaryDto[]>;
  onEditSession?: (session: ScheduledSessionSummaryDto) => void;
}>) {
  const drag = useWeekDrag(onDrop);
  return (
    <>
      {Object.entries(days).map(([date, sessions]) => (
        <PlanDayCell
          key={date}
          date={date}
          sessions={sessions}
          isBusy={false}
          drag={drag}
          onAddSession={vi.fn()}
          onEditSession={onEditSession}
          onMoveWithinDay={(day, index, direction) =>
            onDrop({ date: day, index }, { date: day, index: index + direction })
          }
        />
      ))}
    </>
  );
}

function setup(days: Record<string, ScheduledSessionSummaryDto[]> = { [MONDAY]: monday }) {
  const onDrop = vi.fn();
  const view = renderWithProviders(<Week onDrop={onDrop} days={days} />);
  return { ...view, onDrop };
}

describe("PlanDayCell", () => {
  // Le clic passe par le TITRE et non par la carte : la poignée est un bouton, et un bouton dans
  // un bouton n'est pas du HTML valide.
  it("ouvre la séance dont on clique le titre", async () => {
    const onEditSession = vi.fn();
    const { user, getByRole } = renderWithProviders(
      <Week onDrop={vi.fn()} days={{ [MONDAY]: monday }} onEditSession={onEditSession} />,
    );

    await user.click(getByRole("button", { name: /Volume/ }));

    expect(onEditSession).toHaveBeenCalledWith(monday[1]);
  });

  /**
   * La poignée est offerte même sur une séance SEULE : depuis #93 elle peut partir vers un autre
   * jour, et l'affordance doit dire ce que le geste permet — pas ce qu'il permettait avant.
   */
  it("offre la poignée même sur une journée d'une seule séance", () => {
    const { getByRole } = setup({ [MONDAY]: [session("ss_1", "Force", 0)] });

    expect(getByRole("button", { name: HANDLE(1) })).toBeInTheDocument();
  });

  it("n'offre aucune poignée sur une journée vide, qui garde son bouton d'ajout", () => {
    const { queryByRole, getAllByRole } = setup({ [MONDAY]: [] });

    expect(queryByRole("button", { name: HANDLE(1) })).not.toBeInTheDocument();
    expect(getAllByRole("button", { name: ADD })).toHaveLength(1);
  });

  describe("le glisser", () => {
    it("dépose sur la carte survolée, dans la même journée", () => {
      const { getByRole, onDrop } = setup();

      const target = getByRole("button", { name: HANDLE(1) });
      fireEvent.dragStart(getByRole("button", { name: HANDLE(3) }));
      fireEvent.dragOver(target);
      fireEvent.drop(target);

      expect(onDrop).toHaveBeenCalledWith({ date: MONDAY, index: 2 }, { date: MONDAY, index: 0 });
    });

    /**
     * Le cœur de #93 : la carte visée est DANS la case du jour, elle aussi cible de dépôt. Sans le
     * `stopPropagation` de `cardProps`, l'événement remonterait et la case écraserait le rang visé
     * par celui de sa fin de file — toute séance déposée atterrirait en dernier.
     */
    it("dépose au rang exact d'un autre jour, sans que la case écrase le rang", () => {
      const { getAllByRole, getByRole, onDrop } = setup({
        [MONDAY]: monday,
        [TUESDAY]: [session("ss_4", "Mardi 1", 0, TUESDAY), session("ss_5", "Mardi 2", 1, TUESDAY)],
      });

      // La 4e poignée du document est la 1re du mardi.
      const target = getAllByRole("button", { name: HANDLE(1) })[1];
      fireEvent.dragStart(getByRole("button", { name: HANDLE(3) }));
      fireEvent.dragOver(target as Element);
      fireEvent.drop(target as Element);

      expect(onDrop).toHaveBeenCalledWith({ date: MONDAY, index: 2 }, { date: TUESDAY, index: 0 });
    });

    // Une journée VIDE n'a aucune carte à viser : c'est la case qui reçoit, en fin de file.
    it("dépose en fin de file quand on vise l'espace libre d'une case", () => {
      const { container, getByRole, onDrop } = setup({ [MONDAY]: monday, [TUESDAY]: [] });

      const tuesdayCell = container.children[1];
      fireEvent.dragStart(getByRole("button", { name: HANDLE(1) }));
      fireEvent.dragOver(tuesdayCell as Element);
      fireEvent.drop(tuesdayCell as Element);

      expect(onDrop).toHaveBeenCalledWith({ date: MONDAY, index: 0 }, { date: TUESDAY, index: 0 });
    });

    // La poignée est le SEUL chemin clavier de cette case — il n'y a pas de flèches à côté.
    it("déplace au clavier depuis la poignée, dans la journée", async () => {
      const { user, getByRole, onDrop } = setup();

      getByRole("button", { name: HANDLE(1) }).focus();
      await user.keyboard("{ArrowDown}");

      expect(onDrop).toHaveBeenCalledWith({ date: MONDAY, index: 0 }, { date: MONDAY, index: 1 });
    });
  });
});
