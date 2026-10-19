import { ApiError, type AthleteSheetDto, athleteKeys, STALE_WRITE } from "@cmv/shared";
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
  vi.clearAllMocks();
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
      expect(saveAthleteSheet).toHaveBeenCalledWith("ath_1", {
        content: "Objectif : 7b",
        expectedUpdatedAt: null,
      }),
    );
  });

  it("dit l'enregistrement en cours, bouton éteint", async () => {
    saveAthleteSheet.mockReturnValue(new Promise(() => {}));
    const { user } = render();

    await user.type(await screen.findByRole("textbox"), " Et le genou.");
    await user.click(submitButton() as HTMLElement);

    expect(await screen.findByRole("button", { name: "athlete.sheet.submitting" })).toBeDisabled();
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

describe("AthleteSheetPanel — la version lue (#440)", () => {
  const LATER: AthleteSheetDto = {
    ...SHEET,
    content: "Écrit dans l'autre onglet.",
    updatedAt: "2026-09-02T10:00:00.000Z",
  };
  const staleWrite = () => new ApiError(409, STALE_WRITE, null);

  it("cite la version de la fiche reçue", async () => {
    const { user } = render();

    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    await waitFor(() =>
      expect(saveAthleteSheet).toHaveBeenCalledWith("ath_1", {
        content: `${SHEET.content} Genou OK.`,
        expectedUpdatedAt: SHEET.updatedAt,
      }),
    );
  });

  /**
   * Au retour d'onglet, la relance range en cache la version qu'un autre onglet a écrite. Citer
   * celle-là ferait passer le brouillon par-dessus : c'est la version de DÉPART qui part.
   */
  it("cite la version sur laquelle la saisie a commencé, pas celle d'une relance", async () => {
    const { user, queryClient } = render();
    await user.type(await screen.findByRole("textbox"), " Genou OK.");

    getAthleteSheet.mockResolvedValue(LATER);
    await queryClient.refetchQueries({ queryKey: athleteKeys.sheet("ath_1") });
    await user.click(submitButton() as HTMLElement);

    await waitFor(() =>
      expect(saveAthleteSheet).toHaveBeenCalledWith("ath_1", {
        content: `${SHEET.content} Genou OK.`,
        expectedUpdatedAt: SHEET.updatedAt,
      }),
    );
  });

  /**
   * Le panneau se ferme sur l'enregistrement : la requête perd son observateur, et une simple
   * invalidation ne la relirait pas. Rouvert, il citerait la version d'avant — un 409 sur la propre
   * écriture du coach.
   */
  it("range en cache la fiche rendue, version comprise", async () => {
    saveAthleteSheet.mockResolvedValue(LATER);
    const { user, queryClient } = render();

    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    await waitFor(() =>
      expect(queryClient.getQueryData(athleteKeys.sheet("ath_1"))).toEqual(LATER),
    );
  });

  it("sur un conflit, garde la saisie et le dit, sans fermer le panneau", async () => {
    saveAthleteSheet.mockRejectedValue(staleWrite());
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AthleteSheetPanel athlete={{ athleteId: "ath_1", athleteName: "Léa" }} onClose={onClose} />,
    );

    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    expect(await screen.findByRole("alert")).toHaveTextContent("athlete.sheet.stale");
    expect(screen.getByRole("textbox")).toHaveValue(`${SHEET.content} Genou OK.`);
    expect(onClose).not.toHaveBeenCalled();
    // Le code brut de l'API n'atteint pas l'écran : le bandeau le dit déjà, traduit.
    expect(screen.queryByText(STALE_WRITE)).toBeNull();
  });

  it("« Recharger » remplace la saisie par la dernière version", async () => {
    saveAthleteSheet.mockRejectedValueOnce(staleWrite());
    const { user } = render();
    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    getAthleteSheet.mockResolvedValue(LATER);
    await user.click(await screen.findByRole("button", { name: "common.staleReload" }));

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(LATER.content));
    expect(screen.queryByRole("alert")).toBeNull();

    // La saisie suivante part de la version rechargée.
    await user.type(screen.getByRole("textbox"), " Repris.");
    await user.click(submitButton() as HTMLElement);
    await waitFor(() =>
      expect(saveAthleteSheet).toHaveBeenLastCalledWith("ath_1", {
        content: `${LATER.content} Repris.`,
        expectedUpdatedAt: LATER.updatedAt,
      }),
    );
  });

  it("une relecture ratée garde la saisie et le bandeau", async () => {
    saveAthleteSheet.mockRejectedValue(staleWrite());
    const { user } = render();
    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    getAthleteSheet.mockRejectedValue(new Error("boom"));
    await user.click(await screen.findByRole("button", { name: "common.staleReload" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "common.staleReload" })).toBeEnabled(),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue(`${SHEET.content} Genou OK.`);
  });

  // Un autre refus n'est pas un conflit d'édition : pas de « Recharger » qui ne servirait à rien.
  it("n'affiche pas le bandeau sur un autre échec", async () => {
    saveAthleteSheet.mockRejectedValue(new ApiError(400, "Fiche trop longue", null));
    const { user } = render();

    await user.type(await screen.findByRole("textbox"), " Genou OK.");
    await user.click(submitButton() as HTMLElement);

    expect(await screen.findByText("Fiche trop longue")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "common.staleReload" })).toBeNull();
  });
});
