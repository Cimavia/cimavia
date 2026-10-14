import {
  BlockType,
  type CoachOrganizationDto,
  type ExerciseDto,
  LibraryScope,
  MetricSource,
  MetricValueType,
  MyAccessLevel,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { renderInRoute } from "../../../../test/render";
import { LibraryPicker } from "./LibraryPicker";

vi.mock("@/feature/library/hook/useExercises", () => ({
  useExercises: vi.fn(),
  useExerciseTags: vi.fn(),
}));
vi.mock("@/feature/library/hook/useMyOrganizations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/hook/useMyOrganizations")>()),
  useMyOrganizations: vi.fn(),
}));

const F: CoachOrganizationDto = { id: "org-f", name: "F", coaches: [] };

/** Les entreprises du Coach : aucune par défaut, `undefined` = pas lues. */
function organizations(data: CoachOrganizationDto[] | undefined) {
  vi.mocked(useMyOrganizations).mockReturnValue({ data } as unknown as ReturnType<
    typeof useMyOrganizations
  >);
}

const SEARCH = "library.searchLabel";

const exercise = (id: string, title: string, overrides: Partial<ExerciseDto> = {}) =>
  ({
    id,
    title,
    tags: [],
    blocks: [],
    customMetrics: [],
    owner: { id: "coach-c", name: "C" },
    myAccess: { level: MyAccessLevel.OWNER, via: null },
    ...overrides,
  }) as unknown as ExerciseDto;

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

async function setup({ isSaving = false } = {}) {
  const onPick = vi.fn();
  const onCreateMissing = vi.fn();
  const view = await renderInRoute(
    <LibraryPicker
      customMetrics={[]}
      onPick={onPick}
      onCreateMissing={onCreateMissing}
      isSaving={isSaving}
    />,
    { path: "/library/sessions/new" },
  );
  const titles = () =>
    view
      .queryAllByRole("button", { name: /^(Échauffement|Tractions|Gainage)/ })
      .map((button) => button.firstChild?.textContent);
  return { ...view, onPick, onCreateMissing, titles };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizations([]);
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

  // Le sélecteur ne quitte pas la séance lui-même (#303) : il remonte le titre, rogné, et reste.
  it("propose de créer l'exercice cherché quand la recherche ne trouve rien, et remonte son titre", async () => {
    served(library);
    const { user, getByRole, titles, onCreateMissing, router } = await setup();

    await user.type(getByRole("searchbox", { name: SEARCH }), "  planche ");
    expect(titles()).toEqual([]);
    await user.click(getByRole("button", { name: "library.noMatch.create" }));

    expect(onCreateMissing).toHaveBeenCalledExactlyOnceWith("planche");
    expect(router.state.location.pathname).toBe("/library/sessions/new");
  });

  // Un second clic pendant l'enregistrement créerait une seconde séance.
  it("ferme la création le temps d'un enregistrement", async () => {
    served(library);
    const { user, getByRole } = await setup({ isSaving: true });

    await user.type(getByRole("searchbox", { name: SEARCH }), "planche");

    expect(getByRole("button", { name: "library.noMatch.create" })).toBeDisabled();
  });

  // Une bibliothèque vide sans recherche n'appelle pas « créer l'exercice “” ».
  it("ne propose rien à créer sans recherche, et dit la bibliothèque vide", async () => {
    served([]);
    const { queryByRole, getByText } = await setup();

    expect(queryByRole("button", { name: "library.noMatch.create" })).not.toBeInTheDocument();
    expect(getByText("library.empty.title")).toBeInTheDocument();
  });
});

