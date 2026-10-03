import { describe, expect, it, vi } from "vitest";
import { MediaType } from "../dto/feedback.schema";
import { isFeedbackEventMessage, type MessageDto, MessageType } from "../dto/message.schema";
import {
  createVoiceNoteChainHooks,
  createVoiceNoteFocus,
  nextVoiceNoteInFeedback,
  nextVoiceNoteInThread,
} from "./voice-note.util";

const MEDIA = { url: "https://s3.test/x", fileName: "x", mimeType: "x", sizeBytes: 1 };

function media(id: string, type: MediaType) {
  return { id, type };
}

function message(id: string, type: MessageType, senderId = "coach"): MessageDto {
  const withMedia = type !== MessageType.TEXT && !isFeedbackEventMessage(type);
  return {
    id,
    type,
    senderId,
    media: withMedia ? { ...MEDIA, durationSeconds: 10 } : null,
  } as MessageDto;
}

describe("nextVoiceNoteInFeedback", () => {
  it("passe à la note suivante en sautant photos et vidéos", () => {
    const list = [
      media("a1", MediaType.AUDIO),
      media("p1", MediaType.IMAGE),
      media("v1", MediaType.VIDEO),
      media("a2", MediaType.AUDIO),
    ];
    expect(nextVoiceNoteInFeedback(list, "a1")).toBe("a2");
  });

  it("s'arrête à la dernière note, même suivie d'une photo", () => {
    const list = [media("a1", MediaType.AUDIO), media("p1", MediaType.IMAGE)];
    expect(nextVoiceNoteInFeedback(list, "a1")).toBeNull();
  });

  it("ne remonte pas vers une note qui précède", () => {
    const list = [media("a1", MediaType.AUDIO), media("a2", MediaType.AUDIO)];
    expect(nextVoiceNoteInFeedback(list, "a2")).toBeNull();
  });

  it("n'enchaîne pas depuis une note absente de la liste", () => {
    expect(nextVoiceNoteInFeedback([media("a1", MediaType.AUDIO)], "gone")).toBeNull();
  });
});

describe("nextVoiceNoteInThread", () => {
  it("passe au message suivant s'il est vocal, quel que soit son auteur", () => {
    const thread = [
      message("m1", MessageType.AUDIO, "coach"),
      message("m2", MessageType.AUDIO, "athlete"),
    ];
    expect(nextVoiceNoteInThread(thread, "m1")).toBe("m2");
  });

  it.each([
    MessageType.TEXT,
    MessageType.IMAGE,
    MessageType.VIDEO,
    MessageType.FEEDBACK_CREATED,
  ])("s'arrête sur un message %s intercalé, sans sauter à la note d'après", (type) => {
    const thread = [
      message("m1", MessageType.AUDIO),
      message("m2", type),
      message("m3", MessageType.AUDIO),
    ];
    expect(nextVoiceNoteInThread(thread, "m1")).toBeNull();
  });

  it("s'arrête sur une note vocale sans média : il n'y a rien à jouer", () => {
    const empty = { ...message("m2", MessageType.AUDIO), media: null };
    expect(nextVoiceNoteInThread([message("m1", MessageType.AUDIO), empty], "m1")).toBeNull();
  });

  it("s'arrête au dernier message du fil", () => {
    expect(nextVoiceNoteInThread([message("m1", MessageType.AUDIO)], "m1")).toBeNull();
  });

  it("n'enchaîne pas depuis un message absent du fil", () => {
    expect(nextVoiceNoteInThread([message("m1", MessageType.AUDIO)], "gone")).toBeNull();
  });
});

describe("createVoiceNoteFocus", () => {
  it("arrête la note qui joue quand une autre démarre", () => {
    const focus = createVoiceNoteFocus();
    const first = vi.fn();
    const second = vi.fn();

    focus.take(first);
    focus.take(second);

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("n'arrête pas une note qui reprend la main qu'elle a déjà", () => {
    const focus = createVoiceNoteFocus();
    const stop = vi.fn();

    focus.take(stop);
    focus.take(stop);

    expect(stop).not.toHaveBeenCalled();
  });

  it("n'arrête plus une note qui a cédé sa place", () => {
    const focus = createVoiceNoteFocus();
    const first = vi.fn();

    focus.take(first)();
    focus.take(vi.fn());

    expect(first).not.toHaveBeenCalled();
  });

  it("ignore la cession d'une note déjà remplacée", () => {
    const focus = createVoiceNoteFocus();
    const release = focus.take(vi.fn());
    const second = vi.fn();
    focus.take(second);

    release();
    focus.take(vi.fn());

    expect(second).toHaveBeenCalledOnce();
  });
});

describe("createVoiceNoteChainHooks", () => {
  /**
   * Un `useState` hors React : l'état survit d'un « rendu » à l'autre, comme le vrai. Chaque
   * appel de `render` rejoue le hook et rend ce que la liste verrait.
   */
  function harness(nextOf: (id: string) => string | null) {
    let state: unknown;
    let initialized = false;
    const useState = <S>(initial: S): [S, (next: S) => void] => {
      if (!initialized) {
        state = initial;
        initialized = true;
      }
      return [
        state as S,
        (next) => {
          state = next;
        },
      ];
    };
    const { useVoiceNoteChain } = createVoiceNoteChainHooks(useState);
    return { render: () => useVoiceNoteChain(nextOf) };
  }

  const next = (id: string) => ({ a: "b", b: "c" })[id] ?? null;

  it("ne demande rien tant qu'aucune note n'a fini", () => {
    const chain = harness(next).render();

    expect(chain.cuedId).toBeNull();
    expect(chain.cueOf("a").cued).toBe(false);
  });

  it("demande la note suivante à la fin d'une note", () => {
    const { render } = harness(next);

    render().cueOf("a").onFinish();

    expect(render().cuedId).toBe("b");
    expect(render().cueOf("b").cued).toBe(true);
    expect(render().cueOf("c").cued).toBe(false);
  });

  it("retire la demande quand la note demandée démarre", () => {
    const { render } = harness(next);
    render().cueOf("a").onFinish();

    render().cueOf("b").onPlay();

    expect(render().cuedId).toBeNull();
  });

  it("repart de la note relancée à la main, en oubliant la demande en attente", () => {
    const { render } = harness(next);
    render().cueOf("a").onFinish();

    render().cueOf("a").onPlay();
    expect(render().cuedId).toBeNull();

    render().cueOf("b").onFinish();
    expect(render().cuedId).toBe("c");
  });

  it("ne demande rien après la dernière note", () => {
    const { render } = harness(next);

    render().cueOf("c").onFinish();

    expect(render().cuedId).toBeNull();
  });
});
