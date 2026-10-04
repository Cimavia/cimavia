import type { CoachAthleteDto } from "@cmv/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useMyCoach, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Rejoindre son coach (p4-5) — depuis la carte de son invitation, seul chemin depuis #390 : il n'y
 * a plus de code à saisir, une invitation vise une adresse et n'apparaît qu'au compte qui la porte.
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
        {/* Déjà lié : un athlète n'a qu'un coach (invariant multi-tenant). */}
        {coach == null ? <NoCoachBlock /> : <LinkedCoachBlock coach={coach} />}
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
 * apprendre.
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

/**
 * L'athlète n'a pas de coach : on lui dit à quelle adresse son coach doit l'inviter (#390).
 *
 * C'est le seul recours qui reste à une invitation partie vers une autre adresse : sans code à
 * saisir, un compte créé avec une autre adresse ne verrait jamais la carte, et rien ne lui dirait
 * pourquoi. L'adresse affichée est celle qu'il peut donner à son coach.
 */
function NoCoachBlock() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  return (
    <View className="gap-4">
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("coach.join.title")}
        </CmvText>
        <CmvText className="text-cmv-text-mid text-sm">{t("coach.join.description")}</CmvText>
      </View>
      <View className="gap-1">
        <CmvText className="text-cmv-text-lo text-xs">{t("coach.join.address")}</CmvText>
        {/* Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5). */}
        <CmvText className="text-cmv-text-hi">{session?.user.email ?? "—"}</CmvText>
      </View>
    </View>
  );
}
