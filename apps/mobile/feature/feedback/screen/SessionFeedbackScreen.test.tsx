import type { MessageDto, ScheduledSessionDto, SessionFeedbackDto } from "@cmv/shared";
import { myFeedbackKeys } from "@cmv/shared";
import { blockSession } from "@cmv/shared/test/block-session";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackBlocksSection } from "@/feature/feedback/component/FeedbackBlocksSection";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { useSessionFeedback } from "@/feature/feedback/hook/useSessionFeedback";
import { SessionFeedbackScreen } from "@/feature/feedback/screen/SessionFeedbackScreen";
import { useConversationWithCoach } from "@/feature/message/hook/useConversation";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { pressButton, renderRn } from "@/test/render";
import { storedItems } from "../../../test/setup";

/**
 * Les sections d'écriture sont remplacées par des ESPIONS : elles ont leurs propres tests, et ce
 * qui s'éprouve ici est ce que l'écran leur DONNE — le décompte qui accompagne le texte, le
 * nettoyage du suivi local une fois le débrief parti, et ce qu'il passe à la barre de réponse.
 *
 * Le suivi local, lui, est le VRAI (`useLocalBlockTracking`, sur l'AsyncStorage du harnais) : c'est son
 * câblage à l'enregistrement que ce fichier doit pouvoir casser (#378).
 */
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "s-1" }) }));
vi.mock("@/feature/feedback/component/FeedbackTextSection", () => ({
  FeedbackTextSection: vi.fn(() => null),
}));
vi.mock("@/feature/feedback/component/FeedbackMediaSection", () => ({
  FeedbackMediaSection: () => null,
}));
vi.mock("@/feature/feedback/component/FeedbackBlocksSection", () => ({
  FeedbackBlocksSection: vi.fn(() => null),
}));
// L'écriture reste la VRAIE : le seul test qui monte la vraie section de texte en a besoin.
vi.mock("@/feature/feedback/hook/useSessionFeedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/feedback/hook/useSessionFeedback")>()),
  useSessionFeedback: vi.fn(),
}));
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({ useFeedbackReply: vi.fn() }));
vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useScheduledSession: vi.fn() }));
vi.mock("@/feature/message/hook/useConversation", () => ({
  useConversationWithCoach: vi.fn(() => ({ data: { id: "c-1" }, isError: false })),
}));
const { currentUser } = vi.hoisted(() => ({
  currentUser: { value: { user: { id: "athlete-1" } } as { user: { id: string } } | null },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: currentUser.value }) },
}));

function detail(overrides: Partial<SessionFeedbackDto> = {}): SessionFeedbackDto {
  return {
    id: "f-1",
    scheduledSessionId: "s-1",
    content: "Bien tenu",
    media: [],
    trackedBlocks: [],
    messages: [],
    ...overrides,
  } as SessionFeedbackDto;
}

const COACH_REPLY = {
  id: "m-1",
  senderId: "coach-1",
  type: "TEXT",
  content: "Bien joué, on garde cette voie",
  media: null,
  attachment: null,
  createdAt: "2026-10-16T19:42:00.000Z",
} as MessageDto;

const BLOCK_KEY = "cimavia-block-tracking:s-1";

// Trois blocs, aucun suivi côté serveur.
const SESSION = blockSession();

/** Une case du premier bloc : son exercice `a1`, au rang voulu. */
const check = (row: number) => ({ key: "a1", row });

function mockSession(data: ScheduledSessionDto | null): void {
  vi.mocked(useScheduledSession).mockReturnValue({ data } as unknown as ReturnType<
    typeof useScheduledSession
  >);
}

// Ce que l'écran a donné, au dernier rendu, à la section qui enregistre le texte.
function textSectionProps() {
  const props = vi.mocked(FeedbackTextSection).mock.lastCall?.[0];
  if (props == null) throw new Error("FeedbackTextSection jamais rendue");
  return props;
}

