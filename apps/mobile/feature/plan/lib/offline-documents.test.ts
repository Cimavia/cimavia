import {
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  myPlanKeys,
  type PlanDto,
  PlanStatus,
  PlanWeekType,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  SIGNED_URL_TTL_SECONDS,
} from "@cmv/shared";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheDocument = vi.fn(async () => true);
const localDocumentUri = vi.fn<(planId: string, document: ExerciseDocumentDto) => string | null>(
  () => null,
);
const purgePlansExcept = vi.fn();
let generation = 0;
vi.mock("@/shared/lib/document-cache", () => ({
  cacheDocument: (...args: unknown[]) => cacheDocument(...(args as [])),
  localDocumentUri: (planId: string, document: ExerciseDocumentDto) =>
    localDocumentUri(planId, document),
  purgePlansExcept: (ids: readonly string[]) => purgePlansExcept(ids),
  storeGeneration: () => generation,
}));

const fetchSession = vi.fn<(id: string) => Promise<ScheduledSessionDto>>();
vi.mock("@/feature/plan/api", () => ({
  athletePlanApi: { session: (id: string) => fetchSession(id) },
  myPlanKeys: {},
}));

const { offlineSignature, syncOfflineDocuments } = await import("./offline-documents");

const EDITED_AT = "2026-08-10T00:00:00.000Z";

