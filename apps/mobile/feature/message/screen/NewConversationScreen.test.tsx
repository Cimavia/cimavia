import type { ConversationCandidatesDto } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useConversationCandidates,
  useCreateConversation,
} from "@/feature/message/hook/useConversation";
import { NewConversationScreen } from "@/feature/message/screen/NewConversationScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les hooks sont remplacés : leur transport a ses propres tests, et la règle des avertissements
 * vit dans `selectionWarnings` (@cmv/shared). Ce qui s'éprouve ICI est ce que l'écran en fait — ce
 * qu'il propose à chaque titre, quand il laisse créer, et où il mène.
 */
vi.mock("@/feature/message/hook/useConversation", () => ({
  useConversationCandidates: vi.fn(),
  useCreateConversation: vi.fn(),
}));
vi.mock("@/shared/hook/useExercisedCapability", () => ({ useActingCapability: vi.fn() }));

// La phase multi-coach vue par C : ses athlètes TE et TI, M de l'entreprise F, qui suit TI seul.
const COACH_SIDE: ConversationCandidatesDto = {
  athletes: [
    { userId: "te", name: "Théo Esnault" },
    { userId: "ti", name: "Tia Iris" },
  ],
  coaches: [
    { userId: "m", name: "Marc Morel", organizationNames: ["F"], followedAthleteIds: ["ti"] },
  ],
};

// Vue par TI : ses deux coachs, tous deux via F.
const ATHLETE_SIDE: ConversationCandidatesDto = {
  athletes: [],
  coaches: [
    { userId: "c", name: "Chloé Caron", organizationNames: ["F"], followedAthleteIds: null },
    { userId: "m", name: "Marc Morel", organizationNames: [], followedAthleteIds: null },
  ],
};

const mutate = vi.fn();
const refetch = vi.fn();

function mockCandidates(state: Record<string, unknown>): void {
  vi.mocked(useConversationCandidates).mockReturnValue({
    data: COACH_SIDE,
    isPending: false,
    isError: false,
    refetch,
    ...state,
  } as unknown as ReturnType<typeof useConversationCandidates>);
}

function mockCreate(state: Record<string, unknown> = {}): void {
  vi.mocked(useCreateConversation).mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    ...state,
  } as unknown as ReturnType<typeof useCreateConversation>);
}

/** Le bouton « Créer » : `CmvButton` est un `Pressable`, rendu en nœud focalisable à `aria-disabled`. */
function createButton(container: HTMLElement): Element | undefined {
  return [...container.querySelectorAll("[tabindex]")].find(
    (node) => node.textContent === "messages.new.create",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActingCapability).mockReturnValue("coach");
  mockCandidates({});
  mockCreate();
});

