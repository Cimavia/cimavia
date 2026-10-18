import {
  AccessLevel,
  ApiError,
  type CoachOrganizationDto,
  MyAccessLevel,
  type PlanDto,
  PlanStatus,
} from "@cmv/shared";
import { screen, waitFor, within } from "@testing-library/react";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyOrganizations } from "@/feature/library/api";
import { changePlanAccess, listPlanOrganizations } from "@/feature/plan/api";
import { renderWithProviders } from "../../../../test/render";
import { PlanAccessButton, planFraming } from "./PlanAccessButton";

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  listMyOrganizations: vi.fn(),
}));
vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  listPlanOrganizations: vi.fn(),
  changePlanAccess: vi.fn(),
}));
// TI est suivi par C via F : c'est l'entreprise qui reçoit le cycle en Écriture par défaut.
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [{ athleteId: "ath_ti", athleteName: "TI", organizationName: "F", isSelf: false }],
  }),
}));

const C = { coachId: "coach_c", name: "C" };
const M = { coachId: "coach_m", name: "M" };
const F: CoachOrganizationDto = { id: "org_f", name: "F", coaches: [C, M] };
// L'Écriture que F a reçue par défaut, à la naissance du cycle.
const F_WRITE = { organization: { id: "org_f", name: "F" }, level: AccessLevel.WRITE };

const plan = (over: Partial<PlanDto> = {}): PlanDto =>
  ({
    id: "pln_1",
    coachId: "coach_c",
    coachName: "C",
    myAccess: { level: MyAccessLevel.OWNER, via: null },
    grants: [],
    athleteId: "ath_ti",
    athleteName: "TI",
    athleteEmail: null,
    title: "Cycle Bloc",
    description: null,
    startDate: "2026-10-19",
    status: PlanStatus.DRAFT,
    publishedAt: null,
    weekCount: 0,
    sessionCount: 0,
    weeks: [],
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...over,
  }) as PlanDto;

const ACCESS = "library.access.title";

async function openPanel(eligible: CoachOrganizationDto[], over: Partial<PlanDto> = {}) {
  vi.mocked(listPlanOrganizations).mockResolvedValue(eligible);
  const view = renderWithProviders(<PlanAccessButton plan={plan(over)} athleteName="TI" />);
  await view.user.click(await view.findByRole("button", { name: ACCESS }));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyOrganizations).mockResolvedValue([F]);
});

describe("PlanAccessButton", () => {
  it("absent pour un Coach sans entreprise", async () => {
    vi.mocked(listMyOrganizations).mockResolvedValue([]);
    renderWithProviders(<PlanAccessButton plan={plan()} athleteName="TI" />);

    await waitFor(() => expect(listMyOrganizations).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: ACCESS })).toBeNull();
  });

  it("frame 9 : les Coachs de l'athlète, le défaut de F, et l'ouverture enregistrée", async () => {
    vi.mocked(changePlanAccess).mockResolvedValue([]);
    const { user } = await openPanel([F], { grants: [F_WRITE] });

    expect(await screen.findByText("plan.access.followedWith")).toBeTruthy();
    expect(screen.getByText("plan.access.coachesOf")).toBeTruthy();
    expect(screen.getByText("plan.access.scope")).toBeTruthy();
    expect(screen.getByText("plan.access.defaultWrite")).toBeTruthy();
    expect(screen.getByText("plan.access.ownerOnly")).toBeTruthy();
    expect(listPlanOrganizations).toHaveBeenCalledWith("pln_1");

    const row = screen.getByText("F", { selector: "span" }).closest("div.rounded-cmv-md");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "library.access.level.READ" }),
    );
    await user.click(screen.getByRole("button", { name: "library.access.save" }));

    await waitFor(() =>
      expect(vi.mocked(changePlanAccess).mock.calls[0]?.[0]).toEqual({
        ids: ["pln_1"],
        changes: [{ organizationId: "org_f", level: AccessLevel.READ }],
      }),
    );
    await waitFor(() => expect(screen.queryByText("plan.access.coachesOf")).toBeNull());
  });

  it("frame 10 : personne à qui l'ouvrir, la phrase le dit et « Fermer » seul", async () => {
    const { user } = await openPanel([]);

    expect(await screen.findByText("plan.access.empty")).toBeTruthy();
    expect(screen.getByText("plan.access.followedAlone")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "library.access.save" })).toBeNull();

    // Le bouton du pied, pas la croix du panneau, qui porte le même nom.
    await user.click(screen.getByText("common.close", { selector: "button" }));
    expect(screen.queryByText("plan.access.empty")).toBeNull();
  });

  it("un droit que plus personne n'éclaire se montre, et ne propose que d'être retiré", async () => {
    vi.mocked(changePlanAccess).mockResolvedValue([]);
    // Le lien de M avec TI a pris fin : F n'est plus éligible, mais garde son Écriture.
    const { user } = await openPanel([], { grants: [F_WRITE] });

    expect(await screen.findByText("plan.access.stale")).toBeTruthy();
    expect(screen.queryByText("plan.access.empty")).toBeNull();
    const row = screen.getByText("F", { selector: "span" }).closest("div.rounded-cmv-md");
    const options = within(row as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(options).toEqual(["library.access.level.NONE", "library.access.level.WRITE"]);

    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "library.access.level.NONE" }),
    );
    await user.click(screen.getByRole("button", { name: "library.access.save" }));
    await waitFor(() =>
      expect(vi.mocked(changePlanAccess).mock.calls[0]?.[0]).toEqual({
        ids: ["pln_1"],
        changes: [{ organizationId: "org_f", level: null }],
      }),
    );
  });

  it("des entreprises illisibles se disent, et le panneau ne s'ouvre pas sur du vide", async () => {
    vi.mocked(listPlanOrganizations).mockRejectedValue(new ApiError(500, "Panne", null));
    const view = renderWithProviders(<PlanAccessButton plan={plan()} athleteName="TI" />);
    await view.user.click(await view.findByRole("button", { name: ACCESS }));

    expect(await screen.findByText("Panne")).toBeTruthy();
    expect(screen.queryByText("plan.access.empty")).toBeNull();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: ACCESS }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });
});

