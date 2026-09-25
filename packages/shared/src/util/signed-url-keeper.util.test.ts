import { describe, expect, it, vi } from "vitest";
import type { FeedbackMediaDto, SessionFeedbackDto } from "../dto/feedback.schema";
import type { MessageDto } from "../dto/message.schema";
import { SIGNED_URL_TTL_SECONDS } from "./signed-url.util";
import {
  createSignedUrlKeeper,
  resolveUsableSignedUrl,
  stabilizeFeedbackUrls,
  stabilizeMessageUrls,
} from "./signed-url-keeper.util";

const T0 = Date.UTC(2026, 8, 25, 12, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;
// Au-delà de la marge de sécurité : l'URL reçue à T0 n'est plus ouvrable.
const EXPIRED = SIGNED_URL_TTL_SECONDS - 30;

// Deux signatures du MÊME fichier ne diffèrent que par leur heure : c'est tout le bug.
const signed = (key: string, seconds: number) => `https://s3/${key}?X-Amz-Date=${seconds}`;

function audioMessage(id: string, url: string): MessageDto {
  return {
    id,
    conversationId: "c1",
    senderId: "u1",
    type: "AUDIO",
    content: null,
    media: { url, fileName: "note.m4a", mimeType: "audio/mp4", sizeBytes: 10, durationSeconds: 90 },
    scheduledSessionId: null,
    sessionFeedbackId: null,
    attachment: null,
    readAt: null,
    createdAt: "2026-09-25T12:00:00.000Z",
  };
}

function textMessage(id: string): MessageDto {
  return { ...audioMessage(id, signed("x", 0)), type: "TEXT", content: "Bravo", media: null };
}

function feedbackMedia(id: string, url: string): FeedbackMediaDto {
  return {
    id,
    type: "IMAGE",
    url,
    fileName: "prise.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 10,
    durationSeconds: null,
    createdAt: "2026-09-25T12:00:00.000Z",
  };
}

function feedback(media: FeedbackMediaDto[], messages: MessageDto[]): SessionFeedbackDto {
  return {
    id: "f1",
    scheduledSessionId: "s1",
    athleteId: "a1",
    content: null,
    coachReadAt: null,
    media,
    trackedExercises: [],
    messages,
    createdAt: "2026-09-25T12:00:00.000Z",
    updatedAt: "2026-09-25T12:00:00.000Z",
  };
}

describe("createSignedUrlKeeper", () => {
  it("rend l'URL reçue la première fois", () => {
    const keeper = createSignedUrlKeeper();
    expect(keeper.keep("m1", signed("a", 0), at(0))).toBe(signed("a", 0));
  });

  it("garde la première URL d'un média tant qu'elle est ouvrable", () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    expect(keeper.keep("m1", signed("a", 10), at(10))).toBe(signed("a", 0));
    expect(keeper.keep("m1", signed("a", EXPIRED - 1), at(EXPIRED - 1))).toBe(signed("a", 0));
  });

  /**
   * Le piège de l'issue : si la table redatait l'URL gardée à chaque réponse, elle la croirait
   * fraîche indéfiniment. Elle doit tomber à l'âge de SA réception, quel que soit le nombre de
   * réponses passées entre-temps.
   */
  it("remplace l'URL gardée à l'âge de sa propre réception, pas de la dernière réponse", () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    keeper.keep("m1", signed("a", 200), at(200));
    expect(keeper.keep("m1", signed("a", EXPIRED), at(EXPIRED))).toBe(signed("a", EXPIRED));
    // … et la nouvelle repart pour un TTL complet.
    expect(keeper.keep("m1", signed("a", EXPIRED + 10), at(EXPIRED + 10))).toBe(
      signed("a", EXPIRED),
    );
  });

  it("tient chaque média séparément", () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    expect(keeper.keep("m2", signed("b", 10), at(10))).toBe(signed("b", 10));
  });

  it("dit l'URL gardée ouvrable, puis plus", () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    expect(keeper.usableUrl("m1", at(EXPIRED - 1))).toBe(signed("a", 0));
    expect(keeper.usableUrl("m1", at(EXPIRED))).toBeNull();
  });

  // Un cache restauré au démarrage : ses URLs ont un âge inconnu, donc on les tient pour mortes.
  it("tient un média inconnu pour périmé", () => {
    expect(createSignedUrlKeeper().usableUrl("m1", at(0))).toBeNull();
  });
});

