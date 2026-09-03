import type { CoachFeedbackSummaryDto, MessageDto, SessionFeedbackDto } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
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
vi.mock("@/feature/feedback/hook/useFreshFeedbackMediaUrl", () => ({
  useFreshFeedbackMediaUrl: () => (_id: string, url: string) => Promise.resolve(url),
}));
vi.mock("@/feature/message/hook/useConversation", () => ({
  useConversationWith: () => ({ data: { id: "c-1" }, isError: false }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach-1" } } }) },
}));

/**
 * Seul `CmvAudioRecorder` est remplacé : le vrai a besoin d'un micro, et `onRecorded` serait hors
 * d'atteinte sous un runtime sans pont natif. Même raison que dans `ConversationThread.test`.
 */
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CmvAudioRecorder: ({ onRecorded }: { onRecorded: (audio: RecordedAudio) => void }) => (
    <CmvButton
      label="enregistrer"
      onPress={() => onRecorded({ uri: "file:///note.m4a", durationSeconds: 3 })}
    />
  ),
}));

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
