import type {
  CoachFeedbackSummaryDto,
  MessageDto,
  SessionFeedbackDto,
  VoiceNoteCue,
} from "@cmv/shared";
import { coachFeedbackKeys } from "@cmv/shared";
import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCoachFeedbackDetail,
  useCoachFeedbacks,
  useMarkFeedbackRead,
} from "@/feature/feedback/hook/useCoachFeedbacks";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { CoachFeedbackDetailScreen } from "@/feature/feedback/screen/CoachFeedbackDetailScreen";
import { CmvButton, type RecordedAudio } from "@/shared/component";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les hooks de données sont remplacés : leur transport a ses propres tests. Ce qui s'éprouve ICI
 * est ce que l'écran DÉCIDE — quel état il montre, quand il marque lu, et ce qu'il donne à la
 * barre de réponse.
 */
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ sessionId: "s-1" }) }));
vi.mock("@/feature/feedback/hook/useCoachFeedbacks", () => ({
  useCoachFeedbackDetail: vi.fn(),
  useCoachFeedbacks: vi.fn(),
  useMarkFeedbackRead: vi.fn(),
}));
vi.mock("@/feature/feedback/hook/useFeedbackReply", () => ({ useFeedbackReply: vi.fn() }));
const { freshUrl, session, cues } = vi.hoisted(() => ({
  freshUrl: vi.fn(() => Promise.resolve(null)),
  session: { current: { user: { id: "coach-1" } } as { user: { id: string } } | null },
  // Ce que chaque lecteur a reçu de sa liste pour s'enchaîner (#529), par URL.
  cues: new Map<string, VoiceNoteCue | undefined>(),
}));
vi.mock("@/shared/hook/useFreshMediaUrl", () => ({ useFreshMediaUrl: () => freshUrl }));
vi.mock("@/feature/message/hook/useConversation", () => ({
  useConversationWith: () => ({ data: { id: "c-1" }, isError: false }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.current }) },
}));

/**
 * `CmvAudioRecorder` est remplacé : le vrai a besoin d'un micro, et `onRecorded` serait hors
 * d'atteinte sous un runtime sans pont natif. Même raison que dans `ConversationThread.test`.
 *
 * Les trois lecteurs aussi : ils ont leurs tests, et ce que l'écran décide est LEQUEL il monte pour
 * quel média (#151) — et à qui il demande une url fraîche. Chaque double dit son type, relaie la
 * demande d'url d'un tap, et garde ce que sa liste lui dit pour l'enchaîner (#529).
 */
vi.mock("@/shared/component", async (importOriginal) => {
  const player =
    (kind: string) =>
    ({
      url,
      resolveUrl,
      cue,
    }: Readonly<{ url?: string; resolveUrl?: () => void; cue?: VoiceNoteCue }>) => {
      if (url != null) cues.set(url, cue);
      return (
        <button type="button" data-player={kind} onClick={() => resolveUrl?.()}>
          {url}
        </button>
      );
    };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    CmvAudioPlayer: player("audio"),
    CmvVideoPlayer: player("video"),
    CmvImageViewer: player("photo"),
    CmvAudioRecorder: ({ onRecorded }: { onRecorded: (audio: RecordedAudio) => void }) => (
      <CmvButton
        label="enregistrer"
        onPress={() => onRecorded({ uri: "file:///note.m4a", durationSeconds: 3 })}
      />
    ),
  };
});

const markRead = vi.fn();
const sendText = vi.fn();

const SUMMARY = {
  id: "f-1",
  scheduledSessionId: "s-1",
  athleteId: "a-1",
  athleteName: "Léa Moreau",
  sessionTitle: "Voie & projet 7b",
  scheduledDate: "2026-10-16",
  coachReadAt: null,
  repliedAt: null,
} as CoachFeedbackSummaryDto;

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: "m-1",
    senderId: "coach-1",
    type: "TEXT",
    content: "Bien joué",
    media: null,
    attachment: null,
    readAt: null,
    createdAt: "2026-10-16T19:42:00.000Z",
    ...overrides,
  } as MessageDto;
}

