import { PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { UnassignedDraftsSection } from "@/feature/plan/component/UnassignedDraftsSection";
import { renderInRoute } from "../../../../test/render";

function draft(over: Partial<PlanSummaryDto> & Pick<PlanSummaryDto, "id">): PlanSummaryDto {
  return {
    coachId: "usr_coach",
    athleteId: null,
    athleteName: null,
    athleteEmail: null,
    title: "Prépa bloc hiver — v2",
    description: null,
    startDate: "2026-10-05",
    status: PlanStatus.DRAFT,
    publishedAt: null,
    weekCount: 8,
    sessionCount: 32,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    ...over,
  };
}

function mount(drafts: readonly PlanSummaryDto[]) {
  return renderInRoute(<UnassignedDraftsSection drafts={drafts} />, {
    path: "/plans/",
    links: ["/plans/$planId"],
  });
}

/**
 * Le bac des brouillons sans destinataire. Ce qu'il doit faire : exister quand il y en a, dire
 * qu'il n'y a pas encore de destinataire, et disparaître sinon.
 */
describe("UnassignedDraftsSection", () => {
  it("ne montre rien quand tout est affecté — un bac vide annoncerait un travail qui n'existe pas", async () => {
    const { queryByText } = await mount([]);

    expect(queryByText("plan.drafts.title")).toBeNull();
  });

  it("nomme chaque brouillon et dit qu'il n'a pas encore de destinataire", async () => {
    const { getByText, getAllByText } = await mount([
      draft({ id: "pln_a" }),
      draft({ id: "pln_b", title: "Reprise post-blessure" }),
    ]);

    expect(getByText("plan.drafts.title")).toBeTruthy();
    expect(getByText("Prépa bloc hiver — v2")).toBeTruthy();
    expect(getByText("Reprise post-blessure")).toBeTruthy();
    // « À définir » est un CHOIX à faire, pas un nom qu'on n'a pas su résoudre — jamais « — ».
    expect(getAllByText("plan.unassigned")).toHaveLength(2);
  });

  it("compte ce qu'il contient", async () => {
    const { getByText } = await mount([draft({ id: "pln_a" }), draft({ id: "pln_b" })]);

    expect(getByText("2")).toBeTruthy();
  });

  it("ouvre le constructeur du brouillon — c'est là qu'on l'affecte", async () => {
    const { getByText, user, router } = await mount([draft({ id: "pln_a" })]);

    await user.click(getByText("Prépa bloc hiver — v2"));

    expect(router.state.location.pathname).toBe("/plans/pln_a");
  });
});
