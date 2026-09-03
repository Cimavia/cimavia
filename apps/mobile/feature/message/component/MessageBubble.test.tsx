import { MessageAttachmentType, type MessageDto } from "@cmv/shared";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { press, renderRn } from "@/test/render";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/shared/hook/useExercisedCapability", () => ({ useActingCapability: vi.fn() }));

/**
 * En `cimode`, i18next rend la CLÉ : la puce s'affirme donc sur la clé choisie, pas sur le
 * français du catalogue — qui peut être reformulé sans qu'aucune régression n'ait eu lieu.
 */
const SESSION_LABEL = "messages.attachment.session";
const FEEDBACK_LABEL = "messages.attachment.feedback";

function message(attachment: MessageDto["attachment"]): MessageDto {
  return {
    id: "m-1",
    senderId: "coach-1",
    type: "TEXT",
    content: "bien joué",
    readAt: null,
    attachment,
    createdAt: new Date().toISOString(),
  } as MessageDto;
}

const sessionAttachment = {
  type: MessageAttachmentType.SCHEDULED_SESSION,
  id: "s1",
  scheduledSessionId: "s1",
  sessionTitle: "Voie & projet 7b",
  scheduledDate: "2026-10-16",
};

const feedbackAttachment = {
  ...sessionAttachment,
  type: MessageAttachmentType.SESSION_FEEDBACK,
  id: "f1",
};

beforeEach(() => {
  vi.mocked(router.push).mockClear();
});

describe("MessageBubble — la puce « à propos de… »", () => {
  it("ne rend aucune puce sur un message qui ne porte sur rien", () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { queryByText } = renderRn(<MessageBubble message={message(null)} mine={false} />);

    expect(queryByText(SESSION_LABEL)).toBeNull();
    expect(queryByText(FEEDBACK_LABEL)).toBeNull();
  });

  it("mène l'athlète à la séance citée", () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { getByText } = renderRn(
      <MessageBubble message={message(sessionAttachment)} mine={false} />,
    );

    press(getByText(SESSION_LABEL));
    expect(router.push).toHaveBeenCalledWith("/session/s1");
  });

  it("mène l'athlète à son débrief quand c'est lui qui est cité", () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { getByText } = renderRn(
      <MessageBubble message={message(feedbackAttachment)} mine={false} />,
    );

    press(getByText(FEEDBACK_LABEL));
    expect(router.push).toHaveBeenCalledWith("/session/s1/feedback");
  });

  /**
   * Le cas qui compte : c'est l'athlète qui cite une séance, et c'est le coach qui lit ce message.
   * Il n'existe aucune page de séance côté coach — l'y envoyer serait un cul-de-sac, alors que le
   * débrief est l'endroit où il a quelque chose à en faire.
   */
  it("mène le coach au débrief, même quand c'est une séance qui est citée", () => {
    vi.mocked(useActingCapability).mockReturnValue("coach");
    const { getByText } = renderRn(
      <MessageBubble message={message(sessionAttachment)} mine={false} />,
    );

    press(getByText(SESSION_LABEL));
    expect(router.push).toHaveBeenCalledWith("/feedbacks/s1");
  });
});

/**
 * Le branchement média est EXHAUSTIF, et pas « audio d'un côté, tout le reste en image » : c'est
 * ce genre de raccourci qui rendait une vidéo par une balise image — un bloc vide, sans erreur ni
 * indice, là où l'athlète avait déposé sa voie (#151).
 */
describe("MessageBubble — les médias", () => {
  const media = {
    url: "https://x/f",
    fileName: "voie.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1,
    durationSeconds: 12,
  };

  function renderMedia(type: MessageDto["type"]) {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const dto = { ...message(null), type, content: null, media } as MessageDto;
    return renderRn(<MessageBubble message={dto} mine={false} />);
  }

  it("ne rend pas le texte d'un média", () => {
    expect(renderMedia("AUDIO").queryByText("bien joué")).toBeNull();
    expect(renderMedia("VIDEO").queryByText("bien joué")).toBeNull();
    expect(renderMedia("IMAGE").queryByText("bien joué")).toBeNull();
  });

  it("rend une photo par une image", () => {
    const { container } = renderMedia("IMAGE");
    expect(container.querySelector("img")).not.toBeNull();
  });
});
