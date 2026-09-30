import type { ExerciseDto } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { renderInRoute } from "../../../../test/render";
import { ExerciseList } from "./ExerciseList";

/** Le transport a ses propres tests : ici, les filtres que la liste DEMANDE et ce qu'elle montre. */
vi.mock("@/feature/library/hook/useExercises", () => ({
  useExercises: vi.fn(),
  useExerciseTags: vi.fn(),
}));

const refetch = vi.fn();
const SEARCH = "library.searchLabel";

const exercise = (id: string, title: string) =>
  ({ id, title, description: null, tags: [], documents: [] }) as unknown as ExerciseDto;

function state(options: {
  data?: ExerciseDto[];
  isPending?: boolean;
  isError?: boolean;
  tags?: string[] | undefined;
}) {
  const { data, isPending = false, isError = false } = options;
  // `tags: undefined` passé exprès = pas encore chargés ; une valeur par défaut l'avalerait.
  const tags = Object.hasOwn(options, "tags") ? options.tags : ["force", "doigts"];
  vi.mocked(useExercises).mockReturnValue({
    data,
    isPending,
    isError,
    refetch,
  } as unknown as ReturnType<typeof useExercises>);
  vi.mocked(useExerciseTags).mockReturnValue({ data: tags } as unknown as ReturnType<
    typeof useExerciseTags
  >);
}

const lastFilters = () => vi.mocked(useExercises).mock.lastCall?.[0];

function setup() {
  return renderInRoute(<ExerciseList />, {
    path: "/library",
    links: ["/library/exercises/new", "/library/exercises/$exerciseId"],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExerciseList — filtres", () => {
  it("demande toute la bibliothèque au départ", async () => {
    state({ data: [] });
    await setup();

    expect(lastFilters()).toEqual({});
  });

  it("cherche le texte tapé, sans ses espaces de bord", async () => {
    state({ data: [] });
    const { user, getByRole } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), "  Planche ");

    expect(lastFilters()).toEqual({ search: "Planche" });
  });

  // Une recherche faite d'espaces n'en est pas une : elle ne filtre rien.
  it("ignore une recherche faite d'espaces", async () => {
    state({ data: [] });
    const { user, getByRole } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), "   ");

    expect(lastFilters()).toEqual({});
  });

  it("filtre par tag, et « Tous » retire le filtre", async () => {
    state({ data: [] });
    const { user, getByRole } = await setup();

    await user.click(getByRole("button", { name: "force" }));
    expect(lastFilters()).toEqual({ tag: "force" });
    expect(getByRole("button", { name: "force" })).toHaveAttribute("aria-pressed", "true");

    await user.click(getByRole("button", { name: "library.filterAllTags" }));
    expect(lastFilters()).toEqual({});
  });

  it("combine le tag et la recherche", async () => {
    state({ data: [] });
    const { user, getByRole } = await setup();

    await user.click(getByRole("button", { name: "doigts" }));
    await user.type(getByRole("searchbox", { name: SEARCH }), "pinces");

    expect(lastFilters()).toEqual({ tag: "doigts", search: "pinces" });
  });

  // Un filtre à un seul bouton « Tous » ne filtrerait rien.
  it.each([
    ["aucun tag", []],
    ["tags pas encore chargés", undefined],
  ])("n'affiche pas de filtre de tags : %s", async (_case, tags) => {
    state({ data: [], tags });
    const { queryByRole } = await setup();

    expect(queryByRole("button", { name: "library.filterAllTags" })).not.toBeInTheDocument();
  });
});

describe("ExerciseList — états", () => {
  it("dit qu'elle charge", async () => {
    state({ isPending: true });
    const { getByText, queryByText } = await setup();

    expect(getByText("common.loading")).toBeInTheDocument();
    expect(queryByText("library.empty.title")).not.toBeInTheDocument();
  });

  it("propose de réessayer en cas d'échec, sans se dire vide", async () => {
    state({ isError: true });
    const { user, getByRole, queryByText } = await setup();

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(queryByText("library.empty.title")).not.toBeInTheDocument();
  });

  it("amorce une bibliothèque vide par la création d'un exercice", async () => {
    state({ data: [] });
    const { user, getByRole, getByText, queryByText, router } = await setup();

    expect(getByText("library.empty.description")).toBeInTheDocument();
    expect(queryByText("library.noMatch.title")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.newExercise" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/exercises/new"));
    expect(router.state.location.search).toEqual({});
  });

  // Une recherche qui ne trouve rien n'est pas une bibliothèque vide : elle propose de créer
  // l'exercice cherché, titre prérempli.
  it("propose de créer l'exercice cherché quand la recherche ne trouve rien", async () => {
    state({ data: [] });
    const { user, getByRole, queryByText, router } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), " Planche ");
    expect(queryByText("library.empty.title")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: "library.noMatch.create" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/exercises/new"));
    expect(router.state.location.search).toEqual({ title: "Planche" });
  });

  it("montre chaque exercice, et ouvre celui qu'on choisit", async () => {
    state({ data: [exercise("ex-1", "Tractions"), exercise("ex-2", "Gainage")] });
    const { user, getByRole, getAllByRole, queryByText, router } = await setup();

    expect(getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Tractions",
      "Gainage",
    ]);
    expect(queryByText("library.empty.title")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: /Gainage/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/library/exercises/ex-2"));
  });
});
