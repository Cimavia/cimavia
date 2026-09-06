import { describe, expect, it } from "vitest";
import { PlanStatus } from "../dto/plan.schema";
import {
  buildPlanAthleteRows,
  countPlanAthletesBySituation,
  type PlanAthleteRow,
  type PlanRowSource,
  sortAthletePlans,
  unassignedDraftPlans,
  visiblePlanAthleteRows,
} from "./plan-row.util";

// Mercredi. Les cycles démarrent un lundi (contrainte de `planStartDateSchema`).
const TODAY = "2026-09-09";
const QUERY = { search: "", filter: "ALL", locale: "fr" } as const;

function plan(over: Partial<PlanRowSource> & Pick<PlanRowSource, "id">): PlanRowSource {
  return {
    athleteId: null,
    athleteName: null,
    title: "Cycle",
    startDate: "2026-07-13",
    weekCount: 8,
    status: PlanStatus.PUBLISHED,
    ...over,
  };
}

const LEA = { athleteId: "ath_lea", athleteName: "Léa Bonnet" };
const YANIS = { athleteId: "ath_yanis", athleteName: "Yanis Belkacem" };
const SARAH = { athleteId: "ath_sarah", athleteName: "Sarah Nguyen" };
const ADRIEN = { athleteId: "ath_adrien", athleteName: "Adrien Roux" };
const CAMILLE = { athleteId: "ath_camille", athleteName: "Camille Fabre" };

// En cours : 2026-07-13 → 2026-09-20, on est en S9/10, il reste 11 jours (1 semaine pleine).
const LEA_ONGOING = plan({ ...LEA, id: "pln_lea_1", title: "Prépa bloc hiver", weekCount: 10 });
// Brouillon AFFECTÉ : le coach construit la suite pendant que le cycle court.
const LEA_DRAFT = plan({
  ...LEA,
  id: "pln_lea_2",
  title: "Bloc de printemps",
  startDate: "2026-10-12",
  weekCount: 6,
  status: PlanStatus.DRAFT,
});
const LEA_OLD = plan({
  ...LEA,
  id: "pln_lea_0",
  title: "Reprise estivale",
  startDate: "2026-06-01",
  weekCount: 6,
});
// Terminé le 2026-07-26, et rien derrière : 45 jours, soit 6 semaines pleines.
const YANIS_ENDED = plan({
  ...YANIS,
  id: "pln_yanis",
  title: "Reprise automne",
  startDate: "2026-06-15",
  weekCount: 6,
});
const SARAH_UPCOMING = plan({
  ...SARAH,
  id: "pln_sarah",
  title: "Bloc automne",
  startDate: "2026-09-21",
});
// Deux cycles diffusés qui se chevauchent (#172) : 2026-08-24 → 2026-10-04 est la fenêtre commune.
const ADRIEN_VOLUME = plan({
  ...ADRIEN,
  id: "pln_adrien_volume",
  title: "Volume estival",
  startDate: "2026-08-10",
  weekCount: 10,
});
const ADRIEN_TRAIL = plan({
  ...ADRIEN,
  id: "pln_adrien_trail",
  title: "Prépa trail court",
  startDate: "2026-08-24",
  weekCount: 6,
});
// Que des brouillons : rien de diffusé, donc aucune époque.
const CAMILLE_DRAFT = plan({
  ...CAMILLE,
  id: "pln_camille",
  title: "Bloc technique",
  startDate: "2026-10-12",
  status: PlanStatus.DRAFT,
});
// Brouillons SANS destinataire : le coach les construit avant de savoir pour qui (#144).
const ORPHAN_LATE = plan({
  id: "pln_orphan_2",
  title: "Trail long",
  startDate: "2026-11-02",
  status: PlanStatus.DRAFT,
});
const ORPHAN_EARLY = plan({
  id: "pln_orphan_1",
  title: "Reprise",
  startDate: "2026-09-14",
  status: PlanStatus.DRAFT,
});

const ALL_PLANS = [
  LEA_OLD,
  LEA_ONGOING,
  LEA_DRAFT,
  YANIS_ENDED,
  SARAH_UPCOMING,
  ADRIEN_VOLUME,
  ADRIEN_TRAIL,
  CAMILLE_DRAFT,
  ORPHAN_LATE,
  ORPHAN_EARLY,
];

function rows(source: readonly PlanRowSource[] = ALL_PLANS): PlanAthleteRow<PlanRowSource>[] {
  const built = buildPlanAthleteRows(source, TODAY);
  if (built == null) throw new Error("liste absente");
  return built;
}

function rowOf(
  athleteId: string,
  source?: readonly PlanRowSource[],
): PlanAthleteRow<PlanRowSource> {
  const row = rows(source).find((candidate) => candidate.athleteId === athleteId);
  if (row == null) throw new Error(`aucune ligne pour ${athleteId}`);
  return row;
}