describe("LibraryPicker — partage (#606, frame 8)", () => {
  const ofM = exercise("ex-m", "Gainage", {
    owner: { id: "coach-m", name: "M" },
    myAccess: { level: MyAccessLevel.READ, via: F },
  });

  it("sans entreprise : ni propriétaire, ni bascule", async () => {
    served(library);
    const { queryByText, queryByRole } = await setup();

    expect(queryByText("library.access.me")).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "library.picker.shared" })).not.toBeInTheDocument();
  });

  it("dit à qui est chaque exercice, et le droit qu'on a sur celui d'un autre", async () => {
    organizations([F]);
    served([exercise("ex-1", "Échauffement"), ofM]);
    const { getByRole } = await setup();

    expect(getByRole("button", { name: /^Échauffement/ })).toHaveTextContent("library.access.me");
    expect(getByRole("button", { name: /^Gainage/ })).toHaveTextContent("library.access.grant");
  });

  it("propose les deux provenances au départ, et demande celle qui reste", async () => {
    organizations([F]);
    served(library);
    const { user, getByRole } = await setup();

    // Les deux : la portée par défaut de l'API, qu'il est inutile d'écrire.
    expect(useExercises).toHaveBeenLastCalledWith({});
    await user.click(getByRole("button", { name: "library.picker.shared" }));

    expect(useExercises).toHaveBeenLastCalledWith({ scope: LibraryScope.MINE });
    expect(getByRole("button", { name: "library.scope.mine" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("garde le tag choisi en changeant de provenance", async () => {
    organizations([F]);
    served(library);
    const { user, getByRole } = await setup();

    await user.click(getByRole("button", { name: "force" }));
    await user.click(getByRole("button", { name: "library.scope.mine" }));

    expect(useExercises).toHaveBeenLastCalledWith({ tag: "force", scope: LibraryScope.SHARED });
    expect(getByRole("button", { name: "library.picker.shared" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("entreprises inconnues : le propriétaire se dit quand même, les bascules attendent", async () => {
    organizations(undefined);
    served([ofM]);
    const { getByRole, queryByRole } = await setup();

    expect(getByRole("button", { name: /^Gainage/ })).toHaveTextContent("library.access.grant");
    expect(queryByRole("button", { name: "library.picker.shared" })).not.toBeInTheDocument();
    expect(useExercises).toHaveBeenLastCalledWith({});
  });

  it("parmi les seuls partagés, une recherche vaine ne propose pas de créer (frame 4)", async () => {
    organizations([F]);
    served([]);
    const { user, getByRole, getByLabelText, getByText, queryByRole } = await setup();

    await user.click(getByRole("button", { name: "library.scope.mine" }));
    expect(getByText("library.access.exercise.sharedEmpty")).toBeInTheDocument();
    await user.type(getByLabelText(SEARCH), "Projet");

    expect(getByText("library.noMatch.title")).toBeInTheDocument();
    expect(queryByRole("button", { name: "library.noMatch.create" })).not.toBeInTheDocument();
  });

  it("un tag sans exercice le dit, plutôt qu'une grille vide", async () => {
    served([]);
    const { user, getByRole, getByText } = await setup();

    await user.click(getByRole("button", { name: "force" }));

    expect(getByText("library.noFilterMatch")).toBeInTheDocument();
  });

  // Le résumé dit la valeur ET son unité, que seule la définition du propriétaire connaît.
  it("résume l'exercice d'un autre avec les métriques de son propriétaire", async () => {
    organizations([F]);
    served([
      exercise("ex-m", "Gainage", {
        blocks: [
          {
            id: "b-m",
            label: null,
            structure: { type: BlockType.FREE },
            metrics: [
              {
                id: "c-m",
                source: MetricSource.CUSTOM,
                customMetricId: "cm-m",
                label: null,
                collapsed: true,
              },
            ],
            rows: [{ id: "r-m", values: { "c-m": 12 } }],
          },
        ] as unknown as ExerciseDto["blocks"],
        customMetrics: [
          {
            id: "cm-m",
            label: "Prises",
            unit: "prises",
            valueType: MetricValueType.NUMBER,
            scale: null,
          },
        ],
      }),
    ]);
    const { getByRole } = await setup();

    expect(getByRole("button", { name: /^Gainage/ })).toHaveTextContent("12 prises");
  });
});
