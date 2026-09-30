import type { ExerciseDto, SessionDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { renderInRoute } from "../../../../test/render";
import { LibraryScreen } from "./LibraryScreen";

vi.mock("@/feature/library/hook/useExercises", () => ({
  useExercises: vi.fn(),
  useExerciseTags: vi.fn(),
}));
vi.mock("@/feature/library/hook/useSessions", () => ({ useSessions: vi.fn() }));
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
} as unknown as SessionDto;
const exercise = {
  id: "ex-1",
  title: "Tractions",
  description: null,
  tags: [],
  documents: [],
} as unknown as ExerciseDto;

function served({
  exercises,
  sessions,
}: {
  exercises: ExerciseDto[] | undefined;
  sessions: SessionDto[] | undefined;
}) {
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
  vi.mocked(useExerciseTags).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof useExerciseTags
  >);
}

function setup() {
  return renderInRoute(<LibraryScreen />, {
    path: "/library",
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

    expect(tabs(view)).toEqual(["library.tabs.exercises2", "library.tabs.sessions1"]);
    expect(vi.mocked(useExercises)).toHaveBeenCalledWith({});
  });

  // Pas encore chargé n'est pas zéro : l'onglet se tait plutôt que d'afficher « 0 ».
  it("n'affiche aucun compteur tant que la bibliothèque n'est pas chargée", async () => {
    served({ exercises: undefined, sessions: undefined });
    const view = await setup();

    expect(tabs(view)).toEqual(["library.tabs.exercises", "library.tabs.sessions"]);
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
});
