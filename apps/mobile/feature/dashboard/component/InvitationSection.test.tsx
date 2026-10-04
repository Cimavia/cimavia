import { ApiError, type InvitationDto, InvitationStatus, invitationKeys } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
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

function invitation(email: string | null, status: InvitationDto["status"]): InvitationDto {
  return {
    id: `inv-${email}`,
    code: "7QK4M2XZ9",
    email,
    status,
    expiresAt: "2026-10-30T08:00:00.000Z",
    createdAt: "2026-09-30T08:00:00.000Z",
  };
}

const ACTION = "athlete.invite.action";

function typeEmail(container: HTMLElement, value: string) {
  const input = container.querySelector("input");
  if (input == null) throw new Error("champ introuvable");
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  listInvitations.mockResolvedValue([]);
  createInvitation.mockResolvedValue(invitation("lea@exemple.fr", InvitationStatus.PENDING));
});

describe("InvitationSection — émettre (#390)", () => {
  /**
   * Le mobile n'émettait que des invitations GÉNÉRIQUES, inutilisables depuis #263. Sans adresse,
   * l'invitation n'apparaîtrait à personne : rien ne part tant que la saisie n'en est pas une.
   */
  it.each([
    ["vide", ""],
    ["blanche", "   "],
    ["incomplète", "lea@"],
  ])("n'émet rien pour une adresse %s", async (_case, value) => {
    const { container, findByText } = renderRn(<InvitationSection />);
    await findByText("athlete.invite.description");
    typeEmail(container, value);

    pressButton(container, ACTION);

    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("émet vers l'adresse nettoyée, relit la liste et vide le champ", async () => {
    const { container, queryClient } = renderRn(<InvitationSection />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const input = typeEmail(container, "  lea@exemple.fr ");

    pressButton(container, ACTION);

    await waitFor(() => expect(createInvitation).toHaveBeenCalledWith({ email: "lea@exemple.fr" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: invitationKeys.all }));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("ferme le bouton et fige la saisie pendant l'émission", async () => {
    createInvitation.mockReturnValue(new Promise(() => undefined));
    const { container, findByText } = renderRn(<InvitationSection />);
    const input = typeEmail(container, "lea@exemple.fr");

    pressButton(container, ACTION);

    expect(await findByText("athlete.invite.creating")).toBeTruthy();
    pressButton(container, "athlete.invite.creating");
    expect(createInvitation).toHaveBeenCalledOnce();
    expect(input.readOnly).toBe(true);
  });

  /** Le mobile n'a pas de toasts : l'échec se dit sur place, et l'adresse reste à corriger. */
  it.each([
    ["tel que l'API l'a formulé", new ApiError(400, "Adresse refusée", null), "Adresse refusée"],
    ["par le message générique sans formulation", new Error("réseau"), "athlete.invite.error"],
  ])("dit l'échec de l'émission %s", async (_case, failure, message) => {
    createInvitation.mockRejectedValue(failure);
    const { container, findByText } = renderRn(<InvitationSection />);
    const input = typeEmail(container, "lea@exemple.fr");

    pressButton(container, ACTION);

    expect(await findByText(message)).toBeTruthy();
    expect(input.value).toBe("lea@exemple.fr");
  });
});

describe("InvitationSection — les invitations en attente", () => {
  it("ne montre aucune liste tant que rien n'attend", async () => {
    const { findByText, queryByText } = renderRn(<InvitationSection />);

    expect(await findByText("athlete.invite.description")).toBeTruthy();
    expect(queryByText("athlete.invite.pending")).toBeNull();
  });

  // La liste du web, pour l'attente seule : l'adresse dit à qui l'invitation apparaîtra.
  it("liste les invitations en attente par leur adresse, et plus de code", async () => {
    listInvitations.mockResolvedValue([
      invitation("pris@exemple.fr", InvitationStatus.ACCEPTED),
      invitation("lea@exemple.fr", InvitationStatus.PENDING),
      invitation("tom@exemple.fr", InvitationStatus.PENDING),
    ]);
    const { findByText, getByText, queryByText } = renderRn(<InvitationSection />);

    expect(await findByText("lea@exemple.fr")).toBeTruthy();
    expect(getByText("tom@exemple.fr")).toBeTruthy();
    expect(queryByText("pris@exemple.fr")).toBeNull();
    expect(queryByText("7QK4M2XZ9")).toBeNull();
  });

  // Une ancienne invitation sans adresse reste lisible : « — » plutôt qu'un blanc (règle n°5).
  it("rend « — » pour une invitation sans adresse", async () => {
    listInvitations.mockResolvedValue([invitation(null, InvitationStatus.PENDING)]);
    const { findByText } = renderRn(<InvitationSection />);

    expect(await findByText("—")).toBeTruthy();
  });
});
