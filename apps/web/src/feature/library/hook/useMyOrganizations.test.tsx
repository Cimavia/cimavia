import type { CoachOrganizationDto } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useMyOrganizations } from "./useMyOrganizations";

const { listMyOrganizations } = vi.hoisted(() => ({ listMyOrganizations: vi.fn() }));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  listMyOrganizations,
}));

describe("useMyOrganizations", () => {
  it("rend les entreprises du Coach, liste vide comprise", async () => {
    const organizations: CoachOrganizationDto[] = [{ id: "org-f", name: "F", coaches: [] }];
    listMyOrganizations.mockResolvedValueOnce(organizations);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useMyOrganizations(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(organizations));
  });
});
