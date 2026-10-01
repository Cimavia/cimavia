import { athleteLabel, isSelfAthlete } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { authClient } from "@/shared/lib/auth";

/**
 * Comment nommer un athlète dans une liste de coach — son nom, suivi de « (moi) » quand c'est le
 * compte courant (auto-coaching, #14). La règle vit dans `@cmv/shared` (`athleteLabel`) ; ce hook
 * n'y apporte que la session et la traduction du mobile.
 */
export function useAthleteLabel(): (athleteId: string, athleteName: string) => string {
  const { t } = useTranslation();
  const selfId = useSelfId();

  return (athleteId, athleteName) => athleteLabel(athleteId, athleteName, selfId, t);
}

/**
 * Le même test, sans le texte : cet athlète, est-ce MOI ? (`isSelfAthlete`)
 *
 * Pour les surfaces qui doivent DÉCIDER et pas seulement nommer — le détail de débrief, qui ne peut
 * pas offrir de répondre à soi-même : le fil `(soi, soi)` n'existera jamais, le CHECK
 * `coach_athlete_not_self` (#11) l'interdit, et le demander rendait un 409 déguisé en panne
 * passagère (#198).
 */
export function useIsSelfAthlete(): (athleteId: string) => boolean {
  const selfId = useSelfId();

  return (athleteId) => isSelfAthlete(selfId, athleteId);
}

/** L'id du compte courant, `undefined` tant que la session n'est pas résolue. */
function useSelfId(): string | undefined {
  return authClient.useSession().data?.user.id;
}
