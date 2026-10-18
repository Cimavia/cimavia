import type { TrainingCapability } from "@cmv/shared";
import { ConversationKind, type ParticipantCapability } from "@prisma/client";
import { exercisedOrThrow, type TenantContext } from "../tenancy/tenant-context.type";

/** Un participant, au titre auquel il participe — tel que la base l'écrit. */
export type ConversationMember = { userId: string; capability: ParticipantCapability };

type Named = { name: string; userId: string };

/** L'ordre d'affichage des personnes : par nom, l'id départageant deux homonymes. */
export function byName(a: Named, b: Named): number {
  return a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);
}

/** Le titre d'une capacité exercée, en base. */
export function participantCapabilityOf(capability: TrainingCapability): ParticipantCapability {
  return capability === "coach" ? "COACH" : "ATHLETE";
}

/** Et le chemin inverse, pour le DTO. */
export function trainingCapabilityOf(capability: ParticipantCapability): TrainingCapability {
  return capability === "COACH" ? "coach" : "athlete";
}

/**
 * L'acteur, au titre qu'il exerce. La route est `either` : un compte Entreprise n'y arrive pas, et
 * s'il y arrivait ce serait un bug de câblage — il ne participe à aucune conversation.
 */
export function actorMemberOf(actor: TenantContext): ConversationMember {
  const exercised = exercisedOrThrow(actor);
  if (exercised === "company") {
    throw new Error("[message] un compte Entreprise ne participe à aucune conversation");
  }
  return { userId: actor.userId, capability: participantCapabilityOf(exercised) };
}

/** Le fil direct d'un Coach et d'un athlète — celui des avis de débrief (#96, #610). */
export function directMembers(coachId: string, athleteId: string): ConversationMember[] {
  return [
    { userId: coachId, capability: "COACH" },
    { userId: athleteId, capability: "ATHLETE" },
  ];
}

/** Un participant dans la clé : son titre, puis son id. */
export function memberKeyOf(member: ConversationMember): string {
  return `${member.capability}:${member.userId}`;
}

/**
 * La clé d'unicité d'une conversation (#611) : ses participants et leurs capacités, triés. Mêmes
 * participants, même conversation, à deux comme à plusieurs (tranché en #598) — et la capacité en
 * fait partie : un compte à double capacité a deux fils avec la même personne, un par espace.
 *
 * Le tri est celui des unités de code, qu'aucune locale ne déplace : la migration des fils
 * existants l'a écrit à la main (`ATHLETE:…|COACH:…`), et toute clé calculée ici doit retomber
 * dessus au caractère près.
 */
export function participantKeyOf(members: readonly ConversationMember[]): string {
  return members
    .map(memberKeyOf)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join("|");
}

/** À deux, une conversation est `DIRECT` ; à trois ou plus, `GROUP`. */
export function conversationKindOf(members: readonly ConversationMember[]): ConversationKind {
  return members.length === 2 ? ConversationKind.DIRECT : ConversationKind.GROUP;
}
