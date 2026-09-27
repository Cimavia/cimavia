import { type AthleteSheetDto, athleteKeys } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteSheetPanel } from "@/feature/athlete/component/AthleteSheetPanel";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/athlete/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    accountApi: {
      getAthleteSheet: vi.fn(),
      saveAthleteSheet: vi.fn(),
    },
    athleteKeys: shared.athleteKeys,
    invitationKeys: shared.invitationKeys,
  };
});
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));

const { accountApi } = await import("@/feature/athlete/api");
const getAthleteSheet = vi.mocked(accountApi.getAthleteSheet);
const saveAthleteSheet = vi.mocked(accountApi.saveAthleteSheet);

const SHEET: AthleteSheetDto = {
  id: "sheet_1",
  athleteId: "ath_1",
  coachId: "coach_1",
  content: "Épaule droite sensible.",
  updatedAt: "2026-09-01T09:00:00.000Z",
};

beforeEach(() => {
  getAthleteSheet.mockResolvedValue(SHEET);
  saveAthleteSheet.mockResolvedValue(SHEET);
});

const render = () =>
  renderWithProviders(
    <AthleteSheetPanel athlete={{ athleteId: "ath_1", athleteName: "Léa" }} onClose={() => {}} />,
  );

const submitButton = () => screen.queryByRole("button", { name: "athlete.sheet.submit" });

describe("AthleteSheetPanel — une fiche non reçue ne s'édite pas (#301)", () => {
  /**
   * `PUT` remplace la fiche : si l'échec de lecture se rendait comme une fiche vierge, le coach y
   * écrirait deux lignes et effacerait des mois de notes.
   */
  it("en échec de lecture, montre l'erreur, sans champ ni bouton d'enregistrement", async () => {
    getAthleteSheet.mockRejectedValue(new Error("boom"));
    render();

    expect(await screen.findByText("common.errorTitle")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(submitButton()).toBeNull();
  });

  it("réessayer relit la fiche, et le formulaire arrive avec son contenu", async () => {
    getAthleteSheet.mockRejectedValueOnce(new Error("boom"));
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "common.retry" }));

    expect(await screen.findByRole("textbox")).toHaveValue(SHEET.content);
    expect(submitButton()).toBeInTheDocument();
  });

  // Le bouton du pied restait actif pendant le chargement : un clic enregistrait « ».
  it("pendant le chargement, ni champ ni bouton d'enregistrement", async () => {
    getAthleteSheet.mockReturnValue(new Promise(() => {}));
    render();

    expect(await screen.findByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(submitButton()).toBeNull();
  });

  // `null` = jamais rédigée : c'est une fiche REÇUE, elle s'édite — à ne pas confondre avec l'échec.
  it("une fiche jamais rédigée s'ouvre vide et s'enregistre", async () => {
    getAthleteSheet.mockResolvedValue(null);
    const { user } = render();

    const field = await screen.findByRole("textbox");
    expect(field).toHaveValue("");
    await user.type(field, "Objectif : 7b");
    await user.click(submitButton() as HTMLElement);

    await waitFor(() =>
      expect(saveAthleteSheet).toHaveBeenCalledWith("ath_1", { content: "Objectif : 7b" }),
    );
  });

  /**
   * Au retour d'onglet, TanStack relance la lecture ; si elle échoue, `isError` passe à vrai alors
   * que la fiche est en cache. Brancher le rendu sur `isError` ferait disparaître le brouillon.
   */
  it("une relance ratée sur une fiche déjà reçue garde le brouillon et l'enregistrement", async () => {
    const { user, queryClient } = render();
    const field = await screen.findByRole("textbox");
    await user.type(field, " Genou OK.");

    getAthleteSheet.mockRejectedValue(new Error("boom"));
    await queryClient.refetchQueries({ queryKey: athleteKeys.sheet("ath_1") });
    await waitFor(() =>
      expect(queryClient.getQueryState(athleteKeys.sheet("ath_1"))?.status).toBe("error"),
    );

    expect(screen.getByRole("textbox")).toHaveValue(`${SHEET.content} Genou OK.`);
    expect(submitButton()).toBeInTheDocument();
    expect(screen.queryByText("common.errorTitle")).toBeNull();
  });
});