/** Une traduction qui garde les paramètres : le harnais `cimode` les perd. */
const t = ((key: string, values?: object) =>
  values == null ? key : `${key} ${JSON.stringify(values)}`) as unknown as TFunction;

describe("planFraming", () => {
  const owner = { coachId: "coach_c", athleteId: "ath_ti", grants: [F_WRITE] };

  it("sans athlète, le cycle se partage comme un exercice : rien à rappeler", () => {
    expect(planFraming({ ...owner, athleteId: null }, null, [F], null, t)).toEqual({
      caption: "plan.access.mine",
      sectionTitle: "library.access.organizations",
      scope: null,
      defaultNote: null,
      empty: "plan.access.emptyUnassigned",
      ownerOnly: "plan.access.ownerOnly",
      stale: null,
    });
  });

  it("nomme les autres Coachs de l'athlète et leurs entreprises, sans le propriétaire", () => {
    const G: CoachOrganizationDto = { id: "org_g", name: "G", coaches: [C, M] };
    const framing = planFraming(owner, "TI", [F, G], "F", t);

    expect(framing.caption).toBe(
      `plan.access.followedWith ${JSON.stringify({ athlete: "TI", coaches: "M", organizations: "F, G" })}`,
    );
    expect(framing.defaultNote).toBe(
      `plan.access.defaultWrite ${JSON.stringify({ organization: "F" })}`,
    );
  });

  it("le défaut ne s'annonce pas pour une entreprise qui n'est pas proposée", () => {
    expect(planFraming(owner, "TI", [F], "G", t).defaultNote).toBeNull();
    expect(planFraming(owner, "TI", [F], null, t).defaultNote).toBeNull();
  });

  it("ni pour une entreprise que le cycle n'a pas reçue en Écriture", () => {
    // Fermée exprès (« Aucun » ne sort pas parmi les droits), ou cycle né avant #607.
    expect(planFraming({ ...owner, grants: [] }, "TI", [F], "F", t).defaultNote).toBeNull();
    const read = { ...F_WRITE, level: AccessLevel.READ };
    expect(planFraming({ ...owner, grants: [read] }, "TI", [F], "F", t).defaultNote).toBeNull();
  });

  it("une entreprise qu'un droit cite sans plus y être éligible se dit à part", () => {
    expect(planFraming(owner, "TI", [], "F", t).stale).toEqual({
      ids: new Set(["org_f"]),
      caption: `plan.access.stale ${JSON.stringify({ athlete: "TI" })}`,
    });
    expect(planFraming(owner, "TI", [F], "F", t).stale).toBeNull();
  });

  it("suivi par le seul propriétaire : il le dit", () => {
    expect(planFraming(owner, "TE", [], "F", t).caption).toBe(
      `plan.access.followedAlone ${JSON.stringify({ athlete: "TE" })}`,
    );
  });
});