describe("buildPlanAthleteRows", () => {
  it("rend null sur une liste absente — un tableau vide annoncerait « aucune planification »", () => {
    expect(buildPlanAthleteRows(null, TODAY)).toBeNull();
    expect(buildPlanAthleteRows(undefined, TODAY)).toBeNull();
  });

  it("une ligne par athlète ayant au moins un cycle, brouillons affectés compris", () => {
    expect(
      rows()
        .map((row) => row.athleteId)
        .sort(),
    ).toEqual([LEA, YANIS, SARAH, ADRIEN, CAMILLE].map((athlete) => athlete.athleteId).sort());
  });

  it("les brouillons sans destinataire n'entrent dans aucune ligne", () => {
    const orphanIds = [ORPHAN_LATE.id, ORPHAN_EARLY.id];
    const seen = rows().flatMap((row) => row.plans.map((item) => item.id));
    expect(seen.filter((id) => orphanIds.includes(id))).toEqual([]);
  });

  it("porte le nom du destinataire, sans seconde requête", () => {
    expect(rowOf(LEA.athleteId).athleteName).toBe("Léa Bonnet");
  });

  it("le cycle courant est celui de `currentAthletePlan` — le brouillon ne le remplace pas", () => {
    const row = rowOf(LEA.athleteId);
    expect(row.situation).toBe("ONGOING");
    expect(row.currentPlan).toMatchObject({
      id: LEA_ONGOING.id,
      currentWeek: 9,
      weekCount: 10,
      endDate: "2026-09-20",
    });
  });

  it("n'ayant que des brouillons, l'athlète n'a ni époque ni échéance", () => {
    const row = rowOf(CAMILLE.athleteId);
    expect(row.currentPlan).toBeNull();
    expect(row.situation).toBeNull();
    expect(row.deadline).toBeNull();
  });

  it("un cycle aux dates illisibles ne se range pas d'office parmi les terminés", () => {
    const broken = plan({ ...LEA, id: "pln_broken", weekCount: 0 });
    const row = rowOf(LEA.athleteId, [broken]);
    expect(row.situation).toBeNull();
    expect(row.deadline).toBeNull();
  });
});

describe("l'échéance, qui rend l'ordre vérifiable à l'œil", () => {
  it("compte en semaines pleines ce qu'il reste d'un cycle en cours", () => {
    expect(rowOf(LEA.athleteId).deadline).toEqual({ kind: "ENDS_IN", weeks: 1 });
  });

  it("ne dit jamais « dans 0 semaine » : la dernière semaine a son propre motif", () => {
    // 2026-07-13 + 9 semaines → fin le 2026-09-13, dans 4 jours.
    const soon = plan({ ...LEA, id: "pln_soon", weekCount: 9 });
    expect(rowOf(LEA.athleteId, [soon]).deadline).toEqual({ kind: "ENDS_THIS_WEEK" });
  });

  it("compte en semaines pleines depuis la fin d'un cycle terminé", () => {
    expect(rowOf(YANIS.athleteId).deadline).toEqual({ kind: "ENDED_SINCE", weeks: 6 });
  });

  it("ne dit jamais « depuis 0 semaine » non plus", () => {
    // 2026-07-13 + 8 semaines → fini le 2026-09-06, il y a 3 jours.
    const justEnded = plan({ ...LEA, id: "pln_just_ended" });
    expect(rowOf(LEA.athleteId, [justEnded]).deadline).toEqual({ kind: "ENDED_THIS_WEEK" });
  });

  it("annonce la date de début d'un cycle à venir", () => {
    expect(rowOf(SARAH.athleteId).deadline).toEqual({ kind: "STARTS_ON", date: "2026-09-21" });
  });
});

describe("le chevauchement de deux cycles diffusés (#172)", () => {
  it("ne signale rien quand un seul cycle court", () => {
    expect(rowOf(LEA.athleteId).overlap).toBeNull();
  });

  it("l'athlète voit le cycle commencé le PLUS TARD, l'autre lui est invisible", () => {
    expect(rowOf(ADRIEN.athleteId).overlap).toEqual({
      servedPlanId: ADRIEN_TRAIL.id,
      hiddenPlanIds: [ADRIEN_VOLUME.id],
      from: "2026-08-24",
      to: "2026-10-04",
    });
  });

  it("la ligne montre le cycle réellement servi, pas le plus ancien", () => {
    expect(rowOf(ADRIEN.athleteId).currentPlan).toMatchObject({
      id: ADRIEN_TRAIL.id,
      currentWeek: 3,
      weekCount: 6,
    });
  });

  it("un brouillon qui recouvre un cycle en cours n'est pas une anomalie", () => {
    const overlappingDraft = plan({
      ...ADRIEN,
      id: "pln_draft_overlap",
      startDate: "2026-08-24",
      weekCount: 6,
      status: PlanStatus.DRAFT,
    });
    expect(rowOf(ADRIEN.athleteId, [ADRIEN_VOLUME, overlappingDraft]).overlap).toBeNull();
  });
});

