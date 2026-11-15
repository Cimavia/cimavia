import { minutesOf } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvText } from "./CmvText";

type CmvAudioLimitNoticeProps = {
  visible: boolean;
  maxDurationSeconds: number;
};

/**
 * Ce que dit l'appelant quand la capture s'est arrêtée au plafond, faute de relais (#856) : le
 * bandeau est parti avec elle, il ne peut plus le dire. Une ligne neutre et non une erreur — la
 * note, elle, est partie.
 */
export function CmvAudioLimitNotice({
  visible,
  maxDurationSeconds,
}: Readonly<CmvAudioLimitNoticeProps>) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <CmvText className="pt-1 text-cmv-text-mid text-xs">
      {t("messages.audio.limitReached", { max: minutesOf(maxDurationSeconds) })}
    </CmvText>
  );
}
