import {
  ApiError,
  type InvitationDto,
  InvitationRole,
  InvitationStatus,
  type OrganizationCoachDto,
} from "@cmv/shared";
import { screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyCoachesScreen } from "@/feature/company/screen/CompanyCoachesScreen";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/company/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    organizationApi: {
      listCoaches: vi.fn(),
      listInvitations: vi.fn(),
      inviteCoach: vi.fn(),
      revokeInvitation: vi.fn(),
      deleteInvitation: vi.fn(),
    },
    organizationKeys: shared.organizationKeys,
  };
});

// Le panneau lit le nom de l'entreprise dans la session ; le client réel arme un temporisateur
// qui survit au jsdom (cf. `MyCoachesScreen.test`).
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "Fontainebleau Escalade" } } }) },
}));

// L'AppShell tire toute la navigation : seul compte ici ce que l'écran y pose.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    subtitle,
    actions,
    children,
  }: Readonly<{ title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }>) => (
    <main>
      <h1>{title}</h1>
      {subtitle == null ? null : <p data-testid="subtitle">{subtitle}</p>}
      {actions}
      {children}
    </main>
  ),
}));

const { organizationApi } = await import("@/feature/company/api");
const listCoaches = vi.mocked(organizationApi.listCoaches);
const listInvitations = vi.mocked(organizationApi.listInvitations);
const inviteCoach = vi.mocked(organizationApi.inviteCoach);
const revokeInvitation = vi.mocked(organizationApi.revokeInvitation);
const deleteInvitation = vi.mocked(organizationApi.deleteInvitation);

const CLAIRE: OrganizationCoachDto = {
  coachId: "u_claire",
  name: "Claire Dumas",
  email: "claire.dumas@mail.fr",
  joinedAt: "2026-03-12T09:00:00.000Z",
};

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: "inv_1",
  email: "julie.roche@mail.fr",
  role: InvitationRole.COACH,
  status: InvitationStatus.PENDING,
  expiresAt: "2026-10-16T09:00:00.000Z",
  createdAt: "2026-10-09T09:00:00.000Z",
  ...overrides,
});

const DECLINED = invitation({
  id: "inv_2",
  email: "paul@mail.fr",
  status: InvitationStatus.DECLINED,
});
const ACCEPTED = invitation({ id: "inv_3", status: InvitationStatus.ACCEPTED });

beforeEach(() => {
  vi.clearAllMocks();
  listCoaches.mockResolvedValue([]);
  listInvitations.mockResolvedValue([]);
  inviteCoach.mockResolvedValue(invitation());
  revokeInvitation.mockResolvedValue(undefined);
  deleteInvitation.mockResolvedValue(undefined);
});

const render = () => renderWithProviders(<CompanyCoachesScreen />);

