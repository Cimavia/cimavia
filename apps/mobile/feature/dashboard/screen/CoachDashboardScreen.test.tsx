import type {
  CoachAthleteDto,
  CoachFeedbackSummaryDto,
  ConversationDto,
  InvoiceDto,
  PendingOrganizationInvitationDto,
} from "@cmv/shared";
import { Role, type TrainingCapability } from "@cmv/shared";
import { waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { createInstance } from "i18next";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi } from "@/feature/athlete/api";
import { organizationApi } from "@/feature/company/api";
import { CoachDashboardScreen } from "@/feature/dashboard/screen/CoachDashboardScreen";
import { coachFeedbackApi } from "@/feature/feedback/api";
import { invoiceApi } from "@/feature/invoice/api";
import { messageApi } from "@/feature/message/api";
import { reminderApi } from "@/feature/reminder/api";
import {
  ExercisedCapabilityProvider,
  useCapabilitySwitch,
  useExercisedCapability,
} from "@/shared/hook/useExercisedCapability";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Ce que l'écran DÉCIDE (#343) : quelles sources il interroge, ce qu'il rejoue après une panne,
 * quand il montre la liste des athlètes, où mènent ses tuiles. Les comptes, eux, sont testés dans
 * `@cmv/shared` : ici on vérifie seulement qu'ils arrivent sur la bonne tuile.
 *
 * Tous les hooks sont les VRAIS : seuls les appels sont remplacés, un par source.
 */
vi.mock("@/feature/athlete/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/athlete/api")>();
  return {
    ...original,
    accountApi: { ...original.accountApi, listAthletes: vi.fn(), listInvitations: vi.fn() },
  };
});
vi.mock("@/feature/company/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/company/api")>();
  return {
    ...original,
    organizationApi: {
      ...original.organizationApi,
      myInvitations: vi.fn(),
      acceptInvitation: vi.fn(),
      declineInvitation: vi.fn(),
    },
  };
});
vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/feedback/api")>();
  return { ...original, coachFeedbackApi: { ...original.coachFeedbackApi, list: vi.fn() } };
});
vi.mock("@/feature/invoice/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/invoice/api")>();
  return { ...original, invoiceApi: { ...original.invoiceApi, list: vi.fn() } };
});
vi.mock("@/feature/message/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/message/api")>();
  return { ...original, messageApi: { ...original.messageApi, listConversations: vi.fn() } };
});
vi.mock("@/feature/reminder/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/reminder/api")>();
  return { ...original, reminderApi: { ...original.reminderApi, summary: vi.fn() } };
});

const { session } = vi.hoisted(() => ({
  session: {
    current: { user: { id: "coach-1", name: "Kylian" } } as {
      user: { id: string; name: string; isCoach?: boolean; isAthlete?: boolean; role?: string };
    } | null,
  },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.current }) },
}));

vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const ATHLETE = {
  id: "ca-1",
  coachId: "coach-1",
  coachName: "Kylian",
  athleteId: "ath-1",
  athleteName: "Léa Martin",
  status: "ACTIVE",
  invitedAt: "2026-01-01T08:00:00.000Z",
  joinedAt: "2026-01-02T08:00:00.000Z",
  isSelf: false,
} as CoachAthleteDto;

const UNREAD = { id: "f-1", athleteId: "ath-1", coachReadAt: null } as CoachFeedbackSummaryDto;
const READ = {
  id: "f-2",
  athleteId: "ath-1",
  coachReadAt: "2026-09-01T08:00:00.000Z",
} as CoachFeedbackSummaryDto;

const invoice = (id: string, dueDate: string) =>
  ({
    id,
    athleteId: "ath-1",
    status: "PENDING",
    issuedAt: "2026-01-01T08:00:00.000Z",
    dueDate,
  }) as InvoiceDto;

// Le fil DIRECT avec ath-1 (#611) : seul son participant et ses non-lus comptent ici.
const CONVERSATION = {
  id: "c-1",
  kind: "DIRECT",
  participants: [{ userId: "ath-1", name: "Léa", capability: "athlete", lastReadAt: null }],
  unreadCount: 1,
} as ConversationDto;

