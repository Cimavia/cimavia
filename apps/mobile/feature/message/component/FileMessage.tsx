import { FILE_SIZE_LABEL_KEY, fileSizeOf, type MessageMediaDto } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkState } from "expo-network";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";
import { openMessageFile } from "@/shared/lib/message-file";
import type { OpenFileOutcome } from "@/shared/lib/open-file";

type FileMessageProps = {
  messageId: string;
  media: MessageMediaDto;
  /** L'URL de lecture, re-signée si celle du fil a expiré (#304). */
  resolveUrl: () => Promise<string | null>;
};

/**
 * Fichier joint d'un message (#771) : son nom et sa taille, comme la maquette `conversation_1_1`
 * le dessine. Au tap, il est descendu puis remis au lecteur PDF de l'appareil — il ne se lit pas
 * dans la bulle.
 */
export function FileMessage({ messageId, media, resolveUrl }: Readonly<FileMessageProps>) {
  const { t } = useTranslation();
  const network = useNetworkState();
  const isOnline = network.isInternetReachable !== false;
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<Exclude<OpenFileOutcome, "opened"> | null>(null);
  const size = fileSizeOf(media.sizeBytes);

  const open = async () => {
    setFailure(null);
    setOpening(true);
    const outcome = await openMessageFile(messageId, media, isOnline, resolveUrl);
    setOpening(false);
    setFailure(outcome === "opened" ? null : outcome);
  };

  return (
    <View className="gap-1">
      <Pressable
        onPress={() => void open()}
        disabled={opening}
        accessibilityRole="button"
        accessibilityLabel={t("messages.file.open", { fileName: media.fileName })}
        className="w-52 max-w-full flex-row items-center gap-3"
      >
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-cmv-error-soft">
          {opening ? (
            <ActivityIndicator color={cmvColors.error.DEFAULT} />
          ) : (
            <Ionicons name="document-text-outline" size={18} color={cmvColors.error.DEFAULT} />
          )}
        </View>
        <View className="min-w-0 flex-1">
          <CmvText className="font-semibold text-cmv-text-hi" numberOfLines={1}>
            {media.fileName}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-xs">
            {t(FILE_SIZE_LABEL_KEY[size.unit], { value: size.value })}
          </CmvText>
        </View>
      </Pressable>

      {/* L'échec se dit SOUS la bulle : le mobile n'a pas de toasts. */}
      {failure == null ? null : (
        <CmvText className="text-cmv-error text-xs">
          {failure === "offline" ? t("messages.file.offline") : t("messages.file.openError")}
        </CmvText>
      )}
    </View>
  );
}
