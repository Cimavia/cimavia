import type { CoachAthleteDto } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { accountApi, athleteKeys } from "@/feature/athlete/api";

// Les athlètes du coach courant (relations ACTIVE). Cache persisté, comme le reste du mobile.
export function useAthletes() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: athleteKeys.list(),
    queryFn: accountApi.listAthletes,
  });
}
