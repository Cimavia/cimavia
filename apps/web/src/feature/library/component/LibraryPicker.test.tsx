import { BlockType, type ExerciseDto } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { renderInRoute } from "../../../../test/render";
import { LibraryPicker } from "./LibraryPicker";

vi.mock("@/feature/library/hook/useExercises", () => ({
  useExercises: vi.fn(),
  useExerciseTags: vi.fn(),
}));

const SEARCH = "library.searchLabel";

const exercise = (id: string, title: string, overrides: Partial<ExerciseDto> = {}) =>
  ({ id, title, tags: [], blocks: [], ...overrides }) as unknown as ExerciseDto;

const series = [
  {
    id: "blk-1",
    label: null,
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
    metrics: [],
    rows: [],
  },
] as unknown as ExerciseDto["blocks"];

const library = [
  exercise("ex-1", "Échauffement", { tags: ["mobilité"] }),
  exercise("ex-2", "Tractions", { blocks: series }),
  exercise("ex-3", "Gainage"),
];

// `tags` passé à `undefined` = pas encore chargés : seule son OMISSION donne la liste par défaut.
function served(exercises: ExerciseDto[] | undefined, ...rest: [tags?: string[] | undefined]) {
  const tags = rest.length === 0 ? ["force"] : rest[0];
  vi.mocked(useExercises).mockReturnValue({ data: exercises } as unknown as ReturnType<
    typeof useExercises
  >);
  vi.mocked(useExerciseTags).mockReturnValue({ data: tags } as unknown as ReturnType<
    typeof useExerciseTags
  >);
}

async function setup() {
  const onPick = vi.fn();
  const view = await renderInRoute(<LibraryPicker customMetrics={[]} onPick={onPick} />, {
    path: "/library/sessions/new",
    links: ["/library/exercises/new"],
  });
  const titles = () =>
    view
      .queryAllByRole("button", { name: /^(Échauffement|Tractions|Gainage)/ })
      .map((button) => button.firstChild?.textContent);
  return { ...view, onPick, titles };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LibraryPicker", () => {
  it("propose toute la bibliothèque au départ", async () => {
    served(library);
    const { titles } = await setup();

    expect(titles()).toEqual(["Échauffement", "Tractions", "Gainage"]);
    expect(useExercises).toHaveBeenLastCalledWith({});
  });

  it("ne propose rien tant que la bibliothèque n'est pas chargée", async () => {
    served(undefined);
    const { titles, queryByText } = await setup();

    expect(titles()).toEqual([]);
    expect(queryByText("library.noMatch.title")).not.toBeInTheDocument();
  });

  // Le coach tape sans accent ni majuscule : « echauf » doit trouver « Échauffement ».
  it.each(["echauf", "ÉCHAUF", "  échauf "])("trouve le titre en tapant « %s »", async (typed) => {
    served(library);
    const { user, getByRole, titles } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), typed);

    expect(titles()).toEqual(["Échauffement"]);
  });

  it("demande au serveur les exercices du tag choisi, et « Tous » retire le filtre", async () => {
    served(library);
    const { user, getByRole } = await setup();

    await user.click(getByRole("button", { name: "force" }));
    expect(useExercises).toHaveBeenLastCalledWith({ tag: "force" });

    await user.click(getByRole("button", { name: "library.filterAllTags" }));
    expect(useExercises).toHaveBeenLastCalledWith({});
  });

  it.each([
    ["aucun tag", []],
    ["tags pas encore chargés", undefined],
  ])("n'affiche pas de filtre de tags : %s", async (_case, tags) => {
    served(library, tags);
    const { queryByRole } = await setup();

    expect(queryByRole("button", { name: "library.filterAllTags" })).not.toBeInTheDocument();
  });

  // La même phrase que la composition : le coach reconnaît ce qu'il ajoute avant de l'ajouter.
  it("résume le dosage de chaque exercice, et tait celui d'un exercice sans bloc", async () => {
    served(library);
    const { getByRole } = await setup();

    expect(getByRole("button", { name: /^Tractions/ })).toHaveTextContent(
      "Tractionsexercise.dosage.series",
    );
    expect(getByRole("button", { name: /^Gainage/ }).textContent).toBe("Gainage");
    expect(getByRole("button", { name: /^Échauffement/ }).textContent).toBe("Échauffementmobilité");
  });

  it("remonte l'exercice choisi", async () => {
    served(library);
    const { user, getByRole, onPick } = await setup();

    await user.click(getByRole("button", { name: /^Tractions/ }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(library[1]);
  });

  // Ce que le bouton FAIT relève de #303 (il jette la séance en cours) : seule l'offre est figée ici.
  it("propose de créer l'exercice cherché quand la recherche ne trouve rien", async () => {
    served(library);
    const { user, getByRole, titles } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), "planche");

    expect(titles()).toEqual([]);
    expect(getByRole("button", { name: "library.noMatch.create" })).toBeInTheDocument();
  });

  // Une bibliothèque vide sans recherche n'appelle pas « créer l'exercice “” ».
  it("ne propose rien à créer sans recherche", async () => {
    served([]);
    const { queryByRole } = await setup();

    expect(queryByRole("button", { name: "library.noMatch.create" })).not.toBeInTheDocument();
  });
});