const calls = {
  athletes: vi.mocked(accountApi.listAthletes),
  feedbacks: vi.mocked(coachFeedbackApi.list),
  invoices: vi.mocked(invoiceApi.list),
  conversations: vi.mocked(messageApi.listConversations),
  reminders: vi.mocked(reminderApi.summary),
  organizationInvitations: vi.mocked(organizationApi.myInvitations),
};

const FAILURE = new ApiError(500, "boom", null);

/** Le compte affiché sur la tuile, lu entre son libellé et sa légende. */
function countOn(container: HTMLElement, tile: string): string | null {
  const label = [...container.querySelectorAll("div")].find(
    (node) => node.textContent === `dashboard.tiles.${tile}`,
  );
  return label?.nextElementSibling?.textContent ?? null;
}

const loaded = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector('[role="progressbar"]')).toBeNull());

beforeEach(() => {
  session.current = { user: { id: "coach-1", name: "Kylian" } };
  calls.athletes.mockResolvedValue([ATHLETE]);
  calls.feedbacks.mockResolvedValue([UNREAD, READ]);
  calls.invoices.mockResolvedValue([invoice("i-1", "2020-01-01"), invoice("i-2", "2099-01-01")]);
  calls.conversations.mockResolvedValue([CONVERSATION]);
  calls.reminders.mockResolvedValue({ dueCount: 3, pendingCount: 5 });
  vi.mocked(accountApi.listInvitations).mockResolvedValue([]);
  calls.organizationInvitations.mockResolvedValue([]);
  vi.mocked(organizationApi.acceptInvitation).mockResolvedValue(undefined);
  vi.mocked(organizationApi.declineInvitation).mockResolvedValue(undefined);
});

describe("CoachDashboardScreen — les tuiles", () => {
  it("porte chaque compte sur sa tuile", async () => {
    const { container } = renderRn(<CoachDashboardScreen />);
    await loaded(container);

    expect(countOn(container, "feedback")).toBe("1");
    expect(countOn(container, "overdueInvoices")).toBe("1");
    expect(countOn(container, "reminders")).toBe("3");
    expect(countOn(container, "athletes")).toBe("1");
    expect(countOn(container, "invoices")).toBe("1");
  });

  it.each([
    ["feedback", "/feedbacks"],
    ["overdueInvoices", "/invoices"],
    ["reminders", "/reminders"],
  ])("mène la tuile %s à son écran", async (tile, route) => {
    const { container, getByText } = renderRn(<CoachDashboardScreen />);
    await loaded(container);

    press(getByText(`dashboard.tiles.${tile}`));

    expect(router.push).toHaveBeenCalledWith(route);
  });
});

/**
 * Un compte double qui atterrit en athlète — persona, « Mes coachs » ou le sélecteur laissé sur
 * Factures : le tableau de bord lit quand même au titre de coach (#343). Avant, il comptait ses
 * factures REÇUES et l'invitait à relancer ce qu'il doit lui-même.
 */
