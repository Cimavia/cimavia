import {
  type ExerciseDto,
  MyAccessLevel,
  type SessionDto,
  type StructureLibraryDto,
  StructurePresetKey,
} from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useChangeExerciseAccess,
  useExercises,
  useExerciseTags,
} from "@/feature/library/hook/useExercises";
import { useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { useChangeSessionAccess, useSessions } from "@/feature/library/hook/useSessions";
import { useDeleteStructure, useStructureLibrary } from "@/feature/library/hook/useStructures";
import { renderInRoute } from "../../../../test/render";
import { LibraryScreen } from "./LibraryScreen";

vi.mock("@/feature/library/hook/useExercises", () => ({
  useExercises: vi.fn(),
  useExerciseTags: vi.fn(),
  useChangeExerciseAccess: vi.fn(),
}));
vi.mock("@/feature/library/hook/useMyOrganizations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/hook/useMyOrganizations")>()),
  useMyOrganizations: vi.fn(),
}));
vi.mock("@/feature/library/hook/useSessions", () => ({
  useSessions: vi.fn(),
  useChangeSessionAccess: vi.fn(),
}));
vi.mock("@/feature/library/hook/useStructures", () => ({
  useStructureLibrary: vi.fn(),
  useDeleteStructure: vi.fn(),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "coach-1", name: "Cédric" } } }),
    signOut: vi.fn(),
  },
}));
vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));

const session = {
  id: "s-7",
  title: "Force max",
  notes: null,
  exercises: [],
  blocks: [],
  owner: { id: "coach-1", name: "Cédric" },
  myAccess: { level: MyAccessLevel.OWNER, via: null },
  grants: [],
  coachGrants: [],
  updatedAt: "2026-10-06T08:00:00.000Z",
} as unknown as SessionDto;
const exercise = {
  id: "ex-1",
  title: "Tractions",
  tags: [],
  owner: { id: "coach-1", name: "Cédric" },
  myAccess: { level: MyAccessLevel.OWNER, via: null },
  grants: [],
  coachGrants: [],
  updatedAt: "2026-10-06T08:00:00.000Z",
} as unknown as ExerciseDto;

const structures: StructureLibraryDto = {
  presets: [{ key: StructurePresetKey.TABATA, sessionCount: 2 }],
  structures: [],
};

