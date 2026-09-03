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
  const isSelf = useIsSelfAthlete();

  return (athleteId, athleteName) =>
    isSelf(athleteId) ? t("athlete.self", { name: athleteName }) : athleteName;
}

/**
 * Le même test, sans le texte : cet athlète, est-ce MOI ?
 *
 * Pour les surfaces qui doivent DÉCIDER et pas seulement nommer — le détail de débrief, qui ne peut
 * pas offrir de répondre à soi-même : le fil `(soi, soi)` n'existera jamais, le CHECK
 * `coach_athlete_not_self` (#11) l'interdit, et le demander rendait un 409 déguisé en panne
 * passagère (#198).
 *
 * Séparé de `useAthleteLabel` parce que c'en est l'inverse exact : ce label est réservé au TEXTE
 * affiché, et brancher un rendu sur la présence de « (moi) » dans une chaîne traduite serait un
 * test qui casse au premier reformulage du catalogue.
 */
export function useIsSelfAthlete(): (athleteId: string) => boolean {
  const { data } = authClient.useSession();
  const selfId = data?.user.id;

  // `selfId` absent = session non résolue : on ne prétend pas que c'est soi. Fail closed dans le
  // sens qui ne cache rien — au pire un aller-retour de plus, jamais un écran amputé à tort.
  return (athleteId) => selfId != null && athleteId === selfId;
}
