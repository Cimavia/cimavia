import type { ConversationCandidatesDto, ConversationDto } from "../dto/message.schema";
import {
  type CandidateRow,
  conversationSubtitle,
  previewAuthorOf,
  type ReadBy,
} from "./conversation-view.util";
import { joinNames } from "./name.util";

/**
 * Les libellés d'une conversation, composés une fois pour le web et le mobile (#612) : la règle
 * (quelle clé, quels paramètres) vit ici, la traduction reste à l'appelant, qui passe son `t`.
 * Même patron que `mediaRecapText`. Les clés existent aux DEUX catalogues : `check:i18n` lit ce
 * paquet avec chacun.
 */
// `params` obligatoire, comme `mediaRecapText` : un paramètre optionnel ne s'accorde pas aux
// surcharges du `TFunction` typé du mobile.
type Translate = (key: string, params: Record<string, string | number>) => string;

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values messages.preview: IMAGE, VIDEO, AUDIO, FEEDBACK_CREATED, FEEDBACK_UPDATED
// i18n-values messages.capability: coach, athlete

/**
 * L'aperçu du dernier message : son texte, ou le TYPE de son média, préfixé de son auteur quand il
 * faut le dire (« Vous : », « M : » — `previewAuthorOf`). `null` pour une conversation encore vide
 * (#598, E3), que l'appelant rend « — ».
 */
export function conversationPreviewText(
  conversation: ConversationDto,
  currentUserId: string | null,
  t: Translate,
): string | null {
  const type = conversation.lastMessageType;
  const preview =
    conversation.lastMessagePreview ?? (type == null ? null : t(`messages.preview.${type}`, {}));
  if (preview == null) return null;
  const author = previewAuthorOf(conversation, currentUserId);
  if (author == null) return preview;
  return author.kind === "self"
    ? t("messages.previewSelf", { preview })
    : t("messages.previewAuthor", { name: author.name, preview });
}

/** « Coach », « Athlète » à deux ; « 3 participants » à plusieurs. `null` : plus personne. */
export function conversationSubtitleText(
  conversation: ConversationDto,
  t: Translate,
): string | null {
  const subtitle = conversationSubtitle(conversation);
  if (subtitle == null) return null;
  return subtitle.kind === "count"
    ? t("messages.participantCount", { count: subtitle.count })
    : t(`messages.capability.${subtitle.capability}`, {});
}

/** « Lu par C et TI », sous mon dernier message — même phrase que la liste de noms à vide. */
export function readByText(readBy: ReadBy, t: Translate): string {
  return t("messages.readBy", { names: joinNames(readBy.names, t("messages.and", {})) });
}

/**
 * L'invitation d'une conversation sans message : « Écris le premier message à C et M. » Plus
 * personne (compte effacé, MC-18) : « — » à la place des noms, pas une phrase tronquée.
 */
export function emptyThreadText(conversation: ConversationDto, t: Translate): string {
  const names = conversation.participants.map((participant) => participant.name);
  return t("messages.empty.description", {
    names: names.length === 0 ? "—" : joinNames(names, t("messages.and", {})),
  });
}

/** Quelqu'un à réunir ? `false` tant qu'on ne le sait pas : pas de bouton qui mènerait au vide. */
export function hasCandidates(candidates: ConversationCandidatesDto | undefined): boolean {
  return candidates != null && candidates.athletes.length + candidates.coaches.length > 0;
}

/**
 * Côté athlète, « Tes coachs ». Côté Coach, l'entreprise d'où ils viennent quand il n'y en a
 * qu'une (« Coachs de F », B2) ; à plusieurs, un titre générique, chaque ligne nommant les siennes.
 */
export function coachSectionTitle(
  isCoach: boolean,
  organization: string | null,
  t: Translate,
): string {
  if (!isCoach) return t("messages.new.myCoaches", {});
  return organization == null
    ? t("messages.new.colleagues", {})
    : t("messages.new.coachesOf", { organization });
}

/**
 * La légende d'un candidat : ses entreprises — communes côté Coach (« Coach · F »), la provenance
 * du lien côté athlète (« Coach · via F ») —, sa seule capacité sans entreprise.
 */
export function candidateCaption(row: CandidateRow, isCoach: boolean, t: Translate): string {
  if (row.organizations == null) return t(`messages.capability.${row.capability}`, {});
  return t(isCoach ? "messages.new.ofOrganizations" : "messages.new.viaOrganizations", {
    organizations: row.organizations,
  });
}
