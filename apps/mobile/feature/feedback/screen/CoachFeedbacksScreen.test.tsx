import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { describe, expect, it, vi } from "vitest";
import { coachFeedbackApi } from "@/feature/feedback/api";
import { CoachFeedbacksScreen } from "@/feature/feedback/screen/CoachFeedbacksScreen";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

// Seul l'appel est remplacé : le hook de liste et sa clé de cache restent les VRAIS.
vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/feedback/api")>();
  return { ...original, coachFeedbackApi: { ...original.coachFeedbackApi, list: vi.fn() } };
});
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach-1" } } }) },
}));
// Le bandeau hors-ligne écoute l'état réseau : hors sujet ici.
vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const list = vi.mocked(coachFeedbackApi.list);

const summary = (over: Partial<CoachFeedbackSummaryDto>): CoachFeedbackSummaryDto =>
  ({
    id: "f-1",
    scheduledSessionId: "s-1",
    planId: "p-1",
    athleteId: "a-1",
    athleteName: "Léa Moreau",
    sessionTitle: "Voie & projet 7b",
    scheduledDate: "2026-10-16",
    content: "Bien tenu",
    mediaCount: 0,
    coachReadAt: null,
    repliedAt: null,
    updatedAt: "2026-10-16T20:00:00.000Z",
    ...over,
  }) as CoachFeedbackSummaryDto;

describe("CoachFeedbacksScreen — les états", () => {
  it("n'annonce aucune absence pendant le chargement", () => {
    list.mockReturnValue(new Promise(() => undefined));
    const { container, queryByText } = renderRn(<CoachFeedbacksScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(queryByText("feedback.coach.empty.title")).toBeNull();
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("offre de réessayer après une panne, sans se dire vide", async () => {
    list.mockRejectedValueOnce(new ApiError(500, "boom", null));
    const { container, findByText, queryByText } = renderRn(<CoachFeedbacksScreen />);

    await findByText("common.retry");
    expect(queryByText("feedback.coach.empty.title")).toBeNull();

    list.mockResolvedValue([summary({})]);
    pressButton(container, "common.retry");
    expect(await findByText("Léa Moreau")).toBeTruthy();
  });

  it("dit qu'aucun débrief n'est encore arrivé", async () => {
    list.mockResolvedValue([]);
    const { findByText } = renderRn(<CoachFeedbacksScreen />);

    expect(await findByText("feedback.coach.empty.title")).toBeTruthy();
  });

  it("se rafraîchit quand on tire la liste", async () => {
    list.mockResolvedValue([]);
    const { container, findByText } = renderRn(<CoachFeedbacksScreen />);
    await findByText("feedback.coach.empty.title");

    press(container.querySelector("[data-refresh]") as HTMLElement);

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});

describe("CoachFeedbacksScreen — les deux groupes", () => {
  /** Ce qui reste à faire se voit sans geste ; l'ancien reste consultable, sous son intertitre. */
  it("met les débriefs à relire avant ceux déjà lus", async () => {
    list.mockResolvedValue([
      summary({ id: "f-lu", athleteName: "Déjà lu", coachReadAt: "2026-10-16T21:00:00.000Z" }),
      summary({ id: "f-neuf", athleteName: "À relire" }),
    ]);
    const { findByText, container } = renderRn(<CoachFeedbacksScreen />);
    await findByText("À relire");

    const text = container.textContent ?? "";
    expect(text.indexOf("À relire")).toBeLessThan(text.indexOf("feedback.coach.alreadyRead"));
    expect(text.indexOf("feedback.coach.alreadyRead")).toBeLessThan(text.indexOf("Déjà lu"));
  });

  it("ne pose pas l'intertitre « déjà lus » quand tout reste à relire", async () => {
    list.mockResolvedValue([summary({})]);
    const { findByText, queryByText } = renderRn(<CoachFeedbacksScreen />);
    await findByText("Léa Moreau");

    expect(queryByText("feedback.coach.alreadyRead")).toBeNull();
  });
});

describe("CoachFeedbacksScreen — une ligne", () => {
  it("mène au détail de la séance débriefée", async () => {
    list.mockResolvedValue([summary({})]);
    const { findByText } = renderRn(<CoachFeedbacksScreen />);

    press(await findByText("Léa Moreau"));

    expect(router.push).toHaveBeenCalledWith("/feedbacks/s-1");
  });

  /** Un débrief peut n'être que des médias : on le dit, plutôt qu'une ligne vide. */
  it("dit qu'un débrief sans texte n'a que des médias, et combien", async () => {
    list.mockResolvedValue([summary({ content: null, mediaCount: 2 })]);
    const { findByText, getByText } = renderRn(<CoachFeedbacksScreen />);

    expect(await findByText("feedback.coach.mediaOnly")).toBeTruthy();
    expect(getByText("feedback.coach.mediaCount")).toBeTruthy();
  });

  it("tait le compte des médias quand il n'y en a pas", async () => {
    list.mockResolvedValue([summary({})]);
    const { findByText, queryByText } = renderRn(<CoachFeedbacksScreen />);
    await findByText("Bien tenu");

    expect(queryByText("feedback.coach.mediaCount")).toBeNull();
  });

  /** Le coach qui s'entraîne lui-même se reconnaît dans la liste (#14). */
  it("signale son propre débrief", async () => {
    list.mockResolvedValue([summary({ athleteId: "coach-1" })]);
    const { findByText } = renderRn(<CoachFeedbacksScreen />);

    expect(await findByText("athlete.self")).toBeTruthy();
  });
});
