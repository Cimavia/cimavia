import { type AthleteSheetDto, athleteKeys, type CoachAthleteDto } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { useLocalSearchParams } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi } from "@/feature/athlete/api";
import { AthleteSheetScreen } from "@/feature/athlete/screen/AthleteSheetScreen";
import { ApiError } from "@/shared/lib/api";
import { pressButton, renderRn } from "@/test/render";

// Seuls les appels sont remplacés : les hooks et leurs clés de cache restent les VRAIS.
vi.mock("@/feature/athlete/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/athlete/api")>();
  return {
    ...original,
    accountApi: {
      ...original.accountApi,
      listAthletes: vi.fn(),
      getAthleteSheet: vi.fn(),
      saveAthleteSheet: vi.fn(),
    },
  };
});

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach-1" } } }) },
}));

vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const listAthletes = vi.mocked(accountApi.listAthletes);
const getSheet = vi.mocked(accountApi.getAthleteSheet);
const saveSheet = vi.mocked(accountApi.saveAthleteSheet);

const ATHLETE = {
  id: "ca-1",
  coachId: "coach-1",
  coachName: "Kylian",
  athleteId: "ath-1",
  athleteName: "Léa Martin",
  status: "ACTIVE",
  invitedAt: "2026-01-01T08:00:00.000Z",
  joinedAt: "2026-01-02T08:00:00.000Z",
  isSelf: false,
} as CoachAthleteDto;

const sheet = (content: string): AthleteSheetDto => ({
  id: "sh-1",
  athleteId: "ath-1",
  coachId: "coach-1",
  content,
  updatedAt: "2026-09-01T08:00:00.000Z",
});

const FAILURE = new ApiError(500, "boom", null);

const field = (container: HTMLElement) => {
  const textarea = container.querySelector("textarea");
  if (textarea == null) throw new Error("champ introuvable");
  return textarea;
};

beforeEach(() => {
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: "ath-1" });
  listAthletes.mockResolvedValue([ATHLETE]);
  getSheet.mockResolvedValue(sheet("Épaule gauche fragile"));
  saveSheet.mockImplementation(async (_, input) => sheet(input.content));
});

describe("AthleteSheetScreen — l'en-tête", () => {
  it("nomme l'athlète suivi et dit depuis quand", async () => {
    const { findByText, queryByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("Léa Martin")).toBeTruthy();
    expect(queryByText("LM")).not.toBeNull();
    expect(queryByText("athlete.sheet.since")).not.toBeNull();
  });

  it("ne date pas un suivi dont l'acceptation n'est pas datée", async () => {
    listAthletes.mockResolvedValue([{ ...ATHLETE, joinedAt: null }]);
    const { findByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("athlete.sheet.sinceUnknown")).toBeTruthy();
  });

  /** On ne fabrique pas un nom depuis l'id : un athlète absent de la liste se rend « — ». */
  it.each([
    ["tant que la liste charge", () => listAthletes.mockReturnValue(new Promise(() => undefined))],
    ["quand l'athlète n'y figure pas", () => listAthletes.mockResolvedValue([])],
  ])("rend « — » %s", async (_, arrange) => {
    arrange();
    const { findByText, queryByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("—")).toBeTruthy();
    expect(queryByText("athlete.sheet.sinceUnknown")).not.toBeNull();
  });
});

