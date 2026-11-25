import type { CoachAthleteDto, ConversationDto, PendingInvitationDto } from "@cmv/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyCoachesScreen } from "@/feature/coach/screen/MyCoachesScreen";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "../../../test/render";

vi.mock("@/feature/coach/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/coach/api")>();
  return {
    ...original,
    accountApi: {
      myCoaches: vi.fn(),
      myInvitations: vi.fn(),
      acceptInvitation: vi.fn(),
      declineInvitation: vi.fn(),
      leaveCoach: vi.fn(),
    },
  };
});

// Ouvrir le fil d'un coach résout la conversation à deux (#612) : seul l'appel est remplacé. La
// liste des fils, elle, sert l'archive (#911) : c'est par elle qu'un ancien coach se relit.
const { createConversation, listConversations } = vi.hoisted(() => ({
  createConversation: vi.fn(),
  listConversations: vi.fn(),
}));
vi.mock("@/feature/message/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/message/api")>();
  return { ...original, messageApi: { createConversation, listConversations } };
});

// `useFocusEffect` capturé plutôt qu'exécuté : le test du premier plan le rejoue quand il veut.
const focus = vi.hoisted(() => ({ effect: null as (() => void) | null }));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useFocusEffect: (effect: () => void) => {
    focus.effect = effect;
  },
}));
// Le sélecteur d'espace vit dans un fournisseur posé à la racine de l'app : on lit ce qu'on lui
// demande, sans le monter.
vi.mock("@/shared/hook/useExercisedCapability", () => ({
  useCapabilitySwitch: vi.fn(),
  useExercisedCapability: (pinned?: string) => pinned ?? "athlete",
}));

const session = vi.hoisted(() => ({
  current: { user: { id: "ath_1", email: "lea@exemple.fr" } } as unknown,
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.current }) },
}));

const { accountApi } = await import("@/feature/coach/api");
const myCoaches = vi.mocked(accountApi.myCoaches);
const select = vi.fn();
const myInvitations = vi.mocked(accountApi.myInvitations);
const acceptInvitation = vi.mocked(accountApi.acceptInvitation);
const declineInvitation = vi.mocked(accountApi.declineInvitation);
const leaveCoach = vi.mocked(accountApi.leaveCoach);

const INVITATION = {
  id: "inv_1",
  issuer: { kind: "coach" as const, name: "Marc Keller" },
  expiresAt: "2026-09-12T09:00:00.000Z",
  createdAt: "2026-09-05T09:00:00.000Z",
};

const RELATION = {
  id: "rel_1",
  coachId: "u_coach",
  coachName: "Julie Renaud",
  athleteId: "u_athlete",
  athleteName: "Léa",
  status: "ACTIVE",
  invitedAt: "2026-03-12T09:00:00.000Z",
  joinedAt: "2026-03-12T09:00:00.000Z",
  endedAt: null,
  organizationName: null,
  isSelf: false,
} satisfies CoachAthleteDto;

const MARC = { ...RELATION, id: "rel_2", coachId: "u_marc", coachName: "Marc Keller" };

/** Un coach quitté (#909) : il reste dans la liste, pour relire l'archive. */
const FORMER = {
  ...RELATION,
  id: "rel_3",
  coachId: "u_paul",
  coachName: "Paul Mercier",
  status: "ENDED",
  endedAt: "2026-11-20T10:00:00.000Z",
} satisfies CoachAthleteDto;

/** Le fil à deux avec Paul — celui que l'archive rouvre. */
const PAUL_THREAD = {
  id: "cv-paul",
  kind: "DIRECT",
  participants: [{ userId: "u_paul", name: "Paul Mercier", capability: "coach", lastReadAt: null }],
  lastReadAt: null,
  lastMessageAt: null,
  lastMessageSenderId: null,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
  createdAt: "2026-03-12T09:00:00.000Z",
  followEndedAt: "2026-11-20T10:00:00.000Z",
} satisfies ConversationDto;

