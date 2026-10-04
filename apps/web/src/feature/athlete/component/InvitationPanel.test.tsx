import { ApiError, type InvitationDto, InvitationStatus, required } from "@cmv/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
      revokeInvitation: vi.fn(),
    },
    athleteKeys: shared.athleteKeys,
    invitationKeys: shared.invitationKeys,
  };
});

const { accountApi } = await import("@/feature/athlete/api");
const listInvitations = vi.mocked(accountApi.listInvitations);
const createInvitation = vi.mocked(accountApi.createInvitation);
const deleteInvitation = vi.mocked(accountApi.deleteInvitation);
const revokeInvitation = vi.mocked(accountApi.revokeInvitation);

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: "inv_1",
  email: "lea@exemple.fr",
  status: InvitationStatus.PENDING,
  expiresAt: "2026-09-12T09:00:00.000Z",
  createdAt: "2026-09-05T09:00:00.000Z",
  ...overrides,
});

const DECLINED = invitation({ id: "inv_2", status: InvitationStatus.DECLINED });

beforeEach(() => {
  vi.clearAllMocks();
  listInvitations.mockResolvedValue([]);
  createInvitation.mockResolvedValue(invitation());
  deleteInvitation.mockResolvedValue(undefined);
  revokeInvitation.mockResolvedValue(undefined);
});

const render = () => renderWithProviders(<InvitationPanel onClose={() => {}} />);

describe("InvitationPanel — les invitations refusées (#146)", () => {
  /**
   * Sans cette section, un refus n'était qu'une notification qui passe : l'invitation quittait
   * `PENDING`, disparaissait de la liste d'attente, et il ne restait au coach ni le nom de qui a
   * dit non, ni rien à faire.
   */
  it("montre qui a refusé, par son adresse", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    await render();

    expect(await screen.findByText("athlete.invitation.declined")).toBeInTheDocument();
    // L'adresse EST l'information : c'est elle qui a dit non.
    expect(screen.getByText("lea@exemple.fr")).toBeInTheDocument();
  });

  // Une invitation en attente n'a rien à faire dans cette section, et réciproquement : ce sont
  // deux listes, pas deux tris d'une même liste.
  it("ne mélange pas les refusées et les invitations en attente", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    await render();

    await screen.findByText("lea@exemple.fr");
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
});

describe("InvitationPanel — retirer une invitation en attente (#524)", () => {
  const REVOKE = "athlete.invitation.revoke";

  /**
   * Armé en deux temps, comme le refus côté athlète : le retrait est sans retour, l'invitation ne
   * se rétablit pas. Un seul clic ne doit rien envoyer.
   */
  it("ne retire qu'après confirmation, puis relit la liste et le dit", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: REVOKE }));
    expect(revokeInvitation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "athlete.invitation.revokeConfirm" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("inv_1"));
    expect(await screen.findByText("athlete.toast.invitationRevoked")).toBeInTheDocument();
    await waitFor(() => expect(listInvitations).toHaveBeenCalledTimes(2));
  });

  // Déjà acceptée ou refusée entre-temps : le 409 du serveur dit pourquoi, mieux qu'un libellé.
  it("dit le refus du serveur", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    revokeInvitation.mockRejectedValue(
      new ApiError(409, "Seule une invitation en attente peut être retirée", null),
    );
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: REVOKE }));
    await user.click(screen.getByRole("button", { name: "athlete.invitation.revokeConfirm" }));

    expect(
      await screen.findByText("Seule une invitation en attente peut être retirée"),
    ).toBeInTheDocument();
  });

  // Une invitation refusée n'a plus rien à retirer : elle s'efface, c'est un autre geste.
  it("ne propose pas de retirer une invitation refusée", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    render();

    expect(await screen.findByText("athlete.invitation.declined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: REVOKE })).toBeNull();
  });
});

describe("InvitationPanel — émettre une invitation", () => {
  const EMAIL = "athlete.invitation.emailLabel";
  const SUBMIT = "athlete.invitation.submit";

  /**
   * Plus d'invitation générique (#390) : sans adresse, il n'y a personne à qui l'invitation
   * apparaîtrait. Le bouton reste fermé tant que la saisie n'en est pas une — l'API ne voit jamais
   * partir ce qu'elle refuserait d'un message de validation brut.
   */
  it.each([
    ["vide", ""],
    ["blanche", "   "],
    ["incomplète", "lea@"],
  ])("n'émet rien pour une adresse %s", async (_case, typed) => {
    const { user } = render();

    const field = screen.getByLabelText(EMAIL) as HTMLInputElement;
    if (typed !== "") await user.type(field, typed);
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
    await user.type(field, "{Enter}");
    // Le bouton fermé n'est pas le seul rempart : un formulaire soumis quand même n'envoie rien.
    fireEvent.submit(required(field.form, "formulaire d'invitation"));

    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("émet vers l'adresse nettoyée, puis vide le champ", async () => {
    const { user } = render();
    const field = screen.getByLabelText(EMAIL) as HTMLInputElement;

    await user.type(field, "  lea@exemple.fr ");
    await user.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(createInvitation).toHaveBeenCalledWith({ email: "lea@exemple.fr" }));
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("dit l'émission en cours, bouton éteint", async () => {
    createInvitation.mockReturnValue(new Promise(() => {}));
    const { user } = render();

    await user.type(screen.getByLabelText(EMAIL), "lea@exemple.fr");
    await user.click(screen.getByRole("button", { name: SUBMIT }));

    expect(
      await screen.findByRole("button", { name: "athlete.invitation.submitting" }),
    ).toBeDisabled();
  });
});

describe("InvitationPanel — les invitations en attente", () => {
  it("dit qu'aucune n'attend", async () => {
    render();

    expect(await screen.findByText("athlete.invitation.emptyPending")).toBeInTheDocument();
  });

  // L'adresse dit à qui l'invitation apparaîtra : c'est tout ce qu'il y a à en montrer.
  it("montre l'adresse de chaque invitation", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    render();

    expect(await screen.findByText("lea@exemple.fr")).toBeInTheDocument();
  });

  it("se referme par son pied", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<InvitationPanel onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "common.close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