function served(served: {
  exercises: ExerciseDto[] | undefined;
  sessions: SessionDto[] | undefined;
  /** Absente : la bibliothèque des structures prêtes. `undefined` : pas encore chargée. */
  library?: StructureLibraryDto | undefined;
}) {
  const { exercises, sessions } = served;
  const library = "library" in served ? served.library : structures;
  const query = (data: unknown) => ({
    data,
    isPending: data == null,
    isError: false,
    refetch: vi.fn(),
  });
  vi.mocked(useExercises).mockReturnValue(
    query(exercises) as unknown as ReturnType<typeof useExercises>,
  );
  vi.mocked(useSessions).mockReturnValue(
    query(sessions) as unknown as ReturnType<typeof useSessions>,
  );
  vi.mocked(useStructureLibrary).mockReturnValue(
    query(library) as unknown as ReturnType<typeof useStructureLibrary>,
  );
  vi.mocked(useDeleteStructure).mockReturnValue({
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteStructure>);
  vi.mocked(useExerciseTags).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof useExerciseTags
  >);
  vi.mocked(useChangeExerciseAccess).mockReturnValue({
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useChangeExerciseAccess>);
  vi.mocked(useChangeSessionAccess).mockReturnValue({
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useChangeSessionAccess>);
  vi.mocked(useMyOrganizations).mockReturnValue({
    data: [],
    isError: false,
  } as unknown as ReturnType<typeof useMyOrganizations>);
}

function setup(search: Record<string, string> = {}) {
  return renderInRoute(<LibraryScreen />, {
    path: "/library",
    search,
    links: [
      "/",
      "/messages",
      "/plans",
      "/invoices",
      "/reminders",
      "/account",
      "/library/exercises/new",
      "/library/exercises/$exerciseId",
      "/library/sessions/new",
      "/library/sessions/$sessionId",
      "/library/structures/new",
      "/library/structures/$structureId",
    ],
  });
}

const tabs = (view: Awaited<ReturnType<typeof setup>>) =>
  view.getAllByRole("tab").map((tab) => tab.textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LibraryScreen", () => {
  it("s'ouvre sur les exercices", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { getByRole, getByText } = await setup();

    expect(getByRole("tab", { name: /library\.tabs\.exercises/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(getByText("Tractions")).toBeInTheDocument();
  });

  // Les compteurs sont les TOTAUX : la liste d'exercices, elle, peut être filtrée.
  it("compte la bibliothèque entière dans les onglets, non filtrée", async () => {
    served({ exercises: [exercise, { ...exercise, id: "ex-2" }], sessions: [session] });
    const view = await setup();

    // Les structures prêtes comptent avec celles du Coach.
    expect(tabs(view)).toEqual([
      "library.tabs.exercises2",
      "library.tabs.sessions1",
      "library.tabs.structures1",
    ]);
    expect(vi.mocked(useExercises)).toHaveBeenCalledWith({});
  });

  // Pas encore chargé n'est pas zéro : l'onglet se tait plutôt que d'afficher « 0 ».
  it("n'affiche aucun compteur tant que la bibliothèque n'est pas chargée", async () => {
    served({ exercises: undefined, sessions: undefined, library: undefined });
    const view = await setup();

    expect(tabs(view)).toEqual([
      "library.tabs.exercises",
      "library.tabs.sessions",
      "library.tabs.structures",
    ]);
  });

  it("crée un exercice depuis l'onglet des exercices", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, router } = await setup();

    await user.click(getByRole("button", { name: "library.newExercise" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/exercises/new"));
  });

  it("montre les séances et crée une séance depuis leur onglet", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, getByText, queryByText, router } = await setup();

    await user.click(getByRole("tab", { name: /library\.tabs\.sessions/ }));
    expect(getByText("Force max")).toBeInTheDocument();
    expect(queryByText("Tractions")).not.toBeInTheDocument();
    // L'onglet tient dans l'URL : un constructeur y ramène (#717).
    expect(router.state.location.search).toEqual({ tab: "sessions" });
    await user.click(getByRole("button", { name: "library.newSession" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/sessions/new"));
  });

  it("crée la première séance depuis l'état vide de leur onglet", async () => {
    served({ exercises: [exercise], sessions: [] });
    const { user, getByRole, getAllByRole, router } = await setup();

    await user.click(getByRole("tab", { name: /library\.tabs\.sessions/ }));
    // Deux boutons « nouvelle séance » : l'action d'en-tête, et celle de l'état vide.
    await user.click(getAllByRole("button", { name: "library.newSession" })[1] as HTMLElement);

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/sessions/new"));
  });

  it("ouvre la séance choisie", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, router } = await setup();

    await user.click(getByRole("tab", { name: /library\.tabs\.sessions/ }));
    await user.click(getByRole("button", { name: /Force max/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/sessions/s-7"));
  });

  it("s'ouvre sur l'onglet que porte l'URL", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { getByRole } = await setup({ tab: "structures" });

    expect(getByRole("tab", { name: /library\.tabs\.structures/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(getByRole("button", { name: "library.newStructure" })).toBeInTheDocument();
  });

  it("revient aux exercices, et l'URL perd son onglet", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, router } = await setup({ tab: "sessions" });

    await user.click(getByRole("tab", { name: /library\.tabs\.exercises/ }));

    expect(router.state.location.search).toEqual({});
  });

  it("crée une structure depuis leur onglet", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, router } = await setup({ tab: "structures" });

    await user.click(getByRole("button", { name: "library.newStructure" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/structures/new"));
  });

  it("duplique une structure prête vers une création d'après elle", async () => {
    served({ exercises: [exercise], sessions: [session] });
    const { user, getByRole, router } = await setup({ tab: "structures" });

    await user.click(getByRole("button", { name: "library.structure.duplicate" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/structures/new"));
    expect(router.state.location.search).toEqual({ from: "TABATA" });
  });

  it("duplique et ouvre une structure du Coach", async () => {
    const mine = {
      id: "st-1",
      name: "4×4 grimpe",
      tags: [],
      note: null,
      instructions: null,
      settings: { advance: { kind: "ATHLETE" }, repeat: { kind: "ONCE" } },
      sessionCount: 0,
      createdAt: "2026-10-06T08:00:00.000Z",
      updatedAt: "2026-10-06T08:00:00.000Z",
    } as unknown as StructureLibraryDto["structures"][number];
    served({
      exercises: [exercise],
      sessions: [session],
      library: { presets: [], structures: [mine] },
    });
    const { user, getByRole, router } = await setup({ tab: "structures" });

    await user.click(getByRole("button", { name: "library.structure.duplicateNamed" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ from: "st-1" }));

    router.history.back();
    await user.click(await waitFor(() => getByRole("button", { name: /4×4 grimpe/ })));
    await waitFor(() => expect(router.state.location.pathname).toBe("/library/structures/st-1"));
  });
});
