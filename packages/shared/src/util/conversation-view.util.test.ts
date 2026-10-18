import { describe, expect, it } from "vitest";
import type {
  ConversationCandidatesDto,
  ConversationDto,
  ConversationParticipantDto,
  MessageDto,
} from "../dto/message.schema";
import {
  candidateRows,
  conversationSubtitle,
  conversationTitle,
  filterCandidates,
  isSameParticipant,
  messageAuthorOf,
  previewAuthorOf,
  readByOf,
  selectedCandidates,
  selectionWarnings,
  singleOrganizationName,
  toggleParticipant,
  withConversation,
} from "./conversation-view.util";

// Les données de la phase multi-coach : C et M (entreprise F), TE et TI. TI est suivi par C et M.
const participant = (
  userId: string,
  capability: "coach" | "athlete",
  lastReadAt: string | null = null,
): ConversationParticipantDto => ({ userId, name: userId.toUpperCase(), capability, lastReadAt });

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

const message = (id: string, senderId: string, createdAt: string): MessageDto => ({
  id,
  conversationId: "conv",
  senderId,
  type: "TEXT",
  content: id,
  media: null,
  scheduledSessionId: null,
  sessionFeedbackId: null,
  attachment: null,
  createdAt,
});

// Vue par TI : « C, M ».
const group = conversation([participant("c", "coach"), participant("m", "coach")]);
const direct = conversation([participant("c", "coach")]);

describe("conversationTitle", () => {
  it("liste les autres participants, dans l'ordre de l'API", () => {
    expect(conversationTitle(group)).toBe("C, M");
    expect(conversationTitle(direct)).toBe("C");
  });

  // Un fil dont l'autre compte a été effacé (MC-18) : rien à nommer, le rendu dira « — ».
  it("rend null quand plus personne n'y figure", () => {
    expect(conversationTitle(conversation([], { kind: "DIRECT" }))).toBeNull();
  });
});

describe("conversationSubtitle", () => {
  it("donne la capacité de l'autre dans un fil à deux", () => {
    expect(conversationSubtitle(direct)).toEqual({ kind: "capability", capability: "coach" });
    expect(conversationSubtitle(conversation([participant("ti", "athlete")]))).toEqual({
      kind: "capability",
      capability: "athlete",
    });
  });

  it("compte les participants à plusieurs, moi compris", () => {
    expect(conversationSubtitle(group)).toEqual({ kind: "count", count: 3 });
  });

  it("rend null pour un fil à deux sans plus personne", () => {
    expect(conversationSubtitle(conversation([], { kind: "DIRECT" }))).toBeNull();
  });
});

describe("messageAuthorOf", () => {
  it("nomme l'auteur d'une bulle reçue à plusieurs", () => {
    expect(messageAuthorOf(group, "m", "ti")).toEqual({ name: "M" });
  });

  it("ne nomme personne dans un fil à deux, ni sur mon propre message", () => {
    expect(messageAuthorOf(direct, "c", "ti")).toBeNull();
    expect(messageAuthorOf(group, "ti", "ti")).toBeNull();
  });

  // Le message a un auteur, dont la ligne de participant est partie avec son compte.
  it("garde la place d'un auteur qu'on ne connaît plus", () => {
    expect(messageAuthorOf(group, "parti", "ti")).toEqual({ name: null });
  });
});

describe("readByOf", () => {
  const thread = [
    message("m1", "c", "2026-10-05T09:12:00.000Z"),
    message("m2", "ti", "2026-10-05T10:31:00.000Z"),
    message("m3", "ti", "2026-10-05T10:32:00.000Z"),
  ];

  it("liste, sous mon dernier message, ceux dont la marque l'atteint", () => {
    const read = conversation([
      // La marque est le createdAt du dernier message vu : l'égalité vaut lecture.
      participant("c", "coach", "2026-10-05T10:32:00.000Z"),
      participant("m", "coach", "2026-10-05T11:00:00.000Z"),
    ]);

    expect(readByOf(read, thread, "ti")).toEqual({ messageId: "m3", names: ["C", "M"] });
  });

  it("écarte qui n'a lu qu'un message plus ancien, ou rien", () => {
    const partly = conversation([
      participant("c", "coach", "2026-10-05T10:31:00.000Z"),
      participant("m", "coach", "2026-10-05T10:40:00.000Z"),
    ]);

    expect(readByOf(partly, thread, "ti")).toEqual({ messageId: "m3", names: ["M"] });
  });

  // Mon dernier message n'est pas forcément le dernier du fil.
  it("se pose sous MON dernier message, même suivi d'une réponse", () => {
    const answered = [...thread, message("m4", "m", "2026-10-05T11:00:00.000Z")];
    const read = conversation([
      participant("c", "coach"),
      participant("m", "coach", "2026-10-05T11:00:00.000Z"),
    ]);

    expect(readByOf(read, answered, "ti")).toEqual({ messageId: "m3", names: ["M"] });
  });

  it("ne dit rien quand personne n'a lu", () => {
    expect(readByOf(group, thread, "ti")).toBeNull();
  });

  it("ne dit rien sans message de moi, sans session, ni dans un fil à deux", () => {
    const read = conversation([
      participant("c", "coach", "2026-10-06T00:00:00.000Z"),
      participant("m", "coach", "2026-10-06T00:00:00.000Z"),
    ]);

    expect(readByOf(read, [thread[0] as MessageDto], "ti")).toBeNull();
    expect(readByOf(read, thread, null)).toBeNull();
    expect(
      readByOf(conversation([participant("c", "coach", "2026-10-06T00:00:00.000Z")]), thread, "ti"),
    ).toBeNull();
  });
});