describe("AthleteSheetScreen — la lecture", () => {
  it("lit la fiche de l'athlète désigné par l'url", async () => {
    const { findByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("Épaule gauche fragile")).toBeTruthy();
    expect(getSheet).toHaveBeenCalledWith("ath-1");
  });

  /** Un « aucune note » sur une requête en cours serait faux, pas vide. */
  it("n'affirme rien tant que la fiche charge", () => {
    getSheet.mockReturnValue(new Promise(() => undefined));
    const { container, queryByText } = renderRn(<AthleteSheetScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(queryByText("athlete.sheet.empty")).toBeNull();
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("dit la panne plutôt qu'une fiche vide, et offre de réessayer", async () => {
    getSheet.mockRejectedValue(FAILURE);
    const { container, findByText, queryByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("common.retry")).toBeTruthy();
    expect(queryByText("athlete.sheet.empty")).toBeNull();

    getSheet.mockResolvedValue(sheet("Épaule gauche fragile"));
    pressButton(container, "common.retry");

    expect(await findByText("Épaule gauche fragile")).toBeTruthy();
  });

  /** Même rendu à vide, mais le bouton dit si l'on repart de zéro ou si l'on reprend l'existant. */
  it.each([
    ["jamais écrite", null, "athlete.sheet.add"],
    ["vidée", sheet("   "), "athlete.sheet.edit"],
  ])("dit l'absence de note d'une fiche %s", async (_, served, action) => {
    getSheet.mockResolvedValue(served);
    const { findByText, queryByText } = renderRn(<AthleteSheetScreen />);

    expect(await findByText("athlete.sheet.empty")).toBeTruthy();
    expect(queryByText(action)).not.toBeNull();
  });
});

describe("AthleteSheetScreen — l'édition", () => {
  it("ouvre l'édition sur le texte déjà enregistré", async () => {
    const { container, findByText } = renderRn(<AthleteSheetScreen />);
    await findByText("Épaule gauche fragile");

    pressButton(container, "athlete.sheet.edit");

    expect(field(container).value).toBe("Épaule gauche fragile");
  });

  it("ouvre une fiche jamais écrite sur un champ vide", async () => {
    getSheet.mockResolvedValue(null);
    const { container, findByText } = renderRn(<AthleteSheetScreen />);
    await findByText("athlete.sheet.add");

    pressButton(container, "athlete.sheet.add");

    expect(field(container).value).toBe("");
  });

  it("enregistre la fiche entière, la pose dans le cache et repasse en lecture", async () => {
    const { container, findByText, queryClient } = renderRn(<AthleteSheetScreen />);
    await findByText("Épaule gauche fragile");
    pressButton(container, "athlete.sheet.edit");

    fireEvent.change(field(container), { target: { value: "Épaule rétablie" } });
    pressButton(container, "athlete.sheet.save");

    expect(await findByText("Épaule rétablie")).toBeTruthy();
    expect(saveSheet).toHaveBeenCalledWith("ath-1", { content: "Épaule rétablie" });
    expect(container.querySelector("textarea")).toBeNull();
    expect(queryClient.getQueryData(athleteKeys.sheet("ath-1"))).toMatchObject({
      content: "Épaule rétablie",
    });
  });

  it("abandonne la saisie sans rien envoyer", async () => {
    const { container, findByText } = renderRn(<AthleteSheetScreen />);
    await findByText("Épaule gauche fragile");
    pressButton(container, "athlete.sheet.edit");

    fireEvent.change(field(container), { target: { value: "Brouillon" } });
    pressButton(container, "common.cancel");

    expect(await findByText("Épaule gauche fragile")).toBeTruthy();
    expect(container.querySelector("textarea")).toBeNull();
    expect(saveSheet).not.toHaveBeenCalled();
  });

  it("fige la saisie pendant l'enregistrement", async () => {
    saveSheet.mockReturnValue(new Promise(() => undefined));
    const { container, findByText } = renderRn(<AthleteSheetScreen />);
    await findByText("Épaule gauche fragile");
    pressButton(container, "athlete.sheet.edit");

    pressButton(container, "athlete.sheet.save");

    expect(await findByText("athlete.sheet.saving")).toBeTruthy();
    expect(field(container).readOnly).toBe(true);
    pressButton(container, "common.cancel");
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  /** L'échec garde la saisie : le coach ne doit pas retaper sa note. */
  it("dit l'échec en gardant la saisie ouverte", async () => {
    saveSheet.mockRejectedValue(FAILURE);
    const { container, findByText } = renderRn(<AthleteSheetScreen />);
    await findByText("Épaule gauche fragile");
    pressButton(container, "athlete.sheet.edit");
    fireEvent.change(field(container), { target: { value: "Épaule rétablie" } });

    pressButton(container, "athlete.sheet.save");

    expect(await findByText("athlete.sheet.error")).toBeTruthy();
    await waitFor(() => expect(field(container).value).toBe("Épaule rétablie"));
  });
});
