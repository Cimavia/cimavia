import type { PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { PlanWeekType, ScheduledSessionStatus } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { AthleteWeekGrid } from "./AthleteWeekGrid";

const MONDAY = "2026-10-12";
const WEDNESDAY = "2026-10-14";
const REST = "plan.athlete.rest";
const TODAY = "plan.athlete.today";

const session = (
  id: string,
  title: string,
  position: number,
  scheduledDate = WEDNESDAY,
): ScheduledSessionSummaryDto => ({
  id,
  planId: "p_1",
  planWeekId: "pw_1",
  sourceSessionId: null,
  title,
  notes: null,
  scheduledDate,
  position,
  status: ScheduledSessionStatus.PLANNED,
  exerciseCount: 3,
});

const week = (sessions: ScheduledSessionSummaryDto[], startDate = MONDAY): PlanWeekDto => ({
  id: "pw_1",
  weekNumber: 1,
  type: PlanWeekType.TRAINING,
  note: null,
  startDate,
  endDate: "2026-10-18",
  sessions,
});

/**
 * La grille est montée dans un VRAI routeur : `AthleteSessionCard` est un `<Link>`, et sans la
 * route de destination le lien tombe au rendu — l'absence de test tenait pour partie à ça.
 */
const mount = (weekDto: PlanWeekDto, today = MONDAY) =>
  renderInRoute(<AthleteWeekGrid week={weekDto} today={today} />, {
    path: "/planning",
    links: ["/sessions/$sessionId"],
  });

/**
 * Les sept colonnes du jour, dans l'ordre du calendrier. On passe par le DOM faute de mieux : une
 * colonne n'a ni rôle ni libellé propre, et ce qui se vérifie ici est justement une POSITION — que
 * la séance tombe dans la colonne de son jour et pas dans celle d'à côté. Le sélecteur ne peut
 * attraper qu'elles : la carte est un `<a>`, pas un `div`.
 */
const columnsOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("div.flex-col"));

/** La colonne du rang demandé. Absente, le test ÉCHOUE en le disant plutôt qu'en lisant `undefined`. */
const columnAt = (container: HTMLElement, index: number): HTMLElement => {
  const column = columnsOf(container)[index];
  if (column == null) throw new Error(`Aucune colonne de jour au rang ${index}`);
  return column;
};

describe("AthleteWeekGrid", () => {
  it("affiche les sept jours même quand la semaine ne contient aucune séance", async () => {
    const { container, getAllByText } = await mount(week([]));

    // Sept colonnes, sept « Repos » : une semaine vide se lit « le cycle prévoit du repos », et
    // non « rien à afficher ».
    expect(columnsOf(container)).toHaveLength(7);
    expect(getAllByText(REST)).toHaveLength(7);
  });

  it("pose la séance dans la colonne de son jour et laisse les six autres au repos", async () => {
    const { container, getAllByText, getByText } = await mount(
      week([session("ss_1", "Bloc force max", 0)]),
    );

    // Mercredi = le 3e jour d'une semaine qui commence le lundi.
    expect(columnAt(container, 2)).toContainElement(getByText("Bloc force max"));
    expect(getAllByText(REST)).toHaveLength(6);
    expect(getByText("Bloc force max").closest("a")).toHaveAttribute("href", "/sessions/ss_1");
  });

  it("range deux séances d'un même jour par leur position, sans les répartir sur deux colonnes", async () => {
    const { container, getAllByText, getByText } = await mount(
      week([session("ss_2", "Renfo", 1), session("ss_1", "Voie", 0)]),
    );

    // `position` est le rang DANS la journée : la liste arrive dans l'ordre de l'API, pas dans le
    // sien. Les deux cartes partagent la colonne du mercredi — c'est ce partage qui rétrécit
    // chaque carte sans déformer la rangée.
    const wednesday = columnAt(container, 2);
    expect(wednesday).toContainElement(getByText("Voie"));
    expect(wednesday).toContainElement(getByText("Renfo"));
    expect(wednesday.textContent?.indexOf("Voie")).toBeLessThan(
      wednesday.textContent?.indexOf("Renfo") ?? -1,
    );
    expect(getAllByText(REST)).toHaveLength(6);
  });

  it("ne marque « aujourd'hui » que sur le jour courant", async () => {
    const { container, getAllByText, getByText } = await mount(week([]), WEDNESDAY);

    expect(getAllByText(TODAY)).toHaveLength(1);
    expect(columnAt(container, 2)).toContainElement(getByText(TODAY));
  });

  it("ne dessine aucune grille quand la semaine n'est pas situable", async () => {
    // Date illisible : sept colonnes fausses vaudraient moins que rien du tout.
    const { container, queryByText } = await mount(week([], "pas-une-date"));

    expect(columnsOf(container)).toHaveLength(0);
    expect(queryByText(REST)).toBeNull();
  });
});
