import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useAcceptInvitation, useMyCoach } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Rejoindre son coach par code d'invitation (p4-5).
 *
 * Sans cet écran, la relation coach↔athlète ne pouvait s'établir qu'en appelant l'API à la main :
 * l'athlète restait sans coach, donc sans planification ni séance à débriefer.
 */
export function JoinCoachScreen() {
  const { t } = useTranslation();
  const { data: coach } = useMyCoach();
  const accept = useAcceptInvitation();

  const [code, setCode] = useState("");

  // Déjà lié : un athlète n'a qu'un coach (invariant multi-tenant). Rien à faire ici.
  if (coach != null) {
    return (
      <CmvScreen>
        <View className="gap-4 p-4">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {t("coach.joined.title")}
          </CmvText>
          <CmvText className="text-cmv-text-mid">
            {t("coach.joined.description", { name: coach.coachName })}
          </CmvText>
          <CmvButton
            label={t("coach.joined.goToPlanning")}
            onPress={() => router.replace("/planning")}
          />
        </View>
      </CmvScreen>
    );
  }

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        <View className="gap-1">
          <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
            {t("coach.join.title")}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-sm">{t("coach.join.description")}</CmvText>
        </View>

        <CmvTextField
          label={t("coach.join.codeLabel")}
          placeholder={t("coach.join.codePlaceholder")}
          value={code}
          onChangeText={setCode}
          // Un code se saisit tel quel : ni majuscule automatique, ni correction.
          autoCapitalize="none"
          autoComplete="off"
          editable={!accept.isPending}
        />

        <CmvButton
          label={accept.isPending ? t("coach.join.joining") : t("coach.join.submit")}
          onPress={() => accept.mutate({ code: code.trim() })}
          disabled={accept.isPending || code.trim().length === 0}
        />

        {accept.isError ? (
          <CmvText className="text-cmv-error text-sm">
            {apiErrorMessage(accept.error) ?? t("coach.join.error")}
          </CmvText>
        ) : null}
      </ScrollView>
    </CmvScreen>
  );
}
