import {
  ApiError,
  type InvitationDto,
  InvitationRole,
  InvitationStatus,
  type OrganizationAthleteDto,
  type OrganizationCoachDto,
} from "@cmv/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyAthletesScreen } from "@/feature/company/screen/CompanyAthletesScreen";
import { renderWithProviders } from "../../../../test/render";

vi.mock("@/feature/company/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    organizationApi: {
      listAthletes: vi.fn(),
      listCoaches: vi.fn(),
      listInvitations: vi.fn(),
      inviteAthlete: vi.fn(),
      revokeInvitation: vi.fn(),
      deleteInvitation: vi.fn(),
    },
    organizationKeys: shared.organizationKeys,
  };
});

// Le panneau et l'état vide lisent le nom de l'entreprise dans la session ; le client réel arme un
// temporisateur qui survit au jsdom (cf. `MyCoachesScreen.test`).
const session = vi.hoisted(() => ({
  current: { user: { name: "Fontainebleau Escalade" } } as unknown,
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.current }) },
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
const listAthletes = vi.mocked(organizationApi.listAthletes);
const listCoaches = vi.mocked(organizationApi.listCoaches);
const listInvitations = vi.mocked(organizationApi.listInvitations);
const inviteAthlete = vi.mocked(organizationApi.inviteAthlete);
const revokeInvitation = vi.mocked(organizationApi.revokeInvitation);

const CLAIRE: OrganizationCoachDto = {
  coachId: "u_claire",
  name: "Claire Dumas",
  email: "claire.dumas@mail.fr",
  joinedAt: "2026-03-12T09:00:00.000Z",
};

const THEO: OrganizationAthleteDto = {
  athleteId: "u_theo",
  name: "Théo Imbert",
  email: "theo.imbert@mail.fr",
  joinedAt: "2026-10-05T09:00:00.000Z",
  coaches: [{ coachId: CLAIRE.coachId, name: CLAIRE.name }],
};

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: "inv_1",
  email: "lea@mail.fr",
  role: InvitationRole.ATHLETE,
  status: InvitationStatus.PENDING,
  expiresAt: "2026-10-16T09:00:00.000Z",
  createdAt: "2026-10-09T09:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { name: "Fontainebleau Escalade" } };
  listAthletes.mockResolvedValue([]);
  listCoaches.mockResolvedValue([CLAIRE]);
  listInvitations.mockResolvedValue([]);
  inviteAthlete.mockResolvedValue(invitation());
  revokeInvitation.mockResolvedValue(undefined);
});

const render = () => renderWithProviders(<CompanyAthletesScreen />);