describe("previewAuthorOf", () => {
  const withLast = (base: ConversationDto, senderId: string | null, type: MessageDto["type"]) => ({
    ...base,
    lastMessageSenderId: senderId,
    lastMessageType: senderId == null ? null : type,
  });

  it("préfixe « Vous : » mon dernier message, à deux comme à plusieurs", () => {
    expect(previewAuthorOf(withLast(direct, "ti", "TEXT"), "ti")).toEqual({ kind: "self" });
    expect(previewAuthorOf(withLast(group, "ti", "IMAGE"), "ti")).toEqual({ kind: "self" });
  });

  it("préfixe l'auteur à plusieurs, personne à deux", () => {
    expect(previewAuthorOf(withLast(group, "m", "TEXT"), "ti")).toEqual({
      kind: "participant",
      name: "M",
    });
    expect(previewAuthorOf(withLast(direct, "c", "TEXT"), "ti")).toBeNull();
  });

  it("ne préfixe ni une conversation vide, ni un avis de débrief, ni un auteur parti", () => {
    expect(previewAuthorOf(withLast(group, null, "TEXT"), "ti")).toBeNull();
    expect(previewAuthorOf(withLast(direct, "ti", "FEEDBACK_CREATED"), "ti")).toBeNull();
    expect(previewAuthorOf(withLast(group, "parti", "TEXT"), "ti")).toBeNull();
  });
});

// Le sélecteur de C : ses athlètes TE et TI, et M de F, qui ne suit que TI.
const candidates: ConversationCandidatesDto = {
  athletes: [
    { userId: "te", name: "TE" },
    { userId: "ti", name: "Timéo" },
  ],
  coaches: [{ userId: "m", name: "M", organizationNames: ["F"], followedAthleteIds: ["ti"] }],
};

describe("toggleParticipant", () => {
  it("coche puis décoche un candidat", () => {
    const once = toggleParticipant([], { userId: "te", capability: "athlete" });
    expect(once).toEqual([{ userId: "te", capability: "athlete" }]);
    expect(toggleParticipant(once, { userId: "te", capability: "athlete" })).toEqual([]);
  });

  // Un compte à double capacité est deux candidats, mais l'API refuse de le nommer deux fois :
  // le cocher à l'autre titre remplace le premier choix.
  it("ne choisit un même compte qu'à un titre", () => {
    const asAthlete = toggleParticipant([{ userId: "te", capability: "athlete" }], {
      userId: "x",
      capability: "athlete",
    });
    const asCoach = toggleParticipant(asAthlete, { userId: "x", capability: "coach" });

    expect(asCoach).toEqual([
      { userId: "te", capability: "athlete" },
      { userId: "x", capability: "coach" },
    ]);
  });

  it("distingue un même compte à deux titres", () => {
    expect(
      isSameParticipant(
        { userId: "x", capability: "athlete" },
        { userId: "x", capability: "coach" },
      ),
    ).toBe(false);
  });
});

describe("filterCandidates", () => {
  it("garde les noms qui contiennent la recherche, sans casse ni accent", () => {
    expect(filterCandidates(candidates, "TIMEO")).toEqual({
      athletes: [{ userId: "ti", name: "Timéo" }],
      coaches: [],
    });
  });

  it("garde tout sur une recherche vide", () => {
    expect(filterCandidates(candidates, "  ")).toEqual(candidates);
  });
});

