import type { TrainingCapability } from "../capability";
import { type MyAccess, MyAccessLevel } from "../dto/access.schema";
import { type CoachAthleteDto, CoachAthleteStatus } from "../dto/coach-athlete.schema";
import type { ConversationDto } from "../dto/message.schema";
import { directCounterpartId } from "./conversation-row.util";

/**
 * La fin d'un suivi (#909), lue par les clients : ce qui se range à part, ce qui s'écrit encore.
 *
 * Rompre n'efface rien (tranché en #213) : `GET /athletes` et `GET /me/coaches` rendent les liens
 * rompus avec les autres, et cycles, séances et fils direct portent la date de fin
 * (`followEndedAt`). La règle est la même des deux côtés et sur les deux clients — elle vit ici,
 * web et mobile n'en font que le rendu.
 */

type FollowLink = Pick<CoachAthleteDto, "status" | "endedAt">;

/** Le suivi de ce couple a pris fin : son archive se relit, ne s'écrit plus. */
export function isEndedLink(link: Pick<CoachAthleteDto, "status">): boolean {
  return link.status === CoachAthleteStatus.ENDED;
}

export type SplitFollows<T> = {
  /** Les suivis en cours, dans l'ordre reçu. */
  ongoing: T[];
  /** Les suivis terminés, le plus récemment rompu d'abord. */
  ended: T[];
};

/**
 * Les liens d'un compte, partagés entre suivis en cours et suivis terminés. Les premiers sont ceux
 * qu'on compte, à qui l'on écrit et pour qui l'on crée ; les seconds ne servent qu'à relire.
 *
 * Le plus récent d'abord parmi les terminés : c'est l'archive qu'on vient de fermer qu'on cherche.
 * `endedAt` va avec `ENDED` (contrat du DTO) ; s'il manquait, la ligne passe en dernier, sans date
 * inventée.
 */
export function splitFollows<T extends FollowLink>(links: readonly T[]): SplitFollows<T> {
  const ongoing: T[] = [];
  const ended: T[] = [];
  for (const link of links) (isEndedLink(link) ? ended : ongoing).push(link);
  ended.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  return { ongoing, ended };
}

/**
 * Ce que l'acteur peut d'un cycle — et de ce qui en pend : semaines, séances, facturation, dosage.
 *
 * - `FOLLOW_ENDED` : le suivi du couple a pris fin, le cycle est fermé à tous (tranché en #909),
 *   propriétaire compris. Il l'emporte sur le droit : un Coach en Écriture n'y écrit pas plus.
 * - `READ` : un droit de Lecture sur le cycle d'un autre Coach (#607).
 * - `WRITE` : le sien, ou un droit d'Écriture.
 *
 * Un mode et non un booléen : les deux fermetures ne se disent pas pareil — « suivi terminé » n'est
 * pas « lecture seule », et le Coach n'y peut rien demander à personne.
 */
export type PlanWriteMode = "WRITE" | "READ" | "FOLLOW_ENDED";

export function planWriteMode(access: MyAccess, followEndedAt: string | null): PlanWriteMode {
  if (followEndedAt != null) return "FOLLOW_ENDED";
  return access.level === MyAccessLevel.READ ? "READ" : "WRITE";
}

/**
 * L'athlète peut-il débriefer cette séance ? Non quand le suivi de son cycle a pris fin : le
 * débrief qu'il aurait écrit n'aurait plus personne pour le lire (#909). Celui déjà envoyé se relit.
 */
export function canDebrief(session: { followEndedAt: string | null }): boolean {
  return session.followEndedAt == null;
}

/**
 * Le fil À DEUX avec cette personne, à ce titre — `null` s'il n'y en a pas, ou si la liste n'est
 * pas lue. C'est par lui qu'une archive se relit : la messagerie n'ouvre `?athlete=` / `?coach=`
 * que vers un interlocuteur encore suivi (ses candidats), et un fil terminé n'en est plus un.
 */
export function directConversationWith<
  T extends Pick<ConversationDto, "id" | "kind" | "participants">,
>(
  conversations: readonly T[] | undefined,
  counterpartId: string,
  capability: TrainingCapability,
): T | null {
  return (
    conversations?.find(
      (conversation) => directCounterpartId(conversation, capability) === counterpartId,
    ) ?? null
  );
}