describe("sortAthletePlans", () => {
  it("du cycle le plus récemment commencé au plus ancien, brouillons à leur date", () => {
    expect(rowOf(LEA.athleteId).plans.map((item) => item.id)).toEqual([
      LEA_DRAFT.id,
      LEA_ONGOING.id,
      LEA_OLD.id,
    ]);
  });

  it("départage deux cycles partis le même lundi par leur id, pour un ordre stable", () => {
    const second = plan({ id: "pln_b", startDate: "2026-07-13" });
    const first = plan({ id: "pln_a", startDate: "2026-07-13" });
    expect(sortAthletePlans([second, first]).map((item) => item.id)).toEqual(["pln_a", "pln_b"]);
  });
});

describe("unassignedDraftPlans", () => {
  it("ne retient que les brouillons sans destinataire, du plus récent au plus ancien", () => {
    expect(unassignedDraftPlans(ALL_PLANS).map((item) => item.id)).toEqual([
      ORPHAN_LATE.id,
      ORPHAN_EARLY.id,
    ]);
  });

  it("rend une liste vide quand tout est affecté — le bac disparaît alors de l'écran", () => {
    expect(unassignedDraftPlans([LEA_ONGOING, LEA_DRAFT])).toEqual([]);
  });
});

describe("visiblePlanAthleteRows", () => {
  it("range d'abord ceux qui n'ont plus rien, en dernier ceux dont la suite est prête", () => {
    expect(visiblePlanAthleteRows(rows(), QUERY).map((row) => row.athleteName)).toEqual([
      "Yanis Belkacem",
      "Camille Fabre",
      "Léa Bonnet",
      "Adrien Roux",
      "Sarah Nguyen",
    ]);
  });

  it("à époque égale, la fin la plus proche passe devant", () => {
    const visible = visiblePlanAthleteRows(rows(), { ...QUERY, filter: "ONGOING" });
    expect(visible.map((row) => row.athleteName)).toEqual(["Léa Bonnet", "Adrien Roux"]);
  });

  it("les cycles à venir se départagent sur leur date de début", () => {
    const later = plan({ ...LEA, id: "pln_later", startDate: "2026-10-12" });
    const built = rows([SARAH_UPCOMING, later]);
    expect(
      visiblePlanAthleteRows(built, { ...QUERY, filter: "UPCOMING" }).map((row) => row.athleteName),
    ).toEqual(["Sarah Nguyen", "Léa Bonnet"]);
  });

  it("le nom tranche quand rien ne sépare deux lignes", () => {
    const anna = plan({ athleteId: "ath_a", athleteName: "Anna Costa", id: "pln_anna" });
    const zoe = plan({ athleteId: "ath_z", athleteName: "Zoé Ferrand", id: "pln_zoe" });
    expect(visiblePlanAthleteRows(rows([zoe, anna]), QUERY).map((row) => row.athleteName)).toEqual([
      "Anna Costa",
      "Zoé Ferrand",
    ]);
  });

  it("filtre par époque, et n'y range pas l'athlète sans cycle diffusé", () => {
    const ended = visiblePlanAthleteRows(rows(), { ...QUERY, filter: "ENDED" });
    expect(ended.map((row) => row.athleteName)).toEqual(["Yanis Belkacem"]);
  });

  it("cherche sans casse ni accent, sur le nom comme sur le prénom", () => {
    expect(
      visiblePlanAthleteRows(rows(), { ...QUERY, search: "lea" }).map((row) => row.athleteName),
    ).toEqual(["Léa Bonnet"]);
    expect(
      visiblePlanAthleteRows(rows(), { ...QUERY, search: "BELKACEM" }).map(
        (row) => row.athleteName,
      ),
    ).toEqual(["Yanis Belkacem"]);
  });

  it("n'altère jamais la liste reçue", () => {
    const built = rows();
    const before = built.map((row) => row.athleteId);
    visiblePlanAthleteRows(built, QUERY);
    expect(built.map((row) => row.athleteId)).toEqual(before);
  });
});

describe("countPlanAthletesBySituation", () => {
  it("compte des athlètes, non des cycles — le tableau en affiche", () => {
    expect(countPlanAthletesBySituation(rows())).toEqual({
      ALL: 5,
      ONGOING: 2,
      UPCOMING: 1,
      ENDED: 1,
    });
  });

  it("compte sur les lignes NON filtrées, pour que le segment annonce ce qu'il contient", () => {
    const built = rows();
    const visible = visiblePlanAthleteRows(built, { ...QUERY, filter: "ENDED" });
    expect(countPlanAthletesBySituation(built).ONGOING).toBe(2);
    expect(visible).toHaveLength(1);
  });
});