describe("CoachDashboardScreen — le titre de lecture", () => {
  const DUAL = { id: "coach-1", name: "Kylian", isCoach: true, isAthlete: true };

  /** Le sélecteur tel que Factures ou Messages l'a laissé, posé après le premier rendu. */
  function SelectorLeftOn({ capability }: Readonly<{ capability: TrainingCapability }>) {
    const { select } = useCapabilitySwitch();
    useEffect(() => select(capability), [select, capability]);
    return null;
  }

  function ExercisedProbe() {
    return <span data-testid="exercised">{useExercisedCapability() ?? "null"}</span>;
  }

  function withSelectorOn(capability: TrainingCapability) {
    return (
      <ExercisedCapabilityProvider>
        <SelectorLeftOn capability={capability} />
        <ExercisedProbe />
        <CoachDashboardScreen />
      </ExercisedCapabilityProvider>
    );
  }

  it("lit factures et fils en coach quand le persona est athlète", async () => {
    session.current = { user: { ...DUAL, role: Role.ATHLETE } };
    const { container } = renderRn(<CoachDashboardScreen />);
    await loaded(container);

    expect(calls.invoices).toHaveBeenCalledWith("coach");
    expect(calls.conversations).toHaveBeenCalledWith("coach");
    expect(calls.invoices).not.toHaveBeenCalledWith("athlete");
  });

  it("lit factures et fils en coach quand le sélecteur est resté sur athlète", async () => {
    session.current = { user: { ...DUAL, role: Role.COACH } };
    const { container, getByTestId } = renderRn(withSelectorOn("athlete"));
    await waitFor(() => expect(getByTestId("exercised").textContent).toBe("athlete"));
    await loaded(container);

    expect(calls.invoices).not.toHaveBeenCalledWith("athlete");
    expect(calls.conversations).not.toHaveBeenCalledWith("athlete");
  });

  // La tuile compte les factures du coach : elle ouvre Factures à ce titre, pas aux reçues.
  it("bascule le sélecteur en coach avant d'ouvrir les factures en retard", async () => {
    session.current = { user: { ...DUAL, role: Role.COACH } };
    const { container, getByTestId, getByText } = renderRn(withSelectorOn("athlete"));
    await waitFor(() => expect(getByTestId("exercised").textContent).toBe("athlete"));
    await loaded(container);

    press(getByText("dashboard.tiles.overdueInvoices"));

    expect(getByTestId("exercised").textContent).toBe("coach");
    expect(router.push).toHaveBeenCalledWith("/invoices");
  });
});

describe("CoachDashboardScreen — la liste des athlètes", () => {
  it("rend une ligne par athlète suivi", async () => {
    const { findByText } = renderRn(<CoachDashboardScreen />);

    expect(await findByText("Léa Martin")).toBeTruthy();
  });

  it("dit l'absence d'athlète quand le coach n'en suit aucun", async () => {
    calls.athletes.mockResolvedValue([]);
    const { findByText } = renderRn(<CoachDashboardScreen />);

    expect(await findByText("athlete.empty")).toBeTruthy();
  });

  /** Liste illisible : le bandeau l'a dit, une liste vide ferait croire à un coach sans athlète. */
  it("tait la liste plutôt que de la dire vide quand elle n'a pas pu être lue", async () => {
    calls.athletes.mockRejectedValue(FAILURE);
    const { container, findByText } = renderRn(<CoachDashboardScreen />);

    expect(await findByText("common.retry")).toBeTruthy();
    expect(container.textContent).not.toContain("dashboard.section.athletes");
    expect(container.textContent).not.toContain("athlete.empty");
  });
});

describe("CoachDashboardScreen — la panne et le rafraîchissement", () => {
  it("n'affirme rien tant qu'une source charge", () => {
    calls.reminders.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<CoachDashboardScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(countOn(container, "reminders")).toBe("—");
  });

  /** Une panne partielle n'efface pas l'écran : seules les tuiles sans réponse rendent « — ». */
  it("garde lisibles les tuiles qui ont répondu quand une source tombe", async () => {
    calls.reminders.mockRejectedValue(FAILURE);
    const { container, findByText } = renderRn(<CoachDashboardScreen />);

    expect(await findByText("common.retry")).toBeTruthy();
    expect(countOn(container, "reminders")).toBe("—");
    expect(countOn(container, "feedback")).toBe("1");
  });

  it("ne rejoue que la source tombée", async () => {
    calls.reminders.mockRejectedValue(FAILURE);
    const { container, findByText } = renderRn(<CoachDashboardScreen />);
    await findByText("common.retry");
    for (const call of Object.values(calls)) call.mockClear();
    calls.reminders.mockResolvedValue({ dueCount: 3, pendingCount: 5 });

    pressButton(container, "common.retry");

    await waitFor(() => expect(countOn(container, "reminders")).toBe("3"));
    expect(calls.reminders).toHaveBeenCalledOnce();
    expect(calls.athletes).not.toHaveBeenCalled();
    expect(calls.feedbacks).not.toHaveBeenCalled();
  });

  /** Tirer l'écran, c'est demander explicitement de l'à-jour : tout est relu, pas seulement l'échec. */
  it("relit toutes les sources quand le coach tire l'écran", async () => {
    const { container } = renderRn(<CoachDashboardScreen />);
    await loaded(container);
    for (const call of Object.values(calls)) call.mockClear();

    press(container.querySelector("[data-refresh]") as HTMLElement);

    await waitFor(() => {
      for (const call of Object.values(calls)) expect(call).toHaveBeenCalledOnce();
    });
  });
});