describe("CompanyCoachesScreen — ce que la page montre", () => {
  // Frame 5 : ni membre ni invitation, l'écran invite à commencer.
  it("invite à ajouter un premier coach quand il n'y a rien", async () => {
    render();

    expect(await screen.findByText("company.coaches.first.title")).toBeInTheDocument();
    expect(screen.queryByText("company.invitations.pending")).toBeNull();
  });

  // Sans membre, une invitation en attente garde sa section : l'envoi ne doit pas sembler perdu.
  it("montre l'invitation en attente sous un tableau vide", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    render();

    expect(await screen.findByText("julie.roche@mail.fr")).toBeInTheDocument();
    expect(screen.getByText("company.coaches.empty")).toBeInTheDocument();
    expect(screen.queryByText("company.coaches.first.title")).toBeNull();
  });

  it("liste les membres, et tait les invitations acceptées qu'ils sont devenus", async () => {
    listCoaches.mockResolvedValue([CLAIRE]);
    listInvitations.mockResolvedValue([ACCEPTED]);
    render();

    expect(await screen.findByText("Claire Dumas")).toBeInTheDocument();
    expect(screen.getByText("claire.dumas@mail.fr")).toBeInTheDocument();
    expect(screen.getByText("company.invitations.emptyPending")).toBeInTheDocument();
    expect(screen.queryByText("julie.roche@mail.fr")).toBeNull();
  });

  it("compte les membres et les invitations en attente, une fois les deux lus", async () => {
    listCoaches.mockResolvedValue([CLAIRE]);
    listInvitations.mockResolvedValue([invitation(), DECLINED]);
    render();

    expect(await screen.findByTestId("subtitle")).toHaveTextContent(
      "company.coaches.count · company.invitations.pendingCount",
    );
  });

  // Les invitations d'athlète (#602) vivent sur l'autre page.
  it("ne lit que les invitations de Coach", async () => {
    render();
    await screen.findByText("company.coaches.first.title");

    expect(listInvitations).toHaveBeenCalledWith(InvitationRole.COACH);
  });

  it("ne montre la section des refus que s'il y en a", async () => {
    listCoaches.mockResolvedValue([CLAIRE]);
    render();
    await screen.findByText("Claire Dumas");
    expect(screen.queryByText("company.invitations.declined")).toBeNull();
  });

  // Une panne ne se lit pas « aucun coach » : ni état vide, ni décompte inventé.
  it("dit la panne au lieu d'un état vide, et ne rejoue que ce qui a échoué", async () => {
    listCoaches.mockRejectedValue(new ApiError(500, "boom", null));
    const { user } = render();

    expect(await screen.findByText("common.errorTitle")).toBeInTheDocument();
    expect(screen.queryByText("company.coaches.first.title")).toBeNull();
    expect(screen.queryByTestId("subtitle")).toBeNull();

    listInvitations.mockClear();
    listCoaches.mockResolvedValue([CLAIRE]);
    await user.click(screen.getByRole("button", { name: "common.retry" }));

    expect(await screen.findByText("Claire Dumas")).toBeInTheDocument();
    expect(listInvitations).not.toHaveBeenCalled();
  });
});

describe("CompanyCoachesScreen — les gestes", () => {
  it("révoque une invitation en attente, après confirmation", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "company.invitations.revoke" }));
    expect(revokeInvitation).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "company.invitations.revokeConfirm" }));

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("inv_1"));
  });

  it("efface une invitation refusée, après confirmation", async () => {
    listInvitations.mockResolvedValue([DECLINED]);
    const { user } = render();

    const section = (await screen.findByText("company.invitations.declined")).closest("section");
    expect(within(section as HTMLElement).getByText("paul@mail.fr")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "company.invitations.delete" }));
    await user.click(screen.getByRole("button", { name: "company.invitations.deleteConfirm" }));

    await waitFor(() => expect(deleteInvitation).toHaveBeenCalledWith("inv_2"));
  });

  it("invite depuis le panneau, puis le referme", async () => {
    const { user } = render();
    await screen.findByText("company.coaches.first.title");

    // Le bouton de l'en-tête — l'état vide porte le même.
    await user.click(screen.getAllByRole("button", { name: "company.coaches.add" })[0] as never);
    const submit = await screen.findByRole("button", { name: "company.invitations.panel.submit" });
    // Pas d'adresse, pas d'envoi (#319).
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByLabelText("company.invitations.panel.emailLabel"),
      "  Julie.Roche@Mail.fr ",
    );
    await user.click(submit);

    await waitFor(() => expect(inviteCoach).toHaveBeenCalledWith({ email: "Julie.Roche@Mail.fr" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("company.invitations.panel.emailLabel")).toBeNull(),
    );
  });

  it("garde le panneau ouvert quand l'adresse est déjà celle d'un membre", async () => {
    inviteCoach.mockRejectedValue(
      new ApiError(409, "Ce coach est déjà membre de ton entreprise", null),
    );
    const { user } = render();
    await screen.findByText("company.coaches.first.title");

    await user.click(screen.getAllByRole("button", { name: "company.coaches.add" })[0] as never);
    await user.type(
      await screen.findByLabelText("company.invitations.panel.emailLabel"),
      "claire.dumas@mail.fr",
    );
    await user.click(screen.getByRole("button", { name: "company.invitations.panel.submit" }));

    expect(
      await screen.findByText("Ce coach est déjà membre de ton entreprise"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("company.invitations.panel.emailLabel")).toBeInTheDocument();
  });
});
