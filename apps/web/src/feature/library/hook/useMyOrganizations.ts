import type { CoachOrganizationDto } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations, myOrganizationKeys } from "@/feature/library/api";

/**
 * Les entreprises du Coach (#605). La bibliothèque en déduit s'il partage : sans entreprise, ni
 * propriétaire, ni accès, ni filtre de portée, ni cases à cocher (tranché en #597).
 */
export function useMyOrganizations() {
  return useQuery<CoachOrganizationDto[]>({
    queryKey: myOrganizationKeys.all,
    queryFn: listMyOrganizations,
  });
}