describe("CoachDashboardScreen — l'accueil", () => {
  function withName() {
    const i18n = createInstance();
    i18n.init({
      lng: "test",
      resources: { test: { translation: { dashboard: { welcome: "Bonjour {{name}}" } } } },
      interpolation: { escapeValue: false },
    });
    return (
      <I18nextProvider i18n={i18n}>
        <CoachDashboardScreen />
      </I18nextProvider>
    );
  }

  it("salue le coach par son nom", () => {
    const { queryByText } = renderRn(withName());

    expect(queryByText("Bonjour Kylian")).not.toBeNull();
  });

  it("rend « — » plutôt qu'un nom inventé tant que la session se résout", () => {
    session.current = null;
    const { queryByText } = renderRn(withName());

    expect(queryByText("Bonjour —")).not.toBeNull();
  });
});

const ORGANIZATION_INVITATION: PendingOrganizationInvitationDto = {
  id: "oinv-1",
  organizationName: "Fontainebleau Escalade",
  expiresAt: "2026-10-16T09:00:00.000Z",
  createdAt: "2026-10-09T09:00:00.000Z",
};

describe("CoachDashboardScreen — une entreprise m'invite (#601)", () => {
  it("pose la carte de l'invitation", async () => {
    calls.organizationInvitations.mockResolvedValue([ORGANIZATION_INVITATION]);
    const { findByText } = renderRn(<CoachDashboardScreen />);

    expect(await findByText("coach.organizationInvitation.title")).toBeTruthy();
  });

  // L'absence d'invitation est le cas ordinaire : une panne ici ne mérite pas le bandeau.
  it("ne dit rien quand la liste des invitations est en panne", async () => {
    calls.organizationInvitations.mockRejectedValue(FAILURE);
    const { container } = renderRn(<CoachDashboardScreen />);
    await loaded(container);

    await waitFor(() => expect(calls.organizationInvitations).toHaveBeenCalled());
    expect(container.textContent).not.toContain("common.retry");
    expect(container.textContent).not.toContain("coach.organizationInvitation.title");
  });

  it("accepte depuis la carte", async () => {
    calls.organizationInvitations.mockResolvedValue([ORGANIZATION_INVITATION]);
    const { container, findByText } = renderRn(<CoachDashboardScreen />);
    await findByText("coach.organizationInvitation.accept");

    pressButton(container, "coach.organizationInvitation.accept");

    await waitFor(() => expect(organizationApi.acceptInvitation).toHaveBeenCalledWith("oinv-1"));
  });

  it("n'envoie le refus qu'après confirmation", async () => {
    calls.organizationInvitations.mockResolvedValue([ORGANIZATION_INVITATION]);
    const { container, findByText } = renderRn(<CoachDashboardScreen />);
    await findByText("coach.organizationInvitation.decline");

    pressButton(container, "coach.organizationInvitation.decline");
    expect(organizationApi.declineInvitation).not.toHaveBeenCalled();
    pressButton(container, "coach.organizationInvitation.declineConfirm");

    await waitFor(() => expect(organizationApi.declineInvitation).toHaveBeenCalledWith("oinv-1"));
  });

  // Pas de toasts sur mobile : l'échec se dit sur la carte, avec le message de l'API.
  it("dit sur place pourquoi l'acceptation a échoué", async () => {
    calls.organizationInvitations.mockResolvedValue([ORGANIZATION_INVITATION]);
    vi.mocked(organizationApi.acceptInvitation).mockRejectedValue(
      new ApiError(409, "Tu es déjà membre de cette entreprise", null),
    );
    const { container, findByText } = renderRn(<CoachDashboardScreen />);
    await findByText("coach.organizationInvitation.accept");

    pressButton(container, "coach.organizationInvitation.accept");

    expect(await findByText("Tu es déjà membre de cette entreprise")).toBeTruthy();
  });
});