describe("stabilizeMessageUrls", () => {
  it("rend les messages intacts quand l'URL gardée est la leur", () => {
    const keeper = createSignedUrlKeeper();
    const thread = [audioMessage("m1", signed("a", 0)), textMessage("m2")];
    const result = stabilizeMessageUrls(keeper, thread, at(0));
    expect(result[0]).toBe(thread[0]);
    expect(result[1]).toBe(thread[1]);
  });

  it("remet l'URL gardée dans le message qui arrive re-signé", () => {
    const keeper = createSignedUrlKeeper();
    stabilizeMessageUrls(keeper, [audioMessage("m1", signed("a", 0))], at(0));

    const [message] = stabilizeMessageUrls(keeper, [audioMessage("m1", signed("a", 10))], at(10));
    expect(message?.media?.url).toBe(signed("a", 0));
    // Le reste du média n'est pas touché.
    expect(message?.media?.durationSeconds).toBe(90);
  });
});

describe("stabilizeFeedbackUrls", () => {
  it("laisse passer un débrief absent", () => {
    expect(stabilizeFeedbackUrls(createSignedUrlKeeper(), null, at(0))).toBeNull();
  });

  // Les réponses du débrief portent leurs propres médias, affichés sous lui : la surface oubliée.
  it("stabilise les médias du débrief ET ceux de ses réponses", () => {
    const keeper = createSignedUrlKeeper();
    stabilizeFeedbackUrls(
      keeper,
      feedback([feedbackMedia("fm1", signed("p", 0))], [audioMessage("m1", signed("a", 0))]),
      at(0),
    );

    const again = stabilizeFeedbackUrls(
      keeper,
      feedback([feedbackMedia("fm1", signed("p", 60))], [audioMessage("m1", signed("a", 60))]),
      at(60),
    );
    expect(again?.media[0]?.url).toBe(signed("p", 0));
    expect(again?.messages[0]?.media?.url).toBe(signed("a", 0));
  });

  it("garde l'objet d'un média dont l'URL n'a pas bougé", () => {
    const keeper = createSignedUrlKeeper();
    const item = feedbackMedia("fm1", signed("p", 0));
    expect(stabilizeFeedbackUrls(keeper, feedback([item], []), at(0))?.media[0]).toBe(item);
  });
});

describe("resolveUsableSignedUrl", () => {
  it("rend l'URL gardée sans recharger quand elle est ouvrable", async () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    const refetch = vi.fn(async () => undefined);

    await expect(resolveUsableSignedUrl(keeper, "m1", refetch, () => at(10))).resolves.toBe(
      signed("a", 0),
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("recharge, puis rend l'URL neuve que la réponse a déposée", async () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));
    const now = at(EXPIRED + 5);
    const refetch = vi.fn(async () => keeper.keep("m1", signed("a", EXPIRED + 5), now));

    await expect(resolveUsableSignedUrl(keeper, "m1", refetch, () => now)).resolves.toBe(
      signed("a", EXPIRED + 5),
    );
  });

  // Rechargement raté sans erreur (c'est le comportement de TanStack) : la table n'a pas bougé.
  it("rend null quand le rechargement n'a rien déposé", async () => {
    const keeper = createSignedUrlKeeper();
    keeper.keep("m1", signed("a", 0), at(0));

    await expect(
      resolveUsableSignedUrl(
        keeper,
        "m1",
        async () => undefined,
        () => at(EXPIRED),
      ),
    ).resolves.toBeNull();
  });

  it("rend null quand le rechargement échoue", async () => {
    const refetch = async () => {
      throw new Error("hors réseau");
    };

    await expect(
      resolveUsableSignedUrl(createSignedUrlKeeper(), "m1", refetch, () => at(0)),
    ).resolves.toBeNull();
  });
});