describe("NewConversationScreen — côté athlète (M2)", () => {
  beforeEach(() => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    mockCandidates({ data: ATHLETE_SIDE });
  });

  it("propose ses coachs, sans recherche, avec la provenance du lien", () => {
    const { queryByText, container } = renderRn(<NewConversationScreen />);

    expect(queryByText("messages.new.myCoaches")).not.toBeNull();
    expect(queryByText("Chloé Caron")).not.toBeNull();
    expect(queryByText("messages.new.viaOrganizations")).not.toBeNull();
    // Un lien direct se dit par la seule capacité.
    expect(queryByText("messages.capability.coach")).not.toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("crée avec les coachs cochés, puis ouvre ce que l'API rend", () => {
    mutate.mockImplementation((_input, options: { onSuccess: (c: { id: string }) => void }) =>
      options.onSuccess({ id: "cv-m" }),
    );
    const { getByText, container } = renderRn(<NewConversationScreen />);

    press(getByText("Marc Morel"));
    pressButton(container, "messages.new.create");

    expect(mutate).toHaveBeenCalledWith(
      { participants: [{ userId: "m", capability: "coach" }] },
      expect.anything(),
    );
    // `replace` : revenir du fil ramène à la liste, pas au sélecteur.
    expect(router.replace).toHaveBeenCalledWith("/messages/cv-m");
  });
});

describe("NewConversationScreen — côté Coach", () => {
  it("titre la section des coachs de leur entreprise commune", () => {
    const { queryByText } = renderRn(<NewConversationScreen />);

    expect(queryByText("messages.new.athletes")).not.toBeNull();
    expect(queryByText("messages.new.coachesOf")).not.toBeNull();
    expect(queryByText("messages.new.ofOrganizations")).not.toBeNull();
  });

  it("ferme « Créer » sans sélection, l'ouvre dès un participant coché", () => {
    const { getByText, container } = renderRn(<NewConversationScreen />);
    expect(createButton(container)?.getAttribute("aria-disabled")).toBe("true");

    press(getByText("Tia Iris"));

    expect(createButton(container)?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("ferme « Créer » le temps d'une création", () => {
    mockCreate({ isPending: true });
    const { getByText, container } = renderRn(<NewConversationScreen />);

    press(getByText("Tia Iris"));

    expect(createButton(container)?.getAttribute("aria-disabled")).toBe("true");
  });

  it("filtre les candidats par la recherche", () => {
    const { container, queryByText } = renderRn(<NewConversationScreen />);
    const field = container.querySelector("input");
    if (field == null) throw new Error("champ de recherche introuvable");

    fireEvent.change(field, { target: { value: "tia" } });

    expect(queryByText("Tia Iris")).not.toBeNull();
    expect(queryByText("Théo Esnault")).toBeNull();
  });

  it("dit qu'une recherche ne trouve personne", () => {
    const { container, queryByText } = renderRn(<NewConversationScreen />);
    const field = container.querySelector("input");
    if (field == null) throw new Error("champ de recherche introuvable");

    fireEvent.change(field, { target: { value: "zzz" } });

    expect(queryByText("messages.new.noResult")).not.toBeNull();
  });

  // Les deux avertissements se cumulent (tranché en #598 : prévenir plutôt qu'interdire).
  it("prévient que des athlètes se verront, et qu'un coach voit qui il ne suit pas", () => {
    const { getByText, queryByText } = renderRn(<NewConversationScreen />);

    press(getByText("Théo Esnault"));
    press(getByText("Tia Iris"));
    expect(queryByText("messages.new.athletesWarning")).not.toBeNull();
    expect(queryByText("messages.new.unfollowedWarning")).toBeNull();

    press(getByText("Marc Morel"));
    expect(queryByText("messages.new.unfollowedWarning")).not.toBeNull();
  });

  it("montre les participants choisis, et les retire d'une pression", () => {
    const { getByText, getAllByText, queryByText } = renderRn(<NewConversationScreen />);

    press(getByText("Tia Iris"));
    expect(queryByText("messages.new.chosen")).not.toBeNull();
    // La ligne cochée, et sa pastille parmi les choisis.
    expect(getAllByText("Tia Iris")).toHaveLength(2);

    press(getAllByText("Tia Iris")[0] as Element);
    expect(queryByText("messages.new.chosen")).toBeNull();
  });

  it("dit l'échec de la création", () => {
    mockCreate({ isError: true });
    const { queryByText } = renderRn(<NewConversationScreen />);

    expect(queryByText("messages.new.createError")).not.toBeNull();
  });
});

describe("NewConversationScreen — chargement et panne", () => {
  it("ne propose personne tant que les candidats chargent", () => {
    mockCandidates({ data: undefined, isPending: true });
    const { queryByText } = renderRn(<NewConversationScreen />);

    expect(queryByText("messages.new.athletes")).toBeNull();
  });

  it("propose de relire les candidats en panne", () => {
    mockCandidates({ data: undefined, isError: true });
    const { container } = renderRn(<NewConversationScreen />);

    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("revient en arrière sans rien créer", () => {
    const { container } = renderRn(<NewConversationScreen />);
    const back = container.querySelector('[data-icon="chevron-back"]')?.parentElement;
    if (back == null) throw new Error("retour introuvable");

    press(back);

    expect(router.back).toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});