function mockFeedback(state: Record<string, unknown>): void {
  vi.mocked(useSessionFeedback).mockReturnValue({
    data: detail(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useSessionFeedback>);
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` garde les implémentations : la vraie section montée par un test resterait.
  vi.mocked(FeedbackTextSection).mockReset();
  currentUser.value = { user: { id: "athlete-1" } };
  mockFeedback({});
  mockSession(null);
  vi.mocked(useFeedbackReply).mockReturnValue({
    ready: true,
    hasThreadError: false,
    sendText: vi.fn().mockResolvedValue(undefined),
    sending: false,
    pickAndSend: vi.fn().mockResolvedValue([]),
    recordAndSend: vi.fn(),
    mediaBusy: false,
    step: null,
    audioError: null,
  } as unknown as ReturnType<typeof useFeedbackReply>);
});

describe("SessionFeedbackScreen", () => {
  it("montre la réponse du coach sous le formulaire", () => {
    mockFeedback({ data: detail({ messages: [COACH_REPLY] }) });
    const { queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("Bien joué, on garde cette voie")).not.toBeNull();
  });

  /**
   * Rien tant que le débrief n'existe pas : on ne répond pas à ce qu'on n'a pas encore écrit, et
   * une barre d'envoi posée là n'aurait aucun débrief à citer.
   */
  it("ne propose pas de répondre avant que le débrief existe", () => {
    mockFeedback({ data: null });
    const { queryByPlaceholderText, queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("feedback.reply.title")).toBeNull();
    expect(queryByPlaceholderText("messages.placeholder")).toBeNull();
  });

  it("propose de répondre dès que le débrief existe", () => {
    const { queryByPlaceholderText } = renderRn(<SessionFeedbackScreen />);
    expect(queryByPlaceholderText("messages.placeholder")).not.toBeNull();
  });

  it("n'affirme rien tant que le débrief charge", () => {
    mockFeedback({ data: undefined, isPending: true });
    const { container, queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(queryByText("feedback.title")).toBeNull();
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("offre de réessayer après une panne", () => {
    const refetch = vi.fn();
    mockFeedback({ data: undefined, isError: true, refetch });
    const { container } = renderRn(<SessionFeedbackScreen />);

    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["sans la séance", null],
    ["séance chargée", SESSION],
  ])("part d'un champ vide quand aucun débrief n'est servi, %s", (_, data) => {
    mockSession(data);
    mockFeedback({ data: undefined });
    renderRn(<SessionFeedbackScreen />);

    expect(textSectionProps().feedback).toBeNull();
  });

  /** Session pas encore résolue : la réponse du coach se lit quand même, rangée chez l'autre. */
  it("rend la réponse du coach tant que la session se résout", () => {
    currentUser.value = null;
    mockFeedback({ data: detail({ messages: [COACH_REPLY] }) });
    const { queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("Bien joué, on garde cette voie")).not.toBeNull();
  });

  /** SON débrief, pas la boîte du coach : c'est là que la réponse doit réapparaître. */
  it("recharge son propre débrief après une réponse", () => {
    const { queryClient } = renderRn(<SessionFeedbackScreen />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    void vi.mocked(useFeedbackReply).mock.lastCall?.[0].onSent?.();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: myFeedbackKeys.detail("s-1") });
  });

  /**
   * Le fil du coach DE CETTE SÉANCE (#599) : suivi par plusieurs coachs, l'athlète répond à celui
   * qui l'a programmée — et à personne tant que la séance ne l'a pas dit.
   */
  it("répond dans le fil du coach qui a programmé la séance", () => {
    renderRn(<SessionFeedbackScreen />);
    expect(useConversationWithCoach).toHaveBeenLastCalledWith(null);

    mockSession({ ...SESSION, coachId: "coach-1" } as ScheduledSessionDto);
    renderRn(<SessionFeedbackScreen />);
    expect(useConversationWithCoach).toHaveBeenLastCalledWith("coach-1");
  });

  // Une séance qu'il s'est programmée lui-même : le fil `(soi, soi)` n'existe pas, rien ne part.
  it("dit qu'il n'y a personne à qui répondre sur une séance auto-coachée", () => {
    mockSession({ ...SESSION, coachId: "athlete-1" } as ScheduledSessionDto);
    const { queryByPlaceholderText, queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(useConversationWithCoach).toHaveBeenLastCalledWith(null);
    expect(queryByText("feedback.reply.self")).not.toBeNull();
    expect(queryByPlaceholderText("messages.placeholder")).toBeNull();
  });

  it("montre l'erreur de chargement plutôt que le formulaire", () => {
    mockFeedback({ data: undefined, isError: true });
    const { queryByText } = renderRn(<SessionFeedbackScreen />);

    expect(queryByText("feedback.title")).toBeNull();
  });
});

/**
 * Le décompte se rappelle et part bloc par bloc (#722) : il accompagne le texte, dans le même
 * enregistrement.
 */
describe("SessionFeedbackScreen — le décompte accompagne le texte", () => {
  const checked = { "blk-1": { checked: [check(0)] } };

  it("sans séance chargée, le texte part SEUL : aucun décompte, plutôt qu'un objet vide", () => {
    renderRn(<SessionFeedbackScreen />);

    expect(FeedbackBlocksSection).not.toHaveBeenCalled();
    expect(textSectionProps()).not.toHaveProperty("blockTracking");
  });

  /**
   * Séance en retard ou en panne (réseau coupé), l'athlète écrit quand même : quand elle arrive
   * enfin, le champ ne doit pas être remonté ailleurs — ce qui effaçait sa frappe.
   */
  it("garde la frappe quand la séance arrive après coup", async () => {
    const actual = await vi.importActual<
      typeof import("@/feature/feedback/component/FeedbackTextSection")
    >("@/feature/feedback/component/FeedbackTextSection");
    vi.mocked(FeedbackTextSection).mockImplementation(actual.FeedbackTextSection);
    mockFeedback({ data: null });
    const { container, rerender } = renderRn(<SessionFeedbackScreen />);
    const field = container.querySelector("textarea");
    if (field == null) throw new Error("champ introuvable");
    fireEvent.change(field, { target: { value: "Doigts cuits" } });

    mockSession(SESSION);
    rerender(<SessionFeedbackScreen />);

    expect(FeedbackBlocksSection).toHaveBeenCalled();
    expect(container.querySelector("textarea")?.value).toBe("Doigts cuits");
  });

  it("rappelle les blocs, et envoie leur suivi avec le texte", () => {
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);

    expect(FeedbackBlocksSection).toHaveBeenCalled();
    // Rien en local : le suivi envoyé EST celui du serveur, aucun bloc suivi.
    expect(textSectionProps()).toMatchObject({
      blockTracking: { "blk-1": null, "blk-2": null, "blk-3": null },
      trackingDirty: false,
    });
  });

  /**
   * Une coche prise pendant la séance sur un bloc que le coach a retiré depuis : le serveur
   * refuserait TOUT le débrief (#311). Elle reste sur l'appareil, mais ne part pas (#490).
   */
  it("n'envoie pas le suivi d'un bloc que le coach a retiré depuis", async () => {
    storedItems.set(
      BLOCK_KEY,
      JSON.stringify({ ...checked, "blk-retire": { checked: [{ key: "z1", row: 0 }] } }),
    );
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);

    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    expect(textSectionProps().blockTracking).toEqual(checked);
  });

  it("une coche posée dans le débrief part au prochain envoi", async () => {
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);

    const props = vi.mocked(FeedbackBlocksSection).mock.lastCall?.[0];
    act(() => props?.onToggle("blk-1", check(0)));

    await waitFor(() => expect(textSectionProps().blockTracking).toMatchObject(checked));
    expect(textSectionProps().trackingDirty).toBe(true);
  });

  it("une fois le débrief enregistré, le suivi local est effacé du disque", async () => {
    storedItems.set(BLOCK_KEY, JSON.stringify(checked));
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));

    act(() => textSectionProps().onSaved?.(textSectionProps().blockTracking));

    // Le local a fait son travail : le garder ferait diverger les deux copies au prochain
    // chargement. L'écran redevient le miroir du serveur.
    expect(storedItems.has(BLOCK_KEY)).toBe(false);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(false));
  });

  // Les cases restent actives pendant l'envoi : ce qui est coché entre-temps n'est pas parti (#499).
  it("une coche posée pendant l'envoi reste en local, à envoyer", async () => {
    storedItems.set(BLOCK_KEY, JSON.stringify(checked));
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    const sent = textSectionProps().blockTracking;

    const props = vi.mocked(FeedbackBlocksSection).mock.lastCall?.[0];
    act(() => props?.onToggle("blk-1", check(1)));
    act(() => textSectionProps().onSaved?.(sent));

    expect(JSON.parse(storedItems.get(BLOCK_KEY) ?? "null")["blk-1"]).toEqual({
      checked: [check(0), check(1)],
    });
    expect(textSectionProps().trackingDirty).toBe(true);
  });
});

/**
 * L'écran de séance reste monté SOUS le débrief, sur la même pile (#346). Il est figuré ici par
 * sa lecture du suivi : le même hook, sur la même séance, avec le même distant.
 */
describe("SessionFeedbackScreen — l'écran de séance resté dessous", () => {
  async function sessionUnderneath() {
    const { result } = renderHook(() => useLocalBlockTracking("s-1", SESSION.blocks));
    // Deux séries cochées sur la séance, avant d'ouvrir le débrief.
    act(() => {
      result.current.toggle("blk-1", check(0));
      result.current.toggle("blk-1", check(1));
    });
    mockSession(SESSION);
    renderRn(<SessionFeedbackScreen />);
    await waitFor(() => expect(textSectionProps().trackingDirty).toBe(true));
    return result;
  }

  // Le débrief corrige : sa section de décompte coche la série suivante.
  function correctInFeedback() {
    const props = vi.mocked(FeedbackBlocksSection).mock.lastCall?.[0];
    act(() => props?.onToggle("blk-1", check(2)));
  }

  it("de retour sur la séance, la correction du débrief s'y voit", async () => {
    const session = await sessionUnderneath();

    correctInFeedback();

    expect(session.current.tracking["blk-1"]).toEqual({ checked: [check(0), check(1), check(2)] });
  });

  it("une coche sur la séance part de la correction, pas de l'ancien décompte", async () => {
    const session = await sessionUnderneath();
    correctInFeedback();

    act(() => session.current.toggle("blk-1", check(3)));

    expect(JSON.parse(storedItems.get(BLOCK_KEY) ?? "null")["blk-1"]).toEqual({
      checked: [check(0), check(1), check(2), check(3)],
    });
  });

  it("une fois le débrief enregistré, la séance redevient le miroir du serveur", async () => {
    const session = await sessionUnderneath();
    correctInFeedback();

    act(() => textSectionProps().onSaved?.(textSectionProps().blockTracking));
    expect(session.current.dirty).toBe(false);

    // La coche suivante part du serveur : l'ancien décompte local ne ressuscite pas.
    act(() => session.current.toggle("blk-1", check(1)));
    expect(JSON.parse(storedItems.get(BLOCK_KEY) ?? "null")["blk-1"]).toEqual({
      checked: [check(1)],
    });
  });
});