function detail(overrides: Partial<SessionFeedbackDto> = {}): SessionFeedbackDto {
  return {
    id: "f-1",
    scheduledSessionId: "s-1",
    content: "Bien tenu sur les deux premières voies",
    media: [],
    trackedExercises: [],
    messages: [],
    ...overrides,
  } as SessionFeedbackDto;
}

function mockDetail(state: Record<string, unknown>): void {
  vi.mocked(useCoachFeedbackDetail).mockReturnValue({
    data: detail(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useCoachFeedbackDetail>);
}

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { id: "coach-1" } };
  mockDetail({});
  vi.mocked(useCoachFeedbacks).mockReturnValue({ data: [SUMMARY] } as unknown as ReturnType<
    typeof useCoachFeedbacks
  >);
  vi.mocked(useMarkFeedbackRead).mockReturnValue({ mutate: markRead } as unknown as ReturnType<
    typeof useMarkFeedbackRead
  >);
  vi.mocked(useFeedbackReply).mockReturnValue({
    ready: true,
    hasThreadError: false,
    sendText,
    sending: false,
    pickAndSend: vi.fn().mockResolvedValue([]),
    recordAndSend: vi.fn(),
    mediaBusy: false,
    step: null,
    audioError: null,
  } as unknown as ReturnType<typeof useFeedbackReply>);
});

