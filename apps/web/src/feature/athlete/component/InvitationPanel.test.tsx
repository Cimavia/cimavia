import { type InvitationDto, InvitationStatus } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationPanel } from "@/feature/athlete/component/InvitationPanel";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/athlete/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    accountApi: {
      listInvitations: vi.fn(),
      createInvitation: vi.fn(),
      deleteInvitation: vi.fn(),
    },
    athleteKeys: shared.athleteKeys,
    invitationKeys: shared.invitationKeys,
  };
});

const { accountApi } = await import("@/feature/athlete/api");
const listInvitations = vi.mocked(accountApi.listInvitations);
const createInvitation = vi.mocked(accountApi.createInvitation);
const deleteInvitation = vi.mocked(accountApi.deleteInvitation);

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: "inv_1",
  code: "7QK4M2XZ9",
  email: "lea@exemple.fr",
  status: InvitationStatus.PENDING,
  expiresAt: "2026-09-12T09:00:00.000Z",
  createdAt: "2026-09-05T09:00:00.000Z",
  ...overrides,
});

const DECLINED = invitation({ id: "inv_2", status: InvitationStatus.DECLINED });

beforeEach(() => {
  listInvitations.mockResolvedValue([]);
  createInvitation.mockResolvedValue(invitation());
  deleteInvitation.mockResolvedValue(undefined);
});

const render = () => renderWithProviders(<InvitationPanel onClose={() => {}} />);

describe("InvitationPanel — les invitations refusées (#146)", () => {
  /**
   * Sans cette section, un refus n'était qu'une notification qui passe : l'invitation quittait
   * `PENDING`, disparaissait de la liste d'attente, et il ne restait au coach ni le nom de qui a
   * dit non, ni rien à faire.
   */
  it("montre qui a refusé, avec l'adresse plutôt que le code", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    await render();

    expect(await screen.findByText("athlete.invitation.declined")).toBeInTheDocument();
    // L'adresse EST l'information : le code, lui, est mort avec le refus.
    expect(screen.getByText("lea@exemple.fr")).toBeInTheDocument();
    expect(screen.queryByText("7QK4M2XZ9")).not.toBeInTheDocument();
  });

  // Une invitation en attente n'a rien à faire dans cette section, et réciproquement : ce sont
  // deux listes, pas deux tris d'une même liste.
  it("ne mélange pas les refusées et les invitations en attente", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    await render();

    await screen.findByText("7QK4M2XZ9");
    expect(screen.queryByText("athlete.invitation.declined")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "athlete.invitation.resend" })).toBeNull();
  });

  // Réémettre vise la MÊME adresse : c'est tout l'intérêt, ne pas la retaper.
  it("réémet vers l'adresse qui a refusé", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "athlete.invitation.resend" }));

    await waitFor(() => expect(createInvitation).toHaveBeenCalledWith({ email: "lea@exemple.fr" }));
  });

  it("n'efface la ligne qu'après confirmation", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "athlete.invitation.delete" }));
    expect(deleteInvitation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "athlete.invitation.deleteConfirm" }));
    await waitFor(() => expect(deleteInvitation).toHaveBeenCalledWith("inv_2"));
  });

  /**
   * `email` est nullable au DTO. Une invitation refusée en porte toujours une — le refus exige une
   * correspondance stricte — mais le type ne le dit pas, et la ligne doit rester lisible plutôt
   * que d'afficher un blanc (règle dure n°5). Réémettre disparaît alors : il n'y a pas d'adresse
   * à viser.
   */
  it("reste lisible sans adresse, et ne propose alors pas de réémettre", async () => {
    listInvitations.mockResolvedValue([invitation({ ...DECLINED, email: null })]);
    await render();

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "athlete.invitation.resend" })).toBeNull();
    expect(screen.getByRole("button", { name: "athlete.invitation.delete" })).toBeInTheDocument();
  });
});
