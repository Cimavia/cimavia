import type {
  AthleteSheetDto,
  CoachAthleteDto,
  CreateInvitationInput,
  InvitationDto,
  UpdateAthleteSheetInput,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const athleteKeys = {
  all: ["athletes"] as const,
  list: () => ["athletes", "list"] as const,
  sheet: (athleteId: string) => ["athletes", "sheet", athleteId] as const,
};

export const invitationKeys = {
  all: ["invitations"] as const,
  list: () => ["invitations", "list"] as const,
};

export function listAthletes(): Promise<CoachAthleteDto[]> {
  return api.get<CoachAthleteDto[]>("/athletes");
}

export function getAthleteSheet(athleteId: string): Promise<AthleteSheetDto | null> {
  return api.get<AthleteSheetDto | null>(`/athletes/${athleteId}/sheet`);
}

export function saveAthleteSheet(
  athleteId: string,
  input: UpdateAthleteSheetInput,
): Promise<AthleteSheetDto> {
  return api.put<AthleteSheetDto>(`/athletes/${athleteId}/sheet`, input);
}

// ── Invitations ──────────────────────────────────────────────────────────────

export function listInvitations(): Promise<InvitationDto[]> {
  return api.get<InvitationDto[]>("/invitations");
}

export function createInvitation(input: CreateInvitationInput): Promise<InvitationDto> {
  return api.post<InvitationDto>("/invitations", input);
}
