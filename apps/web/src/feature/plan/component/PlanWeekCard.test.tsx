import {
  type PlanDto,
  type PlanWeekDto,
  PlanWeekType,
  ScheduledSessionStatus,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyPlanWeek, deletePlanWeek, reorderPlanDay, updatePlanWeek } from "@/feature/plan/api";
import { clearPlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { formatDayLabel } from "@/shared/util/date.util";
import { renderWithProviders } from "../../../../test/render";
import { PlanWeekCard } from "./PlanWeekCard";

/**
 * Les VRAIS hooks — `usePlanMutations`, `usePlanClipboard` —, seul `api.ts` est bouchonné
 * (« Tranché en #507 »). #362 demandait de mocker les deux hooks ; ce qu'on affirme ici est ce qui
 * part vers l'API, ce qu'un `mutate` espionné ne garantit pas — un branchement croisé entre
 * semaine source et semaine cible, typiquement.
 */
vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  copyPlanWeek: vi.fn(),
  deletePlanWeek: vi.fn(),
  reorderPlanDay: vi.fn(),
  updatePlanWeek: vi.fn(),
}));

const MONDAY_1 = "2026-10-05";
const MONDAY_2 = "2026-10-12";

const session = (id: string, date: string, position: number): ScheduledSessionSummaryDto => ({
  id,
  planId: "p-1",
  planWeekId: "w",
  sourceSessionId: null,
  title: `Séance ${id}`,
  notes: null,
  scheduledDate: date,
  position,
  status: ScheduledSessionStatus.PLANNED,
  exerciseCount: 2,
  updatedAt: "2026-08-10T00:00:00.000Z",
});

const week = (over: Partial<PlanWeekDto> & Pick<PlanWeekDto, "id" | "startDate">): PlanWeekDto => ({
  weekNumber: 1,
  type: PlanWeekType.TRAINING,
  note: null,
  endDate: over.startDate,
  sessions: [],
  ...over,
});

const SOURCE = week({
  id: "w-1",
  startDate: MONDAY_1,
  sessions: [session("s-a", MONDAY_1, 0)],
});

const RESPONSE = { id: "p-1", weeks: [SOURCE] } as PlanDto;

type Props = { isPublished?: boolean; onAddSession?: () => void; onEditSession?: () => void };

/**
 * Deux cartes, comme dans le constructeur : copier se fait sur l'une, coller sur l'autre. Les
 * deux vivent dans le même arbre, donc sur le même presse-papier — celui du vrai hook.
 */
function mount(target: PlanWeekDto, props: Props = {}) {
  const view = renderWithProviders(
    <div>
      {[SOURCE, target].map((item) => (
        <PlanWeekCard
          key={item.id}
          planId="p-1"
          planTitle="Cycle bloc"
          isPublished={props.isPublished ?? false}
          week={item}
          onAddSession={props.onAddSession ?? vi.fn()}
          onEditSession={props.onEditSession ?? vi.fn()}
        />
      ))}
    </div>,
  );
  const [source, targetCard] = Array.from(view.container.querySelectorAll("section"));
  if (source == null || targetCard == null) throw new Error("deux cartes attendues");
  return { ...view, source: within(source), target: within(targetCard), targetCard };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanClipboard();
  for (const fn of [copyPlanWeek, deletePlanWeek, reorderPlanDay, updatePlanWeek]) {
    vi.mocked(fn).mockResolvedValue(RESPONSE);
  }
});

describe("PlanWeekCard — la garde de collage (#362)", () => {
  it("n'offre pas de coller tant que rien n'est copié", () => {
    const { queryByRole } = mount(week({ id: "w-2", startDate: MONDAY_2 }));

    expect(queryByRole("button", { name: "plan.week.paste" })).toBeNull();
  });

  it("ne propose jamais de coller une semaine sur elle-même", async () => {
    const { user, source, target } = mount(week({ id: "w-2", startDate: MONDAY_2 }));

    await user.click(source.getByRole("button", { name: "plan.week.copy" }));

    expect(source.queryByRole("button", { name: "plan.week.paste" })).toBeNull();
    expect(target.getByRole("button", { name: "plan.week.paste" })).toBeInTheDocument();
  });

  it("colle d'un seul clic sur une semaine vide, de la source vers la cible", async () => {
    const { user, source, target } = mount(week({ id: "w-2", startDate: MONDAY_2 }));
    await user.click(source.getByRole("button", { name: "plan.week.copy" }));

    await user.click(target.getByRole("button", { name: "plan.week.paste" }));

    expect(copyPlanWeek).toHaveBeenCalledOnce();
    expect(copyPlanWeek).toHaveBeenCalledWith("w-2", { sourcePlanWeekId: "w-1" });
  });

  /**
   * L'API REMPLACE le contenu de la cible, sans annulation possible. Un bouton simple ici — un
   * `CmvButton` à la place du `CmvConfirmButton` pour « aligner » les deux formes — écraserait
   * les séances du coach au premier clic.
   */
  it("arme une confirmation avant d'écraser une semaine occupée", async () => {
    const occupied = week({
      id: "w-2",
      startDate: MONDAY_2,
      sessions: [session("s-b", MONDAY_2, 0), session("s-c", MONDAY_2, 1)],
    });
    const { user, source, target } = mount(occupied);
    await user.click(source.getByRole("button", { name: "plan.week.copy" }));

    await user.click(target.getByRole("button", { name: "plan.week.paste" }));
    expect(copyPlanWeek).not.toHaveBeenCalled();

    await user.click(target.getByRole("button", { name: "plan.week.pasteConfirm" }));

    expect(copyPlanWeek).toHaveBeenCalledWith("w-2", { sourcePlanWeekId: "w-1" });
  });

  it("montre le geste fermé sur un cycle diffusé, sans masquer la copie", async () => {
    const { user, source, target } = mount(week({ id: "w-2", startDate: MONDAY_2 }), {
      isPublished: true,
    });

    // Lire une semaine ne la modifie pas : copier reste offert, même diffusé.
    await user.click(source.getByRole("button", { name: "plan.week.copy" }));

    const paste = target.getByRole("button", { name: "plan.week.paste" });
    expect(paste).toBeDisabled();
    expect(paste).toHaveAttribute("title", "plan.week.pasteDisabledPublished");
    expect(copyPlanWeek).not.toHaveBeenCalled();
  });
});

