import { type InvitationDto, InvitationStatus, invitationKeys } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { Share } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi } from "@/feature/athlete/api";
import { InvitationSection } from "@/feature/dashboard/component/InvitationSection";
import { pressButton, renderRn } from "@/test/render";

// Seuls les appels sont remplacés : les hooks et leurs clés de cache restent les VRAIS.
vi.mock("@/feature/athlete/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/athlete/api")>();
  return {
    ...original,
    accountApi: { ...original.accountApi, listInvitations: vi.fn(), createInvitation: vi.fn() },
  };
});

const listInvitations = vi.mocked(accountApi.listInvitations);
const createInvitation = vi.mocked(accountApi.createInvitation);

function invitation(code: string, status: InvitationDto["status"]): InvitationDto {
  return {
    id: `inv-${code}`,
    code,
    email: null,
    status,
    expiresAt: "2026-10-30T08:00:00.000Z",
    createdAt: "2026-09-30T08:00:00.000Z",
  };
}

beforeEach(() => {
  listInvitations.mockResolvedValue([]);
  createInvitation.mockResolvedValue(invitation("NEW1", InvitationStatus.PENDING));
});

describe("InvitationSection", () => {
  it("explique le geste tant qu'aucun code n'attend, sans rien à partager", async () => {
    const { findByText, queryByText } = renderRn(<InvitationSection />);

    expect(await findByText("athlete.invite.description")).toBeTruthy();
    expect(queryByText("athlete.invite.share")).toBeNull();
  });

  /** L'API rend les plus récentes d'abord : le code montré est le premier qui attend encore. */
  it("montre le plus récent code encore en attente", async () => {
    listInvitations.mockResolvedValue([
      invitation("USED", InvitationStatus.ACCEPTED),
      invitation("ABCD", InvitationStatus.PENDING),
      invitation("OLD1", InvitationStatus.PENDING),
    ]);
    const { findByText, queryByText } = renderRn(<InvitationSection />);

    expect(await findByText("ABCD")).toBeTruthy();
    expect(queryByText("USED")).toBeNull();
    expect(queryByText("OLD1")).toBeNull();
  });

  it("partage le code en attente", async () => {
    const share = vi.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    listInvitations.mockResolvedValue([invitation("ABCD", InvitationStatus.PENDING)]);
    const { container, findByText } = renderRn(<InvitationSection />);
    await findByText("ABCD");

    pressButton(container, "athlete.invite.share");

    expect(share).toHaveBeenCalledWith({ message: "athlete.invite.message" });
  });

  /** Corps vide : un code générique, que l'athlète saisit de vive voix. */
  it("émet un code générique, puis relit la liste", async () => {
    const { container, queryClient } = renderRn(<InvitationSection />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    pressButton(container, "athlete.invite.action");

    await waitFor(() => expect(createInvitation).toHaveBeenCalledWith({}));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: invitationKeys.all }));
  });

  it("ferme le bouton pendant l'émission", async () => {
    createInvitation.mockReturnValue(new Promise(() => undefined));
    const { container, findByText } = renderRn(<InvitationSection />);

    pressButton(container, "athlete.invite.action");

    expect(await findByText("athlete.invite.creating")).toBeTruthy();
    pressButton(container, "athlete.invite.creating");
    expect(createInvitation).toHaveBeenCalledOnce();
  });

  it("dit l'échec de l'émission", async () => {
    createInvitation.mockRejectedValue(new Error("boom"));
    const { container, findByText } = renderRn(<InvitationSection />);

    pressButton(container, "athlete.invite.action");

    expect(await findByText("athlete.invite.error")).toBeTruthy();
  });
});