function document(overrides: Partial<ExerciseDocumentDto> = {}): ExerciseDocumentDto {
  return {
    id: "doc-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
    url: "https://storage.test/signed",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function session(
  id: string,
  documents: ExerciseDocumentDto[],
  updatedAt = EDITED_AT,
): ScheduledSessionDto {
  return {
    id,
    planId: "plan-1",
    planWeekId: "week-1",
    sourceSessionId: null,
    title: "Force haut du corps",
    notes: null,
    scheduledDate: "2026-08-18",
    position: 0,
    status: ScheduledSessionStatus.PLANNED,
    exerciseCount: 1,
    updatedAt,
    exercises: [
      {
        id: "ex-1",
        sourceExerciseId: null,
        title: "Tractions",
        description: null,
        instructions: null,
        tracking: null,
        tags: [],
        note: null,
        blocks: [],
        customMetrics: [],
        baseline: [],
        adjustments: [],
        position: 0,
        documents,
      },
    ],
  };
}

function plan(id: string, sessionIds: readonly string[], sessionUpdatedAt = EDITED_AT): PlanDto {
  return {
    id,
    coachId: "coach-1",
    athleteId: "athlete-1",
    athleteName: "Ada",
    athleteEmail: "ada@test.fr",
    title: "Cycle force",
    description: null,
    startDate: "2026-08-17",
    status: PlanStatus.PUBLISHED,
    publishedAt: "2026-08-10T00:00:00.000Z",
    weekCount: 1,
    sessionCount: sessionIds.length,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    weeks: [
      {
        id: "week-1",
        weekNumber: 1,
        type: PlanWeekType.TRAINING,
        note: null,
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        sessions: sessionIds.map((sessionId, index) => ({
          id: sessionId,
          planId: id,
          planWeekId: "week-1",
          sourceSessionId: null,
          title: `Séance ${index + 1}`,
          notes: null,
          scheduledDate: "2026-08-18",
          position: index,
          status: ScheduledSessionStatus.PLANNED,
          exerciseCount: 1,
          updatedAt: sessionUpdatedAt,
        })),
      },
    ],
  };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  generation = 0;
  localDocumentUri.mockReturnValue(null);
  cacheDocument.mockResolvedValue(true);
});

describe("syncOfflineDocuments", () => {
  it("ne garde sur l'appareil que les cycles encore visibles", async () => {
    fetchSession.mockResolvedValue(session("s-1", []));

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"]), plan("plan-2", [])]);

    expect(purgePlansExcept).toHaveBeenCalledWith(["plan-1", "plan-2"]);
  });

  /**
   * La purge précède le téléchargement : elle rend la place des cycles finis avant qu'on demande
   * celle des nouveaux.
   */
  it("purge avant de descendre quoi que ce soit", async () => {
    const order: string[] = [];
    purgePlansExcept.mockImplementation(() => order.push("purge"));
    cacheDocument.mockImplementation(async () => {
      order.push("download");
      return true;
    });
    fetchSession.mockResolvedValue(session("s-1", [document()]));

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])]);

    expect(order).toEqual(["purge", "download"]);
  });

  /**
   * Le déroulé de CHAQUE séance entre au cache, y compris celles que l'athlète n'a jamais
   * ouvertes : c'est la moitié de la lecture hors-ligne que rien ne préchargeait.
   */
  it("met au cache le déroulé de chaque séance des cycles visibles", async () => {
    const client = newQueryClient();
    fetchSession.mockImplementation(async (id) => session(id, []));

    await syncOfflineDocuments(client, [plan("plan-1", ["s-1", "s-2"])]);

    expect(fetchSession).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(myPlanKeys.session("s-1"))).toBeTruthy();
    expect(client.getQueryData(myPlanKeys.session("s-2"))).toBeTruthy();
  });

  it("descend les documents manquants de chaque séance", async () => {
    fetchSession.mockResolvedValue(session("s-1", [document({ id: "doc-a" })]));

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])]);

    expect(cacheDocument).toHaveBeenCalledWith("plan-1", expect.objectContaining({ id: "doc-a" }));
  });

  it("ne redescend pas un document déjà sur l'appareil", async () => {
    localDocumentUri.mockReturnValue("file:///documents/plan-documents/plan-1/doc-1.pdf");
    fetchSession.mockResolvedValue(session("s-1", [document()]));

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])]);

    expect(cacheDocument).not.toHaveBeenCalled();
  });

  /**
   * Une séance entièrement présente ne vaut pas une requête : rafraîchir ses URLs signées ne
   * servirait personne. C'est ce qui garde la passe quasi gratuite après la première.
   */
  it("ne recharge pas une séance dont tous les documents sont là", async () => {
    const client = newQueryClient();
    client.setQueryData(myPlanKeys.session("s-1"), session("s-1", [document()]));
    localDocumentUri.mockReturnValue("file:///documents/plan-documents/plan-1/doc-1.pdf");

    await syncOfflineDocuments(client, [plan("plan-1", ["s-1"])]);

    expect(fetchSession).not.toHaveBeenCalled();
  });

  /**
   * Le piège de #151, ici en téléchargement : `staleTime` vaut exactement le TTL de signature et
   * le cache est persisté une semaine. Une séance du cache dont l'URL a expiré doit être
   * RECHARGÉE avant qu'on tire ses documents, sinon le téléchargement part vers un 403.
   */
  it("rafraîchit une séance du cache dont les urls signées ont expiré", async () => {
    const client = newQueryClient();
    client.setQueryData(myPlanKeys.session("s-1"), session("s-1", [document()]));
    const state = client.getQueryState(myPlanKeys.session("s-1"));
    if (state != null) state.dataUpdatedAt = Date.now() - (SIGNED_URL_TTL_SECONDS + 60) * 1000;
    fetchSession.mockResolvedValue(
      session("s-1", [document({ url: "https://storage.test/neuf" })]),
    );

    await syncOfflineDocuments(client, [plan("plan-1", ["s-1"])]);

    expect(fetchSession).toHaveBeenCalledWith("s-1");
    expect(cacheDocument).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ url: "https://storage.test/neuf" }),
    );
  });

  /**
   * Réseau tombé au milieu d'une passe de quarante séances : les suivantes doivent quand même
   * être tentées. Une passe partielle vaut mieux qu'une passe abandonnée.
   */
  it("poursuit la passe quand une séance ne se charge pas", async () => {
    fetchSession
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValue(session("s-2", [document({ id: "doc-b" })]));

    const complete = await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1", "s-2"])]);

    expect(complete).toBe(false);
    expect(cacheDocument).toHaveBeenCalledTimes(1);
    expect(cacheDocument).toHaveBeenCalledWith("plan-1", expect.objectContaining({ id: "doc-b" }));
  });

  /**
   * Un lien externe n'a pas d'octets à descendre. Le compter comme « manquant » rechargeait la
   * séance à chaque passe — et une passe qui doit être complète pour être retenue ne l'aurait
   * jamais été.
   */
  it("ne compte pas un lien externe parmi les documents manquants", async () => {
    const client = newQueryClient();
    const link = document({ type: DocumentType.LINK, url: "https://youtu.be/x", mimeType: null });
    client.setQueryData(myPlanKeys.session("s-1"), session("s-1", [link]));

    const complete = await syncOfflineDocuments(client, [plan("plan-1", ["s-1"])]);

    expect(complete).toBe(true);
    expect(fetchSession).not.toHaveBeenCalled();
    expect(cacheDocument).not.toHaveBeenCalled();
  });

  it("ne fait rien de plus qu'une purge sans aucun cycle visible", async () => {
    await syncOfflineDocuments(newQueryClient(), []);

    expect(purgePlansExcept).toHaveBeenCalledWith([]);
    expect(fetchSession).not.toHaveBeenCalled();
    expect(cacheDocument).not.toHaveBeenCalled();
  });
});