describe("CoachFeedbackDetailScreen", () => {
  it("nomme l'athlète et sa séance depuis le résumé", () => {
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("Léa Moreau")).not.toBeNull();
    expect(queryByText("Bien tenu sur les deux premières voies")).not.toBeNull();
  });

  // Marqué lu À L'OUVERTURE : c'est le geste qui vaut lecture, et c'est ce qui vide la tuile
  // « à relire » du tableau de bord.
  it("marque le débrief lu en l'ouvrant", () => {
    renderRn(<CoachFeedbackDetailScreen />);
    expect(markRead).toHaveBeenCalledWith("f-1");
  });

  it("ne le remarque pas lu s'il l'est déjà", () => {
    vi.mocked(useCoachFeedbacks).mockReturnValue({
      data: [{ ...SUMMARY, coachReadAt: "2026-10-16T20:00:00.000Z" }],
    } as unknown as ReturnType<typeof useCoachFeedbacks>);

    renderRn(<CoachFeedbackDetailScreen />);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("rend les réponses déjà envoyées", () => {
    mockDetail({ data: detail({ messages: [message()] }) });
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("Bien joué")).not.toBeNull();
  });

  /**
   * `null` = débrief sans texte, ce qui est légitime : un débrief peut n'être que des médias. On
   * le DIT, plutôt que de laisser un blanc qui ressemblerait à un chargement.
   */
  it("dit qu'un débrief sans texte n'a que des médias", () => {
    mockDetail({ data: detail({ content: null }) });
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("feedback.coach.mediaOnly")).not.toBeNull();
  });

  it("envoie la réponse écrite dans la barre", () => {
    const { container } = renderRn(<CoachFeedbackDetailScreen />);

    const field = container.querySelector("textarea, input");
    if (field == null) throw new Error("champ de saisie introuvable");
    fireEvent.change(field, { target: { value: "Reçu" } });
    // Le bouton d'envoi n'a pas de libellé : c'est une icône, comme dans la messagerie.
    const send = container.querySelector('[data-icon="send"]')?.parentElement;
    if (send == null) throw new Error("bouton d'envoi introuvable");
    press(send);

    expect(sendText).toHaveBeenCalledWith("Reçu");
  });

  // L'échec de RÉSOLUTION du fil ne vient pas de ce qu'on a écrit : le masquer laisserait croire
  // qu'on n'a pas le droit de répondre à cet athlète.
  it("dit qu'il n'a pas pu ouvrir la conversation", () => {
    vi.mocked(useFeedbackReply).mockReturnValue({
      ready: false,
      hasThreadError: true,
      sendText,
      sending: false,
      pickAndSend: vi.fn().mockResolvedValue([]),
      recordAndSend: vi.fn(),
      mediaBusy: false,
      step: null,
      audioError: null,
    } as unknown as ReturnType<typeof useFeedbackReply>);

    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);
    expect(queryByText("feedback.reply.threadError")).not.toBeNull();
  });

  it("montre l'erreur de chargement plutôt que le débrief", () => {
    mockDetail({ data: undefined, isError: true });
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("Bien tenu sur les deux premières voies")).toBeNull();
  });

  /**
   * Trois provenances d'échec média, trois traitements, et aucune ne se masque : un refus métier
   * porte sa clé i18n, une panne technique garde le message de l'API, un refus de permission
   * précède l'envoi et arrive à la main.
   */
  it("dit l'échec d'une note vocale", () => {
    vi.mocked(useFeedbackReply).mockReturnValue({
      ready: true,
      hasThreadError: false,
      sendText,
      sending: false,
      pickAndSend: vi.fn().mockResolvedValue([]),
      recordAndSend: vi.fn(),
      mediaBusy: false,
      step: null,
      audioError: new Error("boom"),
    } as unknown as ReturnType<typeof useFeedbackReply>);

    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);
    expect(queryByText("messages.media.uploadError")).not.toBeNull();
  });

  it("ouvre la galerie et rend compte de ce qui n'est pas parti", async () => {
    const pickAndSend = vi
      .fn()
      .mockResolvedValue([
        { id: 1, fileName: "voie.mp4", reason: { key: "messages.media.tooMany", params: {} } },
      ]);
    vi.mocked(useFeedbackReply).mockReturnValue({
      ready: true,
      hasThreadError: false,
      sendText,
      sending: false,
      pickAndSend,
      recordAndSend: vi.fn(),
      mediaBusy: false,
      step: null,
      audioError: null,
    } as unknown as ReturnType<typeof useFeedbackReply>);

    const { container, findByText } = renderRn(<CoachFeedbackDetailScreen />);
    const add = container.querySelector('[data-icon="add-circle-outline"]')?.parentElement;
    if (add == null) throw new Error("bouton de pièce jointe introuvable");
    press(add);

    expect(pickAndSend).toHaveBeenCalled();
    // Une ligne PAR fichier : « 2 sur 5 n'ont pas pu partir » ne dirait pas lesquels.
    expect(await findByText(/voie\.mp4/)).not.toBeNull();
  });

  it("nomme quand même, dans le compte rendu, un fichier qui n'a pas de nom", async () => {
    const pickAndSend = vi
      .fn()
      .mockResolvedValue([
        { id: 1, fileName: null, reason: { key: "messages.media.tooMany", params: {} } },
      ]);
    vi.mocked(useFeedbackReply).mockReturnValue({
      ready: true,
      hasThreadError: false,
      sendText,
      sending: false,
      pickAndSend,
      recordAndSend: vi.fn(),
      mediaBusy: false,
      step: null,
      audioError: null,
    } as unknown as ReturnType<typeof useFeedbackReply>);

    const { container, findByText } = renderRn(<CoachFeedbackDetailScreen />);
    press(
      container.querySelector('[data-icon="add-circle-outline"]')?.parentElement as HTMLElement,
    );

    expect(await findByText(/messages\.media\.unnamedFile/)).not.toBeNull();
  });

  // Le coach répond EN VOCAL depuis le débrief : c'est le geste naturel sur un téléphone, et il a
  // été demandé en bêta.
  it("envoie la note vocale enregistrée", () => {
    const recordAndSend = vi.fn();
    vi.mocked(useFeedbackReply).mockReturnValue({
      ready: true,
      hasThreadError: false,
      sendText,
      sending: false,
      pickAndSend: vi.fn().mockResolvedValue([]),
      recordAndSend,
      mediaBusy: false,
      step: null,
      audioError: null,
    } as unknown as ReturnType<typeof useFeedbackReply>);

    const { container } = renderRn(<CoachFeedbackDetailScreen />);
    pressButton(container, "enregistrer");

    expect(recordAndSend).toHaveBeenCalledWith({ uri: "file:///note.m4a", durationSeconds: 3 });
  });
});

