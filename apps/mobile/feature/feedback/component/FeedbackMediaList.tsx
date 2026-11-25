import { type FeedbackMediaDto, MediaType, nextVoiceNoteInFeedback } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { ResolveMediaUrl } from "@/feature/message/component/MessageBubble";
import { CmvAudioPlayer, CmvImageViewer, CmvText, CmvVideoPlayer } from "@/shared/component";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";

/**
 * Les médias joints à un débrief, en lecture, un rendu par type : ce que le coach lit (#33), et ce
 * que l'athlète relit d'un suivi terminé (#911) — sans rien à ajouter ni à retirer.
 *
 * Le branchement est EXHAUSTIF, et pas « audio d'un côté, tout le reste en image » : c'est
 * exactement ce qui rendait une vidéo par `<Image>` — un bloc vide, sans erreur ni indice, là où
 * l'athlète avait déposé sa voie (#151).
 *
 * Les notes vocales s'enchaînent, photos et vidéos sautées (#529). `resolveMediaUrl` re-signe sous
 * la clé de qui lit : la boîte du coach, ou le débrief de l'athlète.
 */
export function FeedbackMediaList({
  media,
  resolveMediaUrl,
}: Readonly<{ media: readonly FeedbackMediaDto[]; resolveMediaUrl: ResolveMediaUrl }>) {
  const { t } = useTranslation();
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInFeedback(media, id));

  if (media.length === 0) return null;

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("feedback.coach.media")}</CmvText>
      {media.map((item) => {
        if (item.type === MediaType.AUDIO) {
          return (
            <CmvAudioPlayer
              key={item.id}
              url={item.url}
              durationSeconds={item.durationSeconds}
              resolveUrl={() => resolveMediaUrl(item.id)}
              cue={chain.cueOf(item.id)}
            />
          );
        }
        if (item.type === MediaType.VIDEO) {
          return (
            <CmvVideoPlayer
              key={item.id}
              mediaId={item.id}
              durationSeconds={item.durationSeconds}
              sizeBytes={item.sizeBytes}
              resolveUrl={() => resolveMediaUrl(item.id)}
              containerClassName="h-48 w-full items-center justify-center gap-2 rounded-lg border border-cmv-border bg-cmv-surface"
              thumbnailClassName="h-48 w-full overflow-hidden rounded-lg border border-cmv-border bg-cmv-surface"
            />
          );
        }
        return (
          <CmvImageViewer
            key={item.id}
            url={item.url}
            containerClassName="h-48 w-full overflow-hidden rounded-lg"
          />
        );
      })}
    </View>
  );
}
