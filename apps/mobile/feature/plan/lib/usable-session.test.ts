import { myPlanKeys, type ScheduledSessionDto, SIGNED_URL_TTL_SECONDS } from "@cmv/shared";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchSession = vi.fn<(id: string) => Promise<ScheduledSessionDto>>();
vi.mock("@/feature/plan/api", () => ({
  athletePlanApi: { session: (id: string) => fetchSession(id) },
}));

const { usableSession } = await import("./usable-session");

const EDITED_AT = "2026-08-10T00:00:00.000Z";
const EDITED_LATER = "2026-08-12T18:00:00.000Z";

function session(updatedAt: string, title = "Force"): ScheduledSessionDto {
  return { id: "s-1", updatedAt, title } as unknown as ScheduledSessionDto;
}

function clientWith(cached: ScheduledSessionDto, receivedAgoSeconds = 0): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(myPlanKeys.session("s-1"), cached);
  const state = client.getQueryState(myPlanKeys.session("s-1"));
  if (state != null) state.dataUpdatedAt = Date.now() - receivedAgoSeconds * 1000;
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSession.mockResolvedValue(session(EDITED_LATER, "Force (ajustée)"));
});

describe("usableSession", () => {
  it("sert le cache à jour aux urls encore signables, sans requête", async () => {
    const client = clientWith(session(EDITED_AT));

    const result = await usableSession(client, "s-1", EDITED_AT);

    expect(result.title).toBe("Force");
    expect(fetchSession).not.toHaveBeenCalled();
  });

  it("recharge une séance dont le planning annonce une version plus récente", async () => {
    const client = clientWith(session(EDITED_AT));

    const result = await usableSession(client, "s-1", EDITED_LATER);

    expect(result.title).toBe("Force (ajustée)");
  });

  it("recharge une séance dont les urls ont expiré, même à jour", async () => {
    const client = clientWith(session(EDITED_AT), SIGNED_URL_TTL_SECONDS + 60);

    await usableSession(client, "s-1", EDITED_AT);

    expect(fetchSession).toHaveBeenCalledWith("s-1");
  });

  /** L'ouverture d'un document n'a que la séance affichée : elle ne demande que des urls vivantes. */
  it("ne compare aucune version quand l'appelant n'en connaît pas", async () => {
    const client = clientWith(session(EDITED_AT));

    await usableSession(client, "s-1");

    expect(fetchSession).not.toHaveBeenCalled();
  });

  it("charge une séance absente du cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    const result = await usableSession(client, "s-1", EDITED_LATER);

    expect(result.updatedAt).toBe(EDITED_LATER);
  });

  it("lève quand le rechargement échoue", async () => {
    fetchSession.mockRejectedValue(new Error("réseau"));
    const client = clientWith(session(EDITED_AT));

    await expect(usableSession(client, "s-1", EDITED_LATER)).rejects.toThrow("réseau");
  });
});
