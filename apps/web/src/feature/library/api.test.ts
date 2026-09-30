import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachDocument,
  createCustomMetric,
  createExercise,
  createSession,
  deleteCustomMetric,
  deleteDocument,
  deleteExercise,
  deleteSession,
  exerciseKeys,
  getExercise,
  getSession,
  listCustomMetrics,
  listExercises,
  listExerciseTags,
  listSessions,
  reloadSessionExercise,
  requestUploadUrl,
  updateCustomMetric,
  updateExercise,
  updateSession,
} from "./api";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Le client HTTP est la frontière : ce qui part vers l'API (verbe, chemin, corps) est le contrat
// de ce module, et c'est tout ce qu'il décide.
vi.mock("@/shared/lib/api", () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(apiMock)) fn.mockResolvedValue("réponse");
});

describe("listExercises", () => {
  it("n'ajoute aucune requête quand aucun filtre n'est posé", async () => {
    await listExercises({});

    expect(apiMock.get).toHaveBeenCalledWith("/exercises");
  });

  // Une chaîne vide est un filtre effacé, pas une recherche de « » : l'API recevrait `?search=`.
  it("ignore un filtre vide", async () => {
    await listExercises({ tag: "", search: "" });

    expect(apiMock.get).toHaveBeenCalledWith("/exercises");
  });

  it("passe le tag seul", async () => {
    await listExercises({ tag: "force" });

    expect(apiMock.get).toHaveBeenCalledWith("/exercises?tag=force");
  });

  it("passe la recherche seule, encodée", async () => {
    await listExercises({ search: "tirage à 1 bras" });

    expect(apiMock.get).toHaveBeenCalledWith("/exercises?search=tirage+%C3%A0+1+bras");
  });

  it("combine tag et recherche", async () => {
    await listExercises({ tag: "force", search: "poutre" });

    expect(apiMock.get).toHaveBeenCalledWith("/exercises?tag=force&search=poutre");
  });
});

describe("exerciseKeys", () => {
  // Deux filtres qui partageraient une entrée de cache afficheraient la liste de l'autre.
  it("range deux filtres différents sous deux clés différentes", () => {
    expect(exerciseKeys.list({ tag: "a" })).not.toEqual(exerciseKeys.list({ tag: "b" }));
  });

  it("garde toutes les clés sous la racine commune, pour une invalidation d'un seul geste", () => {
    for (const key of [exerciseKeys.list({}), exerciseKeys.detail("ex-1"), exerciseKeys.tags()]) {
      expect(key.slice(0, 1)).toEqual(exerciseKeys.all);
    }
  });
});

/**
 * Une ligne par fonction : le verbe, le chemin et le corps attendus. Un verbe changé (PATCH au lieu
 * de PUT sur la séance, qui est un remplacement intégral) passerait `tsc` sans bruit.
 */
describe.each([
  ["listExerciseTags", () => listExerciseTags(), "get", ["/exercises/tags"]],
  ["getExercise", () => getExercise("ex-1"), "get", ["/exercises/ex-1"]],
  [
    "createExercise",
    () => createExercise({ title: "Tractions" } as never),
    "post",
    ["/exercises", { title: "Tractions" }],
  ],
  [
    "updateExercise",
    () => updateExercise("ex-1", { title: "Tractions" } as never),
    "patch",
    ["/exercises/ex-1", { title: "Tractions" }],
  ],
  ["deleteExercise", () => deleteExercise("ex-1"), "delete", ["/exercises/ex-1"]],
  [
    "requestUploadUrl",
    () => requestUploadUrl("ex-1", { contentType: "image/png" } as never),
    "post",
    ["/exercises/ex-1/documents/upload-url", { contentType: "image/png" }],
  ],
  [
    "attachDocument",
    () => attachDocument("ex-1", { kind: "LINK" } as never),
    "post",
    ["/exercises/ex-1/documents", { kind: "LINK" }],
  ],
  [
    "deleteDocument",
    () => deleteDocument("ex-1", "doc-1"),
    "delete",
    ["/exercises/ex-1/documents/doc-1"],
  ],
  ["listCustomMetrics", () => listCustomMetrics(), "get", ["/custom-metrics"]],
  [
    "createCustomMetric",
    () => createCustomMetric({ label: "Prises" } as never),
    "post",
    ["/custom-metrics", { label: "Prises" }],
  ],
  [
    "updateCustomMetric",
    () => updateCustomMetric("m-1", { label: "Prises" } as never),
    "patch",
    ["/custom-metrics/m-1", { label: "Prises" }],
  ],
  ["deleteCustomMetric", () => deleteCustomMetric("m-1"), "delete", ["/custom-metrics/m-1"]],
  ["listSessions", () => listSessions(), "get", ["/sessions"]],
  ["getSession", () => getSession("s-1"), "get", ["/sessions/s-1"]],
  [
    "reloadSessionExercise",
    () => reloadSessionExercise("s-1", "se-1"),
    "post",
    ["/sessions/s-1/exercises/se-1/reload", {}],
  ],
  [
    "createSession",
    () => createSession({ title: "Force" } as never),
    "post",
    ["/sessions", { title: "Force" }],
  ],
  [
    "updateSession",
    () => updateSession("s-1", { title: "Force" } as never),
    "put",
    ["/sessions/s-1", { title: "Force" }],
  ],
  ["deleteSession", () => deleteSession("s-1"), "delete", ["/sessions/s-1"]],
] as const)("%s", (_name, call, verb, args) => {
  it(`part en ${verb.toUpperCase()} sur le bon chemin et rend la réponse de l'API`, async () => {
    await expect(call()).resolves.toBe("réponse");

    expect(apiMock[verb]).toHaveBeenCalledExactlyOnceWith(...args);
  });
});