describe("CoachFeedbackDetailScreen — ce qui manque", () => {
  it("n'affirme rien tant que le débrief charge", () => {
    mockDetail({ data: undefined, isPending: true });
    const { container, queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(queryByText("feedback.coach.mediaOnly")).toBeNull();
  });

  /** Écran testé en panne 500, jamais en 401 : la session expirée a son propre chemin (#439). */
  it("offre de réessayer après une panne", () => {
    const refetch = vi.fn();
    mockDetail({ data: undefined, isError: true, refetch });
    const { container } = renderRn(<CoachFeedbackDetailScreen />);

    pressButton(container, "common.retry");

    expect(refetch).toHaveBeenCalledOnce();
  });

  /** Arrivé par une notification, la liste n'est pas en cache : « — », et rien à marquer lu. */
  it("marque l'absence de l'athlète et de la séance tant que le résumé manque", () => {
    vi.mocked(useCoachFeedbacks).mockReturnValue({ data: undefined } as unknown as ReturnType<
      typeof useCoachFeedbacks
    >);
    const { getAllByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(getAllByText("—")).toHaveLength(2);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("ne marque rien lu quand le résumé ne porte pas cette séance", () => {
    vi.mocked(useCoachFeedbacks).mockReturnValue({
      data: [{ ...SUMMARY, scheduledSessionId: "autre" }],
    } as unknown as ReturnType<typeof useCoachFeedbacks>);

    renderRn(<CoachFeedbackDetailScreen />);

    expect(markRead).not.toHaveBeenCalled();
  });

  it("dit qu'il n'y a que des médias quand le débrief n'est pas servi", () => {
    mockDetail({ data: null });
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("feedback.coach.mediaOnly")).not.toBeNull();
    expect(queryByText("feedback.detail.tracking")).toBeNull();
  });

  /** Session pas encore résolue : rien n'est rangé « à soi » — au pire un aller-retour de plus. */
  it("garde la barre de réponse tant que la session se résout", () => {
    session.current = null;
    const { container, queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("feedback.reply.self")).toBeNull();
    expect(container.querySelector('[data-icon="add-circle-outline"]')).not.toBeNull();
  });
});

/**
 * Le coach qui s'entraîne lui-même lit son propre débrief (#198) : répondre serait s'écrire, et la
 * requête du fil prendrait un 409 affiché en panne passagère.
 */
describe("CoachFeedbackDetailScreen — son propre débrief", () => {
  beforeEach(() => {
    vi.mocked(useCoachFeedbacks).mockReturnValue({
      data: [{ ...SUMMARY, athleteId: "coach-1" }],
    } as unknown as ReturnType<typeof useCoachFeedbacks>);
  });

  it("garde le titre de la réponse, dit pourquoi il n'y en a pas, et retire la barre", () => {
    const { container, queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("feedback.reply.title")).not.toBeNull();
    expect(queryByText("feedback.reply.self")).not.toBeNull();
    expect(container.querySelector('[data-icon="add-circle-outline"]')).toBeNull();
  });
});

describe("CoachFeedbackDetailScreen — le décompte", () => {
  const tracked = (
    exerciseId: string,
    state: "DONE" | "PARTIAL" | "UNTRACKED",
    unit: "SET" | null = "SET",
  ) => ({ exerciseId, title: `Exercice ${exerciseId}`, state, done: 2, total: 4, unit });

  it("rend chaque exercice suivi, et dit « pas de décompte » sur celui qui ne l'est pas", () => {
    mockDetail({
      data: detail({
        trackedExercises: [
          tracked("fini", "DONE"),
          tracked("entamé", "PARTIAL"),
          tracked("muet", "UNTRACKED"),
        ],
      } as never),
    });
    const { getAllByText, getByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(getByText("feedback.detail.tracking")).toBeTruthy();
    expect(getAllByText("plan.tracking.count.SET")).toHaveLength(2);
    expect(getByText("feedback.tracking.untracked")).toBeTruthy();
  });

  /** Rien de cochable : il n'y a rien à nommer, pas même « pas de décompte ». */
  it("tait l'exercice sans unité, et la section avec lui s'il est seul", () => {
    mockDetail({
      data: detail({ trackedExercises: [tracked("libre", "UNTRACKED", null)] } as never),
    });
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("Exercice libre")).toBeNull();
    expect(queryByText("feedback.detail.tracking")).toBeNull();
  });
});

describe("CoachFeedbackDetailScreen — les médias", () => {
  const media = (id: string, type: "AUDIO" | "VIDEO" | "PHOTO") => ({
    id,
    type,
    url: `https://storage.test/${id}`,
    durationSeconds: type === "PHOTO" ? null : 12,
  });

  /** Un rendu PAR TYPE : une vidéo rendue en image donnait un bloc vide, sans erreur (#151). */
  it("monte le lecteur propre à chaque type", () => {
    mockDetail({
      data: detail({
        media: [media("m-audio", "AUDIO"), media("m-video", "VIDEO"), media("m-photo", "PHOTO")],
      } as never),
    });
    const { container, getByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(getByText("feedback.coach.media")).toBeTruthy();
    const players = Array.from(container.querySelectorAll("[data-player]")).map((node) =>
      node.getAttribute("data-player"),
    );
    expect(players).toEqual(["audio", "video", "photo"]);
  });

  it.each([
    ["audio", "m-audio", "AUDIO"],
    ["video", "m-video", "VIDEO"],
  ] as const)("redemande l'url du média %s par son identifiant", (kind, id, type) => {
    mockDetail({ data: detail({ media: [media(id, type)] } as never) });
    const { container } = renderRn(<CoachFeedbackDetailScreen />);

    press(container.querySelector(`[data-player="${kind}"]`) as HTMLElement);

    expect(freshUrl).toHaveBeenCalledWith(id);
  });

  it("ne pose aucune section sur un débrief sans média", () => {
    const { queryByText } = renderRn(<CoachFeedbackDetailScreen />);

    expect(queryByText("feedback.coach.media")).toBeNull();
  });
});

/**
 * La liste ENTIÈRE est invalidée après une réponse, pas seulement ce débrief : `repliedAt` y vit, et
 * c'est lui qui dira « répondu » sur la ligne qu'on vient de traiter.
 */
describe("CoachFeedbackDetailScreen — après une réponse", () => {
  it("rafraîchit toute la liste des débriefs", () => {
    const { queryClient } = renderRn(<CoachFeedbackDetailScreen />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const options = vi.mocked(useFeedbackReply).mock.calls.at(-1)?.[0];

    void options?.onSent?.();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: coachFeedbackKeys.all });
  });
});

/**
 * Le débrief et ses réponses sont deux listes (#529) : chacune enchaîne ses notes, et la dernière
 * note de l'athlète ne lance pas la réponse du coach.
 */
describe("CoachFeedbackDetailScreen — les notes vocales s'enchaînent (#529)", () => {
  const url = (id: string) => `https://storage.test/${id}`;
  const note = (id: string) => ({ id, type: "AUDIO", url: url(id), durationSeconds: 12 });
  const reply = (id: string) =>
    message({
      id,
      type: "AUDIO",
      content: null,
      media: { url: url(id), durationSeconds: 5 },
    } as never);
  // La fin d'une note, telle que son lecteur l'annonce à la liste.
  const finish = (id: string) => act(() => cues.get(url(id))?.onFinish());
  const isCued = (id: string) => cues.get(url(id))?.cued;

  beforeEach(() => {
    cues.clear();
    mockDetail({
      data: detail({
        media: [note("m-1"), { id: "m-photo", type: "PHOTO", url: url("m-photo") }, note("m-2")],
        messages: [reply("r-1"), reply("r-2")],
      } as never),
    });
  });

  it("passe d'une note du débrief à la suivante, photo sautée", () => {
    renderRn(<CoachFeedbackDetailScreen />);

    finish("m-1");

    expect(isCued("m-2")).toBe(true);
  });

  it("s'arrête à la dernière note du débrief, sans passer aux réponses", () => {
    renderRn(<CoachFeedbackDetailScreen />);

    finish("m-2");

    expect(isCued("r-1")).toBe(false);
  });

  it("enchaîne les réponses vocales entre elles", () => {
    renderRn(<CoachFeedbackDetailScreen />);

    finish("r-1");

    expect(isCued("r-2")).toBe(true);
  });
});
