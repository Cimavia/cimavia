import type { CoachAthleteDto } from "@cmv/shared";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useAcceptInvitation, useMyCoach, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Rejoindre son coach par code d'invitation (p4-5).
 *
 * Sans cet écran, la relation coach↔athlète ne pouvait s'établir qu'en appelant l'API à la main :
 * l'athlète restait sans coach, donc sans planification ni séance à débriefer.
 *
 * Depuis #146, un QUATRIÈME état s'y superpose — « une invitation t'attend ». Il ne remplace aucun
 * des autres : il se pose AU-DESSUS, dans les deux branches. Déjà lié, l'athlète la voit quand
 * même, inacceptable mais refusable — c'est ce refus qui vide la liste d'attente de l'inviteur.
 */
export function JoinCoachScreen() {
  const { data: coach } = useMyCoach();

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        <PendingInvitations currentCoachName={coach?.coachName ?? null} />
        {/* Déjà lié : un athlète n'a qu'un coach (invariant multi-tenant). Rien à saisir ici. */}
        {coach == null ? <JoinCoachForm /> : <LinkedCoachBlock coach={coach} />}
      </ScrollView>
    </CmvScreen>
  );
}

/**
 * Ce qui attend l'athlète, s'il y a quelque chose — et rien du tout sinon.
 *
 * **Une requête en échec ne s'annonce pas comme une liste vide** : dans les deux cas on ne rend
 * rien, mais on n'écrit jamais « aucune invitation » sur une API injoignable. L'absence
 * d'invitation est le cas ORDINAIRE, et un bandeau d'erreur pour ça inquiéterait sans rien
 * apprendre — le formulaire de code, lui, reste dessous et reste le chemin qui marche.
 */
function PendingInvitations({ currentCoachName }: Readonly<{ currentCoachName: string | null }>) {
  const { data: invitations } = useMyInvitations();
  if (invitations == null || invitations.length === 0) return null;

  return (
    <View className="gap-3">
      {invitations.map((invitation) => (
        <PendingInvitationCard
          key={invitation.id}
          invitation={invitation}
          currentCoachName={currentCoachName}
        />
      ))}
    </View>
  );
}

function LinkedCoachBlock({ coach }: Readonly<{ coach: CoachAthleteDto }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
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
  );
}

// L'athlète n'a pas de coach : on lui demande le code que le sien lui a communiqué. Il reste le
// chemin des invitations GÉNÉRIQUES, que la liste ci-dessus n'annonce jamais.
function JoinCoachForm() {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const [code, setCode] = useState("");

  return (
    <View className="gap-6">
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
    </View>
  );
}