describe("CompanyAthletesScreen — ce que la page montre", () => {
  // Frame 6 : ni athlète ni invitation, l'écran invite à commencer.
  it("invite à inviter un premier athlète quand il n'y a rien", async () => {
    render();

    expect(await screen.findByText("company.athletes.first.title")).toBeInTheDocument();
    expect(screen.getByText("company.athletes.hint")).toBeInTheDocument();
    expect(screen.getByTestId("subtitle")).toHaveTextContent("company.athletes.none");
    expect(listInvitations).toHaveBeenCalledWith(InvitationRole.ATHLETE);
  });

  // Frame 3 : chaque athlète, et les Coachs qui le suivent.
  it("liste les athlètes avec leurs Coachs", async () => {
    listAthletes.mockResolvedValue([THEO]);
    render();

    expect(await screen.findByText("Théo Imbert")).toBeInTheDocument();
    expect(screen.getByText("theo.imbert@mail.fr")).toBeInTheDocument();
    expect(screen.getByText("Claire Dumas")).toBeInTheDocument();
    expect(screen.getByTestId("subtitle")).toHaveTextContent("company.athletes.summary");
  });

  // Une entreprise sans Coach : la liste vide est un état, pas une donnée manquante.
  it("dit qu'un athlète sera suivi dès l'arrivée des Coachs", async () => {
    listAthletes.mockResolvedValue([{ ...THEO, coaches: [] }]);
    render();

    expect(await screen.findByText("company.athletes.noCoach")).toBeInTheDocument();
  });

  // Le décompte des Coachs manque : l'en-tête se tait plutôt que d'inventer « 0 coach ».
  it("tait l'en-tête quand les Coachs ne sont pas lus", async () => {
    listAthletes.mockResolvedValue([THEO]);
    listCoaches.mockRejectedValue(new ApiError(500, "boom", null));
    render();

    expect(await screen.findByText("Théo Imbert")).toBeInTheDocument();
    expect(screen.queryByTestId("subtitle")).toBeNull();
  });

  it("montre l'invitation en attente sous un tableau vide", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    render();

    const section = (await screen.findByText("company.invitations.pending")).closest("section");
    expect(within(section as HTMLElement).getByText("lea@mail.fr")).toBeInTheDocument();
    expect(screen.getByText("company.athletes.empty")).toBeInTheDocument();
  });

  it("dit la panne au lieu d'un état vide", async () => {
    listAthletes.mockRejectedValue(new ApiError(500, "boom", null));
    render();

    expect(await screen.findByText("common.errorTitle")).toBeInTheDocument();
    expect(screen.queryByText("company.athletes.first.title")).toBeNull();
  });

  // L'autre moitié du rejeu sélectif : les invitations seules ont échoué, les athlètes restent lus.
  it("ne rejoue que les invitations quand elles seules ont échoué", async () => {
    listInvitations.mockRejectedValue(new ApiError(500, "boom", null));
    const { user } = render();

    expect(await screen.findByText("common.errorTitle")).toBeInTheDocument();
    listAthletes.mockClear();
    listInvitations.mockResolvedValue([invitation()]);
    await user.click(screen.getByRole("button", { name: "common.retry" }));

    expect(await screen.findByText("lea@mail.fr")).toBeInTheDocument();
    expect(listAthletes).not.toHaveBeenCalled();
  });

  // Session pas encore lue : l'état vide et le panneau s'affichent quand même, le nom de
  // l'entreprise y vaut « — » (règle dure n°5) plutôt que de faire attendre la page.
  it("s'affiche sans attendre la session qui porte le nom de l'entreprise", async () => {
    session.current = null;
    const { user } = render();

    expect(await screen.findByText("company.athletes.first.title")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "company.athletes.add" })[0] as never);
    expect(await screen.findAllByText("company.athletes.hint")).toHaveLength(2);
  });
});

describe("CompanyAthletesScreen — les gestes", () => {
  it("invite un athlète depuis le panneau, puis le referme", async () => {
    const { user } = render();
    await screen.findByText("company.athletes.first.title");

    await user.click(screen.getAllByRole("button", { name: "company.athletes.add" })[0] as never);
    expect(await screen.findAllByText("company.athletes.hint")).toHaveLength(2);
    await user.type(screen.getByLabelText("company.invitations.panel.emailLabel"), "lea@mail.fr");
    await user.click(screen.getByRole("button", { name: "company.invitations.panel.submit" }));

    await waitFor(() => expect(inviteAthlete).toHaveBeenCalledWith({ email: "lea@mail.fr" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("company.invitations.panel.emailLabel")).toBeNull(),
    );
  });

  // Pendant l'envoi, le bouton le dit et ne repart pas.
  it("dit l'envoi en cours, bouton fermé", async () => {
    inviteAthlete.mockReturnValue(new Promise(() => {}));
    const { user } = render();
    await screen.findByText("company.athletes.first.title");

    await user.click(screen.getAllByRole("button", { name: "company.athletes.add" })[0] as never);
    await user.type(
      await screen.findByLabelText("company.invitations.panel.emailLabel"),
      "lea@mail.fr",
    );
    await user.click(screen.getByRole("button", { name: "company.invitations.panel.submit" }));

    expect(
      await screen.findByRole("button", { name: "company.invitations.panel.submitting" }),
    ).toBeDisabled();
  });

  /**
   * Le bouton fermé ne suffit pas : le formulaire peut partir sans lui (Entrée, assistance). Sans
   * adresse valide, rien ne part (#319).
   */
  it("n'envoie rien quand le formulaire part sans adresse", async () => {
    const { user } = render();
    await screen.findByText("company.athletes.first.title");

    await user.click(screen.getAllByRole("button", { name: "company.athletes.add" })[0] as never);
    const field = await screen.findByLabelText("company.invitations.panel.emailLabel");
    await user.type(field, "lea@");
    fireEvent.submit(field.closest("form") as HTMLFormElement);

    expect(inviteAthlete).not.toHaveBeenCalled();
    expect(screen.getByLabelText("company.invitations.panel.emailLabel")).toBeInTheDocument();
  });

  it("révoque une invitation d'athlète, après confirmation", async () => {
    listInvitations.mockResolvedValue([invitation()]);
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "company.invitations.revoke" }));
    await user.click(screen.getByRole("button", { name: "company.invitations.revokeConfirm" }));

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("inv_1"));
  });
});