describe("candidateRows", () => {
  it("rend les athlètes puis les Coachs, chacun avec sa capacité", () => {
    const rows = candidateRows(candidates);

    expect(rows.athletes.map((row) => [row.userId, row.capability])).toEqual([
      ["te", "athlete"],
      ["ti", "athlete"],
    ]);
    expect(rows.coaches).toEqual([
      { userId: "m", capability: "coach", name: "M", organizations: "F" },
    ]);
  });

  // `null` : un lien direct, que la ligne dit par la seule capacité — pas « via » une chaîne vide.
  it("joint les entreprises d'un Coach, null sans aucune", () => {
    const rows = candidateRows({
      athletes: [],
      coaches: [
        { userId: "m", name: "M", organizationNames: ["F", "G"], followedAthleteIds: null },
        { userId: "c", name: "C", organizationNames: [], followedAthleteIds: null },
      ],
    });

    expect(rows.coaches.map((row) => row.organizations)).toEqual(["F, G", null]);
    expect(rows.athletes).toEqual([]);
  });
});

describe("singleOrganizationName", () => {
  it("nomme l'entreprise quand tous les Coachs en viennent", () => {
    expect(singleOrganizationName(candidates)).toBe("F");
  });

  it("rend null à plusieurs entreprises, ou sans aucune", () => {
    const two = {
      ...candidates,
      coaches: [
        ...candidates.coaches,
        { userId: "z", name: "Z", organizationNames: ["G"], followedAthleteIds: [] },
      ],
    };

    expect(singleOrganizationName(two)).toBeNull();
    expect(singleOrganizationName({ athletes: [], coaches: [] })).toBeNull();
  });
});

describe("selectionWarnings", () => {
  const te = { userId: "te", capability: "athlete" } as const;
  const ti = { userId: "ti", capability: "athlete" } as const;
  const m = { userId: "m", capability: "coach" } as const;

  it("ne prévient de rien pour un athlète seul", () => {
    expect(selectionWarnings(candidates, [ti])).toEqual({
      athletesSeeEachOther: false,
      unfollowed: [],
    });
  });

  it("prévient dès deux athlètes que chacun verra les autres", () => {
    expect(selectionWarnings(candidates, [te, ti]).athletesSeeEachOther).toBe(true);
  });

  // B2 : C réunit TE, TI et M — M ne suit que TI.
  it("prévient qu'un Coach choisi ne suit pas un athlète choisi, cumulé au premier", () => {
    expect(selectionWarnings(candidates, [te, ti, m])).toEqual({
      athletesSeeEachOther: true,
      unfollowed: [{ coachId: "m", coachName: "M", athleteNames: ["TE"] }],
    });
    expect(selectionWarnings(candidates, [ti, m]).unfollowed).toEqual([]);
  });

  // Côté athlète, l'API ne dit pas qui suit qui : la question ne se pose pas.
  it("ne juge pas un Coach dont les suivis sont inconnus", () => {
    const ofAthlete = {
      athletes: candidates.athletes,
      coaches: [{ userId: "m", name: "M", organizationNames: ["F"], followedAthleteIds: null }],
    };

    expect(selectionWarnings(ofAthlete, [te, m]).unfollowed).toEqual([]);
  });

  it("ne juge pas un Coach qui n'est pas choisi", () => {
    expect(selectionWarnings(candidates, [te]).unfollowed).toEqual([]);
  });
});

describe("selectedCandidates", () => {
  it("nomme les choix dans l'ordre où ils ont été faits", () => {
    expect(
      selectedCandidates(candidates, [
        { userId: "m", capability: "coach" },
        { userId: "te", capability: "athlete" },
      ]),
    ).toEqual([
      { userId: "m", capability: "coach", name: "M" },
      { userId: "te", capability: "athlete", name: "TE" },
    ]);
  });

  // Un candidat cherché dans la bonne liste : M n'est pas l'un des athlètes.
  it("écarte un choix dont le candidat n'existe plus à ce titre", () => {
    expect(selectedCandidates(candidates, [{ userId: "m", capability: "athlete" }])).toEqual([]);
  });
});

describe("withConversation", () => {
  const opened = conversation([participant("m", "coach")], { id: "opened" });

  it("pose en tête une conversation absente de la liste", () => {
    expect(withConversation([group], opened)?.map((listed) => listed.id)).toEqual([
      "opened",
      "conv",
    ]);
  });

  it("laisse la liste telle quelle quand elle y est déjà", () => {
    const list = [group, opened];

    expect(withConversation(list, opened)).toBe(list);
  });

  // Une entrée par interlocuteur peut résoudre le fil avant que la liste ne soit chargée : une
  // liste d'une ligne passerait pour la liste chargée.
  it("ne fabrique pas de liste tant que rien n'est en cache", () => {
    expect(withConversation(undefined, opened)).toBeUndefined();
  });
});
