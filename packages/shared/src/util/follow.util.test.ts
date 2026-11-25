import { describe, expect, it } from "vitest";
import type { MyAccess } from "../dto/access.schema";
import {
  canDebrief,
  directConversationWith,
  isEndedLink,
  planWriteMode,
  splitFollows,
} from "./follow.util";

const OWNER: MyAccess = { level: "OWNER", via: null };
const READ: MyAccess = { level: "READ", via: { id: "org_1", name: "F" } };
const WRITE: MyAccess = { level: "WRITE", via: { id: "org_1", name: "F" } };

const ongoing = (id: string) => ({ id, status: "ACTIVE", endedAt: null }) as const;
const ended = (id: string, endedAt: string | null) => ({ id, status: "ENDED", endedAt }) as const;

describe("isEndedLink", () => {
  it("ne dit terminé que le lien rompu", () => {
    expect(isEndedLink({ status: "ENDED" })).toBe(true);
    expect(isEndedLink({ status: "ACTIVE" })).toBe(false);
    expect(isEndedLink({ status: "PENDING" })).toBe(false);
  });
});

describe("splitFollows", () => {
  it("range à part les suivis terminés, les autres dans l'ordre reçu", () => {
    const links = [ongoing("a"), ended("b", "2026-11-01T10:00:00.000Z"), ongoing("c")];

    const { ongoing: current, ended: archive } = splitFollows(links);

    expect(current.map((link) => link.id)).toEqual(["a", "c"]);
    expect(archive.map((link) => link.id)).toEqual(["b"]);
  });

  // C'est l'archive qu'on vient de fermer qu'on cherche.
  it("met en tête le suivi le plus récemment terminé", () => {
    const links = [
      ended("old", "2026-10-01T10:00:00.000Z"),
      ended("new", "2026-11-20T10:00:00.000Z"),
      ended("mid", "2026-11-01T10:00:00.000Z"),
    ];

    expect(splitFollows(links).ended.map((link) => link.id)).toEqual(["new", "mid", "old"]);
  });

  // Contrat rompu côté API : la ligne reste rangée, en dernier, sans date inventée.
  it("met en dernier un suivi terminé sans date", () => {
    const links = [ended("undated", null), ended("dated", "2026-11-01T10:00:00.000Z")];

    expect(splitFollows(links).ended.map((link) => link.id)).toEqual(["dated", "undated"]);
  });

  it("rend deux listes vides pour aucun lien", () => {
    expect(splitFollows([])).toEqual({ ongoing: [], ended: [] });
  });

  it("ne trie pas la liste reçue en place", () => {
    const links = [
      ended("old", "2026-10-01T10:00:00.000Z"),
      ended("new", "2026-11-20T10:00:00.000Z"),
    ];

    splitFollows(links);

    expect(links.map((link) => link.id)).toEqual(["old", "new"]);
  });
});

describe("planWriteMode", () => {
  it("ouvre le cycle à son propriétaire et au droit d'Écriture", () => {
    expect(planWriteMode(OWNER, null)).toBe("WRITE");
    expect(planWriteMode(WRITE, null)).toBe("WRITE");
  });

  it("ferme le cycle ouvert en Lecture", () => {
    expect(planWriteMode(READ, null)).toBe("READ");
  });

  // Fermé à tous (tranché en #909) : le droit, quel qu'il soit, n'y change rien.
  it.each([OWNER, WRITE, READ])("ferme à tous le cycle d'un suivi terminé (%o)", (access) => {
    expect(planWriteMode(access, "2026-11-20T10:00:00.000Z")).toBe("FOLLOW_ENDED");
  });
});

describe("canDebrief", () => {
  it("ouvre le débrief d'une séance dont le suivi continue", () => {
    expect(canDebrief({ followEndedAt: null })).toBe(true);
  });

  it("le ferme quand le suivi a pris fin", () => {
    expect(canDebrief({ followEndedAt: "2026-11-20T10:00:00.000Z" })).toBe(false);
  });
});

describe("directConversationWith", () => {
  const direct = (id: string, userId: string, capability: "coach" | "athlete") => ({
    id,
    kind: "DIRECT" as const,
    participants: [{ userId, name: userId, capability, lastReadAt: null }],
  });
  const group = {
    id: "grp",
    kind: "GROUP" as const,
    participants: [
      { userId: "u_lea", name: "Léa", capability: "athlete" as const, lastReadAt: null },
      { userId: "u_tom", name: "Tom", capability: "athlete" as const, lastReadAt: null },
    ],
  };

  it("trouve le fil à deux avec cette personne, à ce titre", () => {
    const conversations = [
      group,
      direct("c_tom", "u_tom", "athlete"),
      direct("c_lea", "u_lea", "athlete"),
    ];

    expect(directConversationWith(conversations, "u_lea", "athlete")?.id).toBe("c_lea");
  });

  // Un groupe où elle figure n'est pas son fil (#611), ni un fil où elle parle à un autre titre.
  it("ne prend ni un groupe, ni un fil à l'autre titre", () => {
    const conversations = [group, direct("c_lea_coach", "u_lea", "coach")];

    expect(directConversationWith(conversations, "u_lea", "athlete")).toBeNull();
  });

  it("rend null sur une liste pas encore lue", () => {
    expect(directConversationWith(undefined, "u_lea", "athlete")).toBeNull();
  });
});