describe("syncOfflineDocuments — changement de compte en cours de passe", () => {
  /**
   * Une passe dure : quarante séances tirées l'une après l'autre. L'athlète peut se déconnecter au
   * milieu, et rien ne l'arrêtait — elle écrivait alors les séances du compte QUITTÉ dans le cache
   * que la déconnexion venait de vider. La purge totale change l'époque du magasin ; la passe le
   * voit à l'itération suivante et s'arrête.
   */
  it("abandonne dès que le magasin change d'époque", async () => {
    fetchSession.mockImplementation(async (id) => {
      generation += 1;
      return session(id, []);
    });

    const complete = await syncOfflineDocuments(newQueryClient(), [
      plan("plan-1", ["s-1", "s-2", "s-3"]),
    ]);

    expect(complete).toBe(false);
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("ne descend plus rien après un changement d'époque", async () => {
    fetchSession.mockImplementation(async (id) => {
      generation += 1;
      return session(id, [document()]);
    });

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])]);

    expect(cacheDocument).not.toHaveBeenCalled();
  });
});

describe("syncOfflineDocuments — séance retouchée depuis le cache (#307)", () => {
  const EDITED_LATER = "2026-08-12T18:00:00.000Z";

  /**
   * Le scénario de l'issue : le coach change les charges, les documents connus sont déjà là. Le
   * court-circuit « tout est sur l'appareil » servait l'ancien déroulé, quel que soit son âge.
   */
  it("recharge une séance retouchée même quand tous ses documents sont là", async () => {
    const client = newQueryClient();
    client.setQueryData(myPlanKeys.session("s-1"), session("s-1", [document()]));
    localDocumentUri.mockReturnValue("file:///documents/plan-documents/plan-1/doc-1.pdf");
    fetchSession.mockResolvedValue(session("s-1", [document()], EDITED_LATER));

    await syncOfflineDocuments(client, [plan("plan-1", ["s-1"], EDITED_LATER)]);

    expect(fetchSession).toHaveBeenCalledWith("s-1");
    expect(client.getQueryData<ScheduledSessionDto>(myPlanKeys.session("s-1"))?.updatedAt).toBe(
      EDITED_LATER,
    );
  });

  /**
   * Des URLs encore signables ne disent rien de la version : une séance chargée il y a deux
   * minutes, retouchée depuis, ferait descendre les documents d'avant — et pas le PDF ajouté.
   */
  it("recharge une séance retouchée même quand ses urls sont encore valides", async () => {
    const client = newQueryClient();
    client.setQueryData(myPlanKeys.session("s-1"), session("s-1", []));
    fetchSession.mockResolvedValue(session("s-1", [document({ id: "doc-neuf" })], EDITED_LATER));

    await syncOfflineDocuments(client, [plan("plan-1", ["s-1"], EDITED_LATER)]);

    expect(cacheDocument).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ id: "doc-neuf" }),
    );
  });
});

describe("syncOfflineDocuments — complétude (#307)", () => {
  it("se dit complète quand chaque séance est chargée et chaque document descendu", async () => {
    fetchSession.mockResolvedValue(session("s-1", [document()]));

    expect(await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])])).toBe(true);
  });

  /** Réseau coupé en plein téléchargement : la passe continue, mais elle devra être reprise. */
  it("se dit incomplète quand un document ne descend pas", async () => {
    cacheDocument.mockResolvedValueOnce(false);
    fetchSession.mockImplementation(async (id) => session(id, [document({ id: `doc-${id}` })]));

    const complete = await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1", "s-2"])]);

    expect(complete).toBe(false);
    expect(cacheDocument).toHaveBeenCalledTimes(2);
  });

  it("se dit incomplète quand l'époque change en plein téléchargement", async () => {
    fetchSession.mockResolvedValue(session("s-1", [document({ id: "a" }), document({ id: "b" })]));
    cacheDocument.mockImplementation(async () => {
      generation += 1;
      return true;
    });

    expect(await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1"])])).toBe(false);
    expect(cacheDocument).toHaveBeenCalledTimes(1);
  });
});

describe("offlineSignature", () => {
  it("reste la même pour des cycles identiques", () => {
    expect(offlineSignature([plan("plan-1", ["s-1"])])).toBe(
      offlineSignature([plan("plan-1", ["s-1"])]),
    );
  });

  it("change quand une séance est retouchée, le cycle restant le même", () => {
    expect(offlineSignature([plan("plan-1", ["s-1"], "2026-08-12T18:00:00.000Z")])).not.toBe(
      offlineSignature([plan("plan-1", ["s-1"])]),
    );
  });

  it("change quand une séance est ajoutée", () => {
    expect(offlineSignature([plan("plan-1", ["s-1", "s-2"])])).not.toBe(
      offlineSignature([plan("plan-1", ["s-1"])]),
    );
  });

  it("est vide sans aucun cycle", () => {
    expect(offlineSignature([])).toBe("");
  });
});
