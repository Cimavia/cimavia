import type { AcceptInvitationInput, CoachAthleteDto } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const coachKeys = {
  all: ["coach"] as const,
  mine: () => ["coach", "mine"] as const,
};

// `null` si l'athlète n'a pas (encore) de coach — l'autonomie est un état prévu (CDC §3).
export function getMyCoach(): Promise<CoachAthleteDto | null> {
  return api.get<CoachAthleteDto | null>("/me/coach");
}

// Rejoint un coach avec le code qu'il a communiqué. 409 si l'athlète est déjà lié.
export function acceptInvitation(input: AcceptInvitationInput): Promise<CoachAthleteDto> {
  return api.post<CoachAthleteDto>("/invitations/accept", input);
}
