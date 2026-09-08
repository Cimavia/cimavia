import { MessageAttachmentType, type MessageDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/shared/hook/useCapabilities", () => ({ useActingCapability: vi.fn() }));

/**
 * En `cimode`, i18next rend la CLÉ : la puce s'affirme donc sur la clé choisie, pas sur le
 * français du catalogue — qui peut être reformulé sans qu'aucune régression n'ait eu lieu.
 */
const SESSION_LABEL = "messages.attachment.session";
const FEEDBACK_LABEL = "messages.attachment.feedback";

// Toutes les destinations possibles de la puce : sans elles, le routeur ne résout pas le lien.
const LINKS = ["/sessions/$sessionId", "/sessions/$sessionId/feedback", "/feedbacks"];

function message(attachment: MessageDto["attachment"]): MessageDto {
  return {
    id: "m-1",
    conversationId: "c-1",
    senderId: "coach-1",
    type: "TEXT",
    content: "bien joué",
    media: null,
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

function renderBubble(attachment: MessageDto["attachment"], hideAttachment = false) {
  return renderInRoute(
    <MessageBubble message={message(attachment)} mine={false} hideAttachment={hideAttachment} />,
    { path: "/messages", links: LINKS },
  );
}

describe("MessageBubble — la puce « à propos de… »", () => {
  it("ne rend aucune puce sur un message qui ne porte sur rien", async () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { queryByText } = await renderBubble(null);

    expect(queryByText(SESSION_LABEL)).toBeNull();
    expect(queryByText(FEEDBACK_LABEL)).toBeNull();
  });

  it("mène l'athlète à la séance citée", async () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { getByText } = await renderBubble(sessionAttachment);

    expect(getByText(SESSION_LABEL).closest("a")).toHaveAttribute("href", "/sessions/s1");
  });

  it("mène l'athlète à son débrief quand c'est lui qui est cité", async () => {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const { getByText } = await renderBubble(feedbackAttachment);

    expect(getByText(FEEDBACK_LABEL).closest("a")).toHaveAttribute("href", "/sessions/s1/feedback");
  });

  /**
   * Le cas qui compte : c'est l'athlète qui cite une séance, et c'est le coach qui lit ce message.
   * Il n'existe aucune page de séance côté coach — l'y envoyer serait un cul-de-sac, alors que le
   * débrief est l'endroit où il a quelque chose à en faire. D'où l'adressage PAR LA SÉANCE.
   */
  it("mène le coach au débrief, même quand c'est une séance qui est citée", async () => {
    vi.mocked(useActingCapability).mockReturnValue("coach");
    const { getByText } = await renderBubble(sessionAttachment);

    expect(getByText(SESSION_LABEL).closest("a")).toHaveAttribute("href", "/feedbacks?session=s1");
  });

  /**
   * Dans un débrief, toutes les bulles pointent CE débrief : la puce y répéterait à chaque ligne
   * l'adresse de la page où l'on se trouve déjà.
   */
  it("tait la puce sur la surface qu'elle citerait", async () => {
    vi.mocked(useActingCapability).mockReturnValue("coach");
    const { queryByText } = await renderBubble(feedbackAttachment, true);

    expect(queryByText(FEEDBACK_LABEL)).toBeNull();
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
    durationSeconds: null,
  };

  function renderMedia(type: MessageDto["type"]) {
    vi.mocked(useActingCapability).mockReturnValue("athlete");
    const dto = { ...message(null), type, content: null, media } as MessageDto;
    return renderInRoute(<MessageBubble message={dto} mine={false} />, {
      path: "/messages",
      links: LINKS,
    });
  }

  it("rend une note vocale dans un lecteur audio", async () => {
    const { container } = await renderMedia("AUDIO");
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("rend une vidéo dans un lecteur vidéo", async () => {
    const { container } = await renderMedia("VIDEO");
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("rend une photo, et ni audio ni vidéo", async () => {
    const { container } = await renderMedia("IMAGE");
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });
});

/**
 * Un avis n'est pas une parole : le serveur le pose. Ce qui s'éprouve ici est qu'il ne se DÉGUISE
 * pas en message — ni bulle alignée, ni couleur d'auteur — tout en gardant le lien qui est sa seule
 * raison d'être.
 */
describe("MessageBubble — les avis de débrief", () => {
  function renderNotice(type: MessageDto["type"], mine: boolean) {
    vi.mocked(useActingCapability).mockReturnValue("coach");
    const dto = {
      ...message(feedbackAttachment),
      type,
      content: null,
      media: null,
    } as MessageDto;
    return renderInRoute(<MessageBubble message={dto} mine={mine} />, {
      path: "/messages",
      links: LINKS,
    });
  }

  it("dit ce qui s'est passé, et mène au débrief", async () => {
    const { queryByText } = await renderNotice("FEEDBACK_CREATED", false);

    expect(queryByText("messages.feedback.created")).not.toBeNull();
    expect(queryByText(FEEDBACK_LABEL)).not.toBeNull();
  });

  it("distingue un dépôt d'un complément", async () => {
    const { queryByText } = await renderNotice("FEEDBACK_UPDATED", false);

    expect(queryByText("messages.feedback.updated")).not.toBeNull();
    expect(queryByText("messages.feedback.created")).toBeNull();
  });

  /**
   * `mine` ne doit RIEN changer : un avis se rend au centre quel que soit le lecteur. Aligné à
   * droite chez l'athlète, « Débrief déposé » se lirait comme une phrase qu'il aurait tapée.
   */
  it("se rend au centre, que le lecteur soit l'auteur du geste ou non", async () => {
    const auteur = await renderNotice("FEEDBACK_CREATED", true);
    const lecteur = await renderNotice("FEEDBACK_CREATED", false);

    expect(auteur.container.querySelector(".self-center")).not.toBeNull();
    expect(lecteur.container.querySelector(".self-center")).not.toBeNull();
    expect(auteur.container.querySelector(".self-end")).toBeNull();
  });
});
