import { describe, expect, it } from "vitest";
import type { ConversationDto, ConversationParticipantDto } from "../dto/message.schema";
import {
  candidateCaption,
  coachSectionTitle,
  conversationPreviewText,
  conversationSubtitleText,
  emptyThreadText,
  hasCandidates,
  readByText,
} from "./conversation-label.util";

// Un `t` qui rend la clé et ses paramètres : on lit la règle (quelle clé, quoi dedans), pas le texte.
const t = (key: string, params: Record<string, string | number>) =>
  Object.keys(params).length === 0 ? key : `${key}${JSON.stringify(params)}`;

const participant = (
  userId: string,
  capability: "coach" | "athlete" = "coach",
): ConversationParticipantDto => ({
  userId,
  name: userId.toUpperCase(),
  capability,
  lastReadAt: null,
});

const conversation = (
  participants: ConversationParticipantDto[],
  overrides: Partial<ConversationDto> = {},
): ConversationDto => ({
  id: "conv",
  kind: participants.length >= 2 ? "GROUP" : "DIRECT",
  participants,
  lastReadAt: null,
  lastMessageAt: null,
  lastMessageSenderId: null,
  lastMessageType: null,
  lastMessagePreview: null,
  unreadCount: 0,
  createdAt: "2026-10-05T08:00:00.000Z",
  ...overrides,
});

// Vue par TI : « C, M ».
const group = conversation([participant("c"), participant("m")]);
const direct = conversation([participant("c")]);

describe("conversationPreviewText", () => {
  it("rend null pour une conversation encore vide", () => {
    expect(conversationPreviewText(group, "ti", t)).toBeNull();
  });

  it("rend le texte seul dans un fil à deux reçu", () => {
    const received = { ...direct, lastMessageSenderId: "c", lastMessagePreview: "Salut" };
    expect(conversationPreviewText(received, "ti", t)).toBe("Salut");
  });

  it("préfixe « Vous : » mon dernier message", () => {
    const mine = { ...direct, lastMessageSenderId: "ti", lastMessagePreview: "Salut" };
    expect(conversationPreviewText(mine, "ti", t)).toBe('messages.previewSelf{"preview":"Salut"}');
  });

  it("préfixe l'auteur d'un message reçu à plusieurs, et dit le type d'un média", () => {
    const voice = { ...group, lastMessageSenderId: "m", lastMessageType: "AUDIO" as const };
    expect(conversationPreviewText(voice, "ti", t)).toBe(
      'messages.previewAuthor{"name":"M","preview":"messages.preview.AUDIO"}',
    );
  });
});

describe("conversationSubtitleText", () => {
  it("dit la capacité de l'autre à deux", () => {
    expect(conversationSubtitleText(direct, t)).toBe("messages.capability.coach");
  });

  it("compte les participants, moi compris, à plusieurs", () => {
    expect(conversationSubtitleText(group, t)).toBe('messages.participantCount{"count":3}');
  });

  it("rend null quand plus personne n'y figure", () => {
    expect(conversationSubtitleText(conversation([]), t)).toBeNull();
  });
});

describe("readByText", () => {
  it("met les lecteurs en phrase, comme toute liste de noms", () => {
    expect(readByText({ messageId: "m1", names: ["C", "TI"] }, t)).toBe(
      'messages.readBy{"names":"C messages.and TI"}',
    );
  });
});

describe("emptyThreadText", () => {
  it("nomme ceux à qui écrire", () => {
    expect(emptyThreadText(group, t)).toBe(
      'messages.empty.description{"names":"C messages.and M"}',
    );
  });

  // Un compte effacé (MC-18) : « — », pas « Écris le premier message à . ».
  it("rend « — » quand plus personne n'y figure", () => {
    expect(emptyThreadText(conversation([]), t)).toBe('messages.empty.description{"names":"—"}');
  });
});

describe("hasCandidates", () => {
  it("dit faux tant que les candidats ne sont pas lus, ou sans personne", () => {
    expect(hasCandidates(undefined)).toBe(false);
    expect(hasCandidates({ athletes: [], coaches: [] })).toBe(false);
  });

  it("dit vrai dès un athlète ou un Coach", () => {
    expect(hasCandidates({ athletes: [{ userId: "te", name: "TE" }], coaches: [] })).toBe(true);
  });
});

describe("coachSectionTitle", () => {
  it("dit « Tes coachs » côté athlète", () => {
    expect(coachSectionTitle(false, "F", t)).toBe("messages.new.myCoaches");
  });

  it("nomme l'entreprise unique côté Coach, un titre générique sinon", () => {
    expect(coachSectionTitle(true, "F", t)).toBe('messages.new.coachesOf{"organization":"F"}');
    expect(coachSectionTitle(true, null, t)).toBe("messages.new.colleagues");
  });
});

describe("candidateCaption", () => {
  const row = { userId: "m", capability: "coach" as const, name: "M", organizations: "F" };

  it("nomme les entreprises communes côté Coach, la provenance côté athlète", () => {
    expect(candidateCaption(row, true, t)).toBe(
      'messages.new.ofOrganizations{"organizations":"F"}',
    );
    expect(candidateCaption(row, false, t)).toBe(
      'messages.new.viaOrganizations{"organizations":"F"}',
    );
  });

  it("dit la seule capacité sans entreprise", () => {
    expect(candidateCaption({ ...row, organizations: null }, true, t)).toBe(
      "messages.capability.coach",
    );
    expect(candidateCaption({ ...row, capability: "athlete", organizations: null }, true, t)).toBe(
      "messages.capability.athlete",
    );
  });
});
