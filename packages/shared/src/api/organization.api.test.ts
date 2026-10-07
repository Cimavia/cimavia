import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./client";
import {
  acceptOrganizationInvitationMutation,
  createOrganizationApi,
  organizationKeys,
} from "./organization.api";

// Client factice : on vérifie le CONTRAT — quel verbe sur quel chemin, avec quel corps.
function spyClient() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record =
    (method: string) =>
    <T>(path: string, body?: unknown) => {
      calls.push({ method, path, body });
      return Promise.resolve(undefined as T);
    };
  const api: ApiClient = {
    get: record("GET"),
    post: record("POST"),
    patch: record("PATCH"),
    put: record("PUT"),
    delete: record("DELETE"),
  };
  return { api, calls };
}

describe("createOrganizationApi", () => {
  it.each([
    ["listCoaches", "GET", "/organization/coaches"],
    ["listAthletes", "GET", "/organization/athletes"],
    ["myInvitations", "GET", "/organization-invitations/for-me"],
  ] as const)("%s lit %s %s", async (name, method, path) => {
    const { api, calls } = spyClient();
    await createOrganizationApi(api)[name]();

    expect(calls).toEqual([{ method, path, body: undefined }]);
  });

  // Une liste par rôle (#602) : la page Coachs ne montre pas les invitations d'athlètes.
  it("lit les invitations d'un seul rôle", async () => {
    const { api, calls } = spyClient();
    await createOrganizationApi(api).listInvitations("ATHLETE");

    expect(calls).toEqual([
      { method: "GET", path: "/organization/invitations?role=ATHLETE", body: undefined },
    ]);
  });

  it.each([
    ["inviteCoach", "COACH"],
    ["inviteAthlete", "ATHLETE"],
  ] as const)("%s invite une adresse en %s, sous le préfixe de l'entreprise", async (name, role) => {
    const { api, calls } = spyClient();
    await createOrganizationApi(api)[name]({ email: "julie@example.com" });

    expect(calls).toEqual([
      {
        method: "POST",
        path: "/organization/invitations",
        body: { email: "julie@example.com", role },
      },
    ]);
  });

  it.each([
    ["revokeInvitation", "POST", "/organization/invitations/inv_1/revoke"],
    ["deleteInvitation", "DELETE", "/organization/invitations/inv_1"],
    ["acceptInvitation", "POST", "/organization-invitations/inv_1/accept"],
    ["declineInvitation", "POST", "/organization-invitations/inv_1/decline"],
  ] as const)("%s vise %s %s", async (name, method, path) => {
    const { api, calls } = spyClient();
    await createOrganizationApi(api)[name]("inv_1");

    expect(calls).toEqual([{ method, path, body: undefined }]);
  });
});

describe("organizationKeys", () => {
  // Une racine commune : refuser périme d'un geste la liste du Coach et celle de l'entreprise.
  it("range toutes les listes sous la même racine", () => {
    for (const key of [
      organizationKeys.coaches(),
      organizationKeys.athletes(),
      organizationKeys.invitations("COACH"),
      organizationKeys.invitations("ATHLETE"),
      organizationKeys.forMe(),
    ]) {
      expect(key.slice(0, 1)).toEqual(organizationKeys.all);
    }
  });
});

describe("acceptOrganizationInvitationMutation", () => {
  it("désigne l'invitation par son id, puis périme tout le cache", async () => {
    const cache = { invalidateQueries: vi.fn() };
    const api = { acceptInvitation: vi.fn().mockResolvedValue(undefined) };
    const mutation = acceptOrganizationInvitationMutation(cache, api);

    await mutation.mutationFn("inv_1");
    mutation.onSuccess();

    expect(api.acceptInvitation).toHaveBeenCalledWith("inv_1");
    expect(cache.invalidateQueries).toHaveBeenCalledWith();
  });
});
