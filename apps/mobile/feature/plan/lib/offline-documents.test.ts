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

const { syncOfflineDocuments } = await import("./offline-documents");

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

function session(id: string, documents: ExerciseDocumentDto[]): ScheduledSessionDto {
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

function plan(id: string, sessionIds: readonly string[]): PlanDto {
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

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1", "s-2"])]);

    expect(cacheDocument).toHaveBeenCalledTimes(1);
    expect(cacheDocument).toHaveBeenCalledWith("plan-1", expect.objectContaining({ id: "doc-b" }));
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

    await syncOfflineDocuments(newQueryClient(), [plan("plan-1", ["s-1", "s-2", "s-3"])]);

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
