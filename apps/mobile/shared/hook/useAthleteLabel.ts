import { useTranslation } from "react-i18next";
import { authClient } from "@/shared/lib/auth";

/**
 * Comment nommer un athlète dans une liste de coach — son nom, suivi de « (moi) » quand c'est le
 * compte courant (auto-coaching, #14).
 *
 * Comparaison à l'id de SESSION, et non à un drapeau porté par chaque DTO : le cas se présente
 * dans les débriefs, les cycles, la fiche athlète et le tableau de suivi, dont les charges utiles
 * n'ont en commun qu'un `athleteId`. Un marqueur à propager aurait demandé de toucher quatre
 * schémas — et d'y penser au cinquième.
 *
 * À n'utiliser que pour du TEXTE affiché. Les initiales d'un avatar se calculent sur le nom brut :
 * « Dual Curl (moi) » y produirait un « DC (m) » ou pire.
 */
export function useAthleteLabel(): (athleteId: string, athleteName: string) => string {
  const { t } = useTranslation();
  const { data } = authClient.useSession();
  const selfId = data?.user.id;

  return (athleteId, athleteName) =>
    athleteId === selfId ? t("athlete.self", { name: athleteName }) : athleteName;
}