/** L'invitation d'une entreprise (#602) : ses Coachs, ceux qui suivront l'athlète s'il accepte. */
const FROM_ORGANIZATION = {
  ...INVITATION,
  id: "inv_f",
  issuer: {
    kind: "organization" as const,
    name: "Fontainebleau Escalade",
    coachNames: ["Claire Dumas", "Marc Keller"],
  },
};

beforeEach(() => {
  vi.mocked(useCapabilitySwitch).mockReturnValue({ visible: false, current: null, select });
  session.current = { user: { id: "ath_1", email: "lea@exemple.fr" } };
  myCoaches.mockResolvedValue([]);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue([RELATION]);
  declineInvitation.mockResolvedValue(undefined);
  leaveCoach.mockResolvedValue({
    ...RELATION,
    status: "ENDED",
    endedAt: "2026-11-25T10:00:00.000Z",
  });
  listConversations.mockResolvedValue([]);
});

describe("MyCoachesScreen — l'invitation qui m'attend (#146)", () => {
  // Plus de code à saisir (#390) : la carte est le seul chemin pour rejoindre.
  it("annonce l'invitation, sans plus rien proposer à saisir", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.invitation.title")).toBeTruthy();
    expect(container.querySelector("input")).toBeNull();
  });

  it("rejoint depuis la carte, sans rien faire recopier", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le refus est armé en deux temps, comme une suppression : il est SANS RETOUR, le coach devra
   * réémettre. Un seul appui ne doit rien envoyer — c'est toute la valeur du geste.
   */
  it("n'envoie le refus qu'après confirmation", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.decline");
    expect(declineInvitation).not.toHaveBeenCalled();

    pressButton(container, "coach.invitation.declineConfirm");
    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le cœur de #599 : un athlète déjà suivi accepte une seconde invitation. Jusque-là la carte
   * restait affichée mais « Rejoindre » était fermé — au plus un coach.
   */
  it("laisse un athlète déjà suivi rejoindre un second coach", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * `null` n'est pas la liste vide, et aucun des deux ne s'annonce. Ce qu'on ne fait JAMAIS, c'est
   * écrire « aucune invitation » sur une API injoignable — sans bloquer l'écran pour autant.
   */
  it.each<[string, () => Promise<PendingInvitationDto[]>]>([
    ["une liste vide", () => Promise.resolve([])],
    ["une requête en échec", () => Promise.reject(new Error("réseau"))],
  ])("n'annonce rien sur %s, et dit seulement l'absence de coach", async (_case, response) => {
    myInvitations.mockImplementation(response);
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.join.title")).toBeTruthy();
    expect(screen.queryByText("coach.invitation.decline")).toBeNull();
  });
});

describe("MyCoachesScreen — l'invitation d'une entreprise (#602)", () => {
  // Accepter n'en choisit aucun : la carte nomme tous ceux qui suivront.
  it("nomme l'entreprise et chacun des coachs qui suivront l'athlète", async () => {
    myInvitations.mockResolvedValue([FROM_ORGANIZATION]);
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.invitation.fromOrganization.title")).toBeTruthy();
    expect(screen.getByText("coach.invitation.fromOrganization.coaches")).toBeTruthy();
    expect(screen.getByText("Claire Dumas")).toBeTruthy();
    expect(screen.getByText("Marc Keller")).toBeTruthy();
    expect(screen.getByText("coach.invitation.fromOrganization.declineHint")).toBeTruthy();
    // Une entreprise n'est pas un coach à rejoindre.
    expect(screen.queryByText("coach.invitation.join")).toBeNull();
  });

  // Liste vide = l'entreprise n'a pas encore de coach : un état à dire, pas un trou à laisser.
  it("dit que les coachs suivront dès leur arrivée quand l'entreprise n'en a pas", async () => {
    myInvitations.mockResolvedValue([
      { ...FROM_ORGANIZATION, issuer: { ...FROM_ORGANIZATION.issuer, coachNames: [] } },
    ]);
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.invitation.fromOrganization.noCoach")).toBeTruthy();
    expect(screen.queryByText("coach.invitation.fromOrganization.coaches")).toBeNull();
  });

  it("accepte depuis la carte, et dit l'échec sans parler d'un coach", async () => {
    acceptInvitation.mockRejectedValue(new Error("réseau"));
    myInvitations.mockResolvedValue([FROM_ORGANIZATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.fromOrganization.title");

    pressButton(container, "coach.invitation.fromOrganization.accept");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_f"));
    expect(await screen.findByText("coach.invitation.fromOrganization.acceptError")).toBeTruthy();
    expect(screen.queryByText("coach.invitation.joinError")).toBeNull();
  });
});

describe("MyCoachesScreen — l'invitation, pendant et après", () => {
  it("dit l'acceptation en cours", async () => {
    acceptInvitation.mockReturnValue(new Promise(() => undefined));
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    expect(await screen.findByText("coach.invitation.joining")).toBeTruthy();
  });

  /**
   * « Rejoindre » échouait en silence (#365) : seul le formulaire de code disait son erreur, de sa
   * propre mutation. Le message de l'API d'abord, le libellé quand il n'y en a pas.
   */
  it.each([
    [
      "tel que l'API l'a formulé",
      new ApiError(400, "Invitation expirée", null),
      "Invitation expirée",
    ],
    [
      "par le message générique sans formulation",
      new Error("réseau"),
      "coach.invitation.joinError",
    ],
  ])("dit l'échec de l'acceptation %s", async (_, failure, message) => {
    acceptInvitation.mockRejectedValue(failure);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    expect(await screen.findByText(message)).toBeTruthy();
    // Une seule fois : le formulaire de code a sa propre mutation, il ne la répète pas.
    expect(screen.queryByText("coach.join.error")).toBeNull();
  });

  /** Le mobile n'a pas de toasts : l'échec du refus se dit sur la carte. */
  it.each([
    [
      "tel que l'API l'a formulé",
      new ApiError(409, "Invitation déjà traitée", null),
      "Invitation déjà traitée",
    ],
    [
      "par le message générique sans formulation",
      new Error("réseau"),
      "coach.invitation.declineError",
    ],
  ])("dit l'échec du refus %s", async (_, failure, message) => {
    declineInvitation.mockRejectedValue(failure);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.decline");
    pressButton(container, "coach.invitation.declineConfirm");

    expect(await screen.findByText(message)).toBeTruthy();
  });
});

describe("MyCoachesScreen — sans coach", () => {
  /**
   * Sans code à saisir (#390), une invitation partie vers une autre adresse ne s'afficherait
   * jamais, et rien ne dirait pourquoi. L'adresse du compte est le seul recours : c'est elle que
   * l'athlète donne à son coach.
   */
  it("dit l'adresse à laquelle le coach doit inviter, sans rien proposer à saisir", async () => {
    const { container } = renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.join.address")).toBeTruthy();
    expect(screen.getByText("lea@exemple.fr")).toBeTruthy();
    expect(container.querySelector("input")).toBeNull();
  });

  // Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5).
  it("rend « — » tant que l'adresse n'est pas connue", async () => {
    session.current = null;
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("—")).toBeTruthy();
  });
});

describe("MyCoachesScreen — ses coachs (#599)", () => {
  it("rend une ligne par coach, et dit l'adresse où un autre peut l'inviter", async () => {
    myCoaches.mockResolvedValue([RELATION, { ...MARC, joinedAt: null }]);
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("Julie Renaud")).toBeTruthy();
    expect(screen.getByText("Marc Keller")).toBeTruthy();
    expect(screen.getByText("coach.since")).toBeTruthy();
    // Une relation posée sans acceptation n'a pas de date : on le dit, on n'en invente pas.
    expect(screen.getByText("coach.sinceUnknown")).toBeTruthy();
    expect(screen.getByText("coach.more.description")).toBeTruthy();
    expect(screen.queryByText("coach.join.title")).toBeNull();
  });

  // Chaque lien dit d'où il vient (#602) : « via F » sous le nom, rien pour un lien direct.
  it("dit la provenance d'un lien d'entreprise, et rien pour un lien direct", async () => {
    myCoaches.mockResolvedValue([
      RELATION,
      { ...MARC, organizationName: "Fontainebleau Escalade" },
    ]);
    renderRn(<MyCoachesScreen />);

    await screen.findByText("Marc Keller");
    // Une seule mention : le lien direct de Julie n'en porte aucune, pas même un « — ».
    expect(screen.getAllByText("coach.via")).toHaveLength(1);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("ouvre le fil à deux avec le coach touché, par son id", async () => {
    createConversation.mockResolvedValue({ id: "cv-marc" });
    myCoaches.mockResolvedValue([RELATION, MARC]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Marc Keller");

    // Un nœud par bouton, dans l'ordre des lignes : le second est celui de Marc.
    press(within(container).getAllByText("coach.message")[1] as HTMLElement);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/messages/cv-marc"));
    expect(createConversation).toHaveBeenCalledWith(
      { participants: [{ userId: "u_marc", capability: "coach" }] },
      "athlete",
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("dit l'échec de l'ouverture, sans naviguer", async () => {
    createConversation.mockRejectedValue(new Error("réseau"));
    myCoaches.mockResolvedValue([RELATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    pressButton(container, "coach.message");

    expect(await screen.findByText("coach.messageError")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  // Écrire à son coach est un geste d'athlète : depuis l'espace coach, on y bascule d'abord.
  it("bascule un compte à double capacité en athlète avant d'ouvrir le fil", async () => {
    vi.mocked(useCapabilitySwitch).mockReturnValue({ visible: true, current: "coach", select });
    myCoaches.mockResolvedValue([RELATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    createConversation.mockResolvedValue({ id: "cv-julie" });
    pressButton(container, "coach.message");

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/messages/cv-julie"));
    expect(select).toHaveBeenCalledWith("athlete");
  });
});

describe("MyCoachesScreen — quitter un coach (#911)", () => {
  /** Le départ est armé en deux temps : un seul appui ne doit rien rompre. */
  it("ne quitte le coach qu'après confirmation, en disant ce qui reste", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    pressButton(container, "follow.end.athlete.action");
    expect(leaveCoach).not.toHaveBeenCalled();
    expect(screen.getByText("follow.end.athlete.hint")).toBeTruthy();

    pressButton(container, "follow.end.athlete.confirm");
    await waitFor(() => expect(leaveCoach).toHaveBeenCalledWith("u_coach"));
  });

  /** Le lien rompu passe aussitôt dans l'archive, et le bloc « pas de coach » revient. */
  it("range le coach quitté dans l'archive, sans attendre la relecture", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");
    // La relecture qui suit tarde : c'est le lien posé dans le cache qui doit faire le travail.
    myCoaches.mockReturnValue(new Promise(() => undefined));

    pressButton(container, "follow.end.athlete.action");
    pressButton(container, "follow.end.athlete.confirm");

    expect(await screen.findByText("coach.join.title")).toBeTruthy();
    expect(screen.getByText("follow.archive.coaches")).toBeTruthy();
    expect(screen.queryByText("coach.message")).toBeNull();
  });

  it.each([
    [
      "tel que l'API l'a formulé",
      new ApiError(409, "Suivi déjà terminé", null),
      "Suivi déjà terminé",
    ],
    ["par le message générique sans formulation", new Error("réseau"), "follow.end.athlete.error"],
  ])("dit l'échec du départ %s, sur la carte", async (_, failure, message) => {
    leaveCoach.mockRejectedValue(failure);
    myCoaches.mockResolvedValue([RELATION]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    pressButton(container, "follow.end.athlete.action");
    pressButton(container, "follow.end.athlete.confirm");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("coach.message")).toBeTruthy();
  });
});

describe("MyCoachesScreen — anciens coachs (#911)", () => {
  /** Un coach quitté n'est plus un coach : ni ligne, ni « Message », ni départ à proposer. */
  it("range un coach quitté à part, replié, et ne le compte pas parmi ses coachs", async () => {
    myCoaches.mockResolvedValue([RELATION, FORMER]);
    const { container } = renderRn(<MyCoachesScreen />);

    await screen.findByText("Julie Renaud");
    expect(screen.getAllByText("coach.message")).toHaveLength(1);
    expect(screen.queryByText("Paul Mercier")).toBeNull();
    // Le repli dit son état au lecteur d'écran, pas seulement par le chevron.
    const toggle = screen.getByRole("button", { name: "follow.archive.coaches" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    pressButton(container, "follow.archive.coaches");

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Paul Mercier")).toBeTruthy();
    expect(screen.getByText("follow.endedOn")).toBeTruthy();
  });

  /** Sans coach EN COURS, l'athlète n'a plus de coach : il l'apprend, l'archive dessous. */
  it("redit l'absence de coach à qui n'a plus que d'anciens coachs", async () => {
    myCoaches.mockResolvedValue([FORMER]);
    renderRn(<MyCoachesScreen />);

    expect(await screen.findByText("coach.join.title")).toBeTruthy();
    expect(screen.getByText("follow.archive.coaches")).toBeTruthy();
  });

  it("rouvre le fil d'un ancien coach par son id, à titre d'athlète", async () => {
    vi.mocked(useCapabilitySwitch).mockReturnValue({ visible: true, current: "coach", select });
    listConversations.mockResolvedValue([PAUL_THREAD]);
    myCoaches.mockResolvedValue([FORMER]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("follow.archive.coaches");

    pressButton(container, "follow.archive.coaches");
    await screen.findByText("follow.archive.thread");
    pressButton(container, "follow.archive.thread");

    expect(router.push).toHaveBeenCalledWith("/messages/cv-paul");
    expect(select).toHaveBeenCalledWith("athlete");
    expect(listConversations).toHaveBeenCalledWith("athlete");
    expect(createConversation).not.toHaveBeenCalled();
  });

  // Jamais écrit, ou fils pas encore lus : rien à relire, donc pas de bouton.
  it("ne propose pas de fil à relire quand il n'y en a pas", async () => {
    myCoaches.mockResolvedValue([FORMER]);
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("follow.archive.coaches");

    pressButton(container, "follow.archive.coaches");

    await screen.findByText("Paul Mercier");
    await waitFor(() => expect(listConversations).toHaveBeenCalled());
    expect(screen.queryByText("follow.archive.thread")).toBeNull();
  });

  // Personne de quitté : l'archive ne se monte pas, et ne lit pas les fils pour rien.
  it("ne lit pas les fils d'un athlète qui n'a quitté personne", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    expect(screen.queryByText("follow.archive.coaches")).toBeNull();
    expect(listConversations).not.toHaveBeenCalled();
  });
});

/** #364 : l'écran disait « aucun coach » pendant le chargement, et sur une panne. */
describe("MyCoachesScreen — au retour sur l'écran (#602)", () => {
  /**
   * Le Coach qui rejoint l'entreprise de l'athlète apparaît sans que l'athlète ait rien fait. Le
   * cache persisté, frais 5 min, le cachait même après une relance de l'app : l'écran relit donc
   * coachs et invitations à chaque passage au premier plan.
   */
  it("relit ses coachs et ses invitations, et montre le coach arrivé entre-temps", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    renderRn(<MyCoachesScreen />);
    await screen.findByText("Julie Renaud");

    myCoaches.mockResolvedValue([
      RELATION,
      { ...MARC, organizationName: "Fontainebleau Escalade" },
    ]);
    myInvitations.mockClear();
    act(() => focus.effect?.());

    expect(await screen.findByText("Marc Keller")).toBeTruthy();
    expect(myInvitations).toHaveBeenCalledTimes(1);
  });
});

describe("MyCoachesScreen — chargement et panne", () => {
  it("n'affirme rien tant que la liste charge", () => {
    myCoaches.mockReturnValue(new Promise(() => {}));
    const { container } = renderRn(<MyCoachesScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(screen.queryByText("coach.join.title")).toBeNull();
  });

  it("dit la panne plutôt que l'absence, puis relit au réessai", async () => {
    myCoaches.mockRejectedValueOnce(new Error("réseau"));
    const { container } = renderRn(<MyCoachesScreen />);
    await screen.findByText("common.retry");
    expect(screen.queryByText("coach.join.title")).toBeNull();

    pressButton(container, "common.retry");

    expect(await screen.findByText("coach.join.title")).toBeTruthy();
    expect(myCoaches).toHaveBeenCalledTimes(2);
  });
});