describe("PlanWeekCard — la semaine", () => {
  const busy = week({
    id: "w-2",
    startDate: MONDAY_2,
    sessions: [session("s-b", MONDAY_2, 0), session("s-c", MONDAY_2, 1)],
  });

  it("réordonne une journée au clavier, en écrivant la journée d'arrivée entière", async () => {
    const { user, target } = mount(busy);

    target.getByRole("button", { name: "plan.week.moveSession 1" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(reorderPlanDay).toHaveBeenCalledWith("w-2", MONDAY_2, { sessionIds: ["s-c", "s-b"] });
  });

  it("n'écrit rien quand la séance est déjà en tête de sa journée", async () => {
    const { user, target } = mount(busy);

    target.getByRole("button", { name: "plan.week.moveSession 1" }).focus();
    await user.keyboard("{ArrowUp}");

    expect(reorderPlanDay).not.toHaveBeenCalled();
  });

  /**
   * Le cas le plus courant du geste (#93) : une séance part vers un jour VIDE. Seule la journée
   * d'arrivée est écrite — le serveur retire la séance de son jour d'origine.
   */
  it("dépose une séance sur un jour vide, en n'écrivant que ce jour", async () => {
    const { target } = mount(busy);
    const tuesday = "2026-10-13";
    const emptyDay = target.getByText(formatDayLabel(tuesday)).parentElement as HTMLElement;

    fireEvent.dragStart(target.getByRole("button", { name: "plan.week.moveSession 2" }));
    fireEvent.dragOver(emptyDay);
    fireEvent.drop(emptyDay);

    await waitFor(() =>
      expect(reorderPlanDay).toHaveBeenCalledWith("w-2", tuesday, { sessionIds: ["s-c"] }),
    );
  });

  it("change le type de la semaine", async () => {
    const { user, target } = mount(busy);

    await user.click(target.getByRole("button", { name: `plan.weekType.${PlanWeekType.DELOAD}` }));

    expect(updatePlanWeek).toHaveBeenCalledWith("w-2", { type: PlanWeekType.DELOAD });
  });

  it("supprime la semaine après confirmation", async () => {
    const { user, target } = mount(busy);

    await user.click(target.getByRole("button", { name: "plan.week.delete" }));
    await user.click(target.getByRole("button", { name: "common.confirmDelete" }));

    expect(deletePlanWeek).toHaveBeenCalledWith("w-2");
  });

  // Sur un cycle diffusé, retirer une semaine décalerait le planning de l'athlète (#312).
  it("ferme la suppression de la semaine sur un cycle diffusé, et dit pourquoi", async () => {
    const { user, target } = mount(busy, { isPublished: true });

    const button = target.getByRole("button", { name: "plan.week.delete" });
    expect(button).toBeDisabled();
    expect(target.getByTitle("plan.week.deleteDisabledPublished")).toContainElement(button);

    await user.click(button);
    expect(target.queryByRole("button", { name: "common.confirmDelete" })).toBeNull();
    expect(deletePlanWeek).not.toHaveBeenCalled();
  });

  it("ouvre une séance au clic et en ajoute une sur le jour choisi", async () => {
    const onAddSession = vi.fn();
    const onEditSession = vi.fn();
    const { user, target } = mount(busy, { onAddSession, onEditSession });

    await user.click(target.getByRole("button", { name: /Séance s-c/ }));
    await user.click(
      target.getAllByRole("button", { name: "plan.week.addSession" })[0] as HTMLElement,
    );

    expect(onEditSession).toHaveBeenCalledWith(busy.sessions[1]);
    expect(onAddSession).toHaveBeenCalledWith(MONDAY_2);
  });

  it("marque la décharge d'un liseré et affiche la note de la semaine", () => {
    const { target, targetCard } = mount({
      ...busy,
      type: PlanWeekType.DELOAD,
      note: "Semaine allégée",
    });

    // La décharge se repère sans lire le sélecteur : c'est le liseré qui la signale.
    expect(targetCard).toHaveClass("border-l-cmv-info");
    expect(target.getByText("Semaine allégée")).toBeInTheDocument();
  });
});
