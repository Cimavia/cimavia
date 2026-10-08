import { type CoachAthleteDto, coachPresence, initialsOf } from "@cmv/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useMyCoaches, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";
import { authClient } from "@/shared/lib/auth";
import { formatInstantDate } from "@/shared/util/date.util";

/**
 * « Mes coachs » (p4-5, #599) — on y arrive par le Profil, le planning d'un athlète sans coach ou
 * une invitation notifiée. Un athlète est suivi par 0..N coachs : une ligne par coach, chacune
 * menant à son fil ; sans coach, l'adresse à laquelle un coach doit l'inviter.
 *
 * Il n'y a plus de code à saisir (#390) : une invitation vise une adresse et n'apparaît qu'au
 * compte qui la porte. Les invitations en attente se posent AU-DESSUS (#146), coach ou pas, et
 * restent acceptables depuis #599 : être suivi n'empêche plus d'en rejoindre un autre.
 *
 * Chaque lien dit d'où il vient (#602) : « via F » sous le nom du coach quand une entreprise l'a
 * créé, rien quand il est direct.
 *
 * Relue à chaque passage au premier plan, coachs ET invitations : le cache est persisté et frais
 * 5 min, et un Coach qui rejoint l'entreprise de l'athlète (#602) apparaît sans que l'athlète ait
 * rien fait. Sans ce refetch, ni la relance de l'app ni le retour sur l'écran ne le montraient.
 *
 * Quatre états et non deux (#364) : tant que la liste charge ou qu'elle a échoué, on ne dit pas
 * « aucun coach » — c'était le cas avant, l'écran rendait l'absence pendant le chargement.
 */
export function MyCoachesScreen() {
  const { t } = useTranslation();
  const coaches = useMyCoaches();
  const presence = coachPresence(coaches);
  const { refetch: refetchCoaches } = coaches;
  const { refetch: refetchInvitations } = useMyInvitations();

  useFocusEffect(
    useCallback(() => {
      void refetchCoaches();
      void refetchInvitations();
    }, [refetchCoaches, refetchInvitations]),
  );

  return (
    <CmvScreen>
      <ScrollView contentContainerClassName="gap-6 p-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">{t("coach.title")}</CmvText>
        <PendingInvitations />
        {presence === "loading" ? <ActivityIndicator /> : null}
        {presence === "error" ? <CmvErrorState onRetry={() => coaches.refetch()} /> : null}
        {presence === "none" ? <NoCoachBlock /> : null}
        {presence === "some" ? <CoachList coaches={coaches.data ?? []} /> : null}
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
function PendingInvitations() {
  const { data: invitations } = useMyInvitations();
  if (invitations == null || invitations.length === 0) return null;

  return (
    <View className="gap-3">
      {invitations.map((invitation) => (
        <PendingInvitationCard key={invitation.id} invitation={invitation} />
      ))}
    </View>
  );
}

function CoachList({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
      <View className="gap-3">
        {coaches.map((coach) => (
          <CoachRow key={coach.id} coach={coach} />
        ))}
      </View>
      {/* Être suivi n'empêche plus d'en rejoindre un autre : l'adresse reste utile. */}
      <Address description={t("coach.more.description")} />
    </View>
  );
}

function CoachRow({ coach }: Readonly<{ coach: CoachAthleteDto }>) {
  const { t } = useTranslation();
  const { current, select } = useCapabilitySwitch();

  /**
   * Écrire à son coach est un geste d'ATHLÈTE : le fil se résout et se lit à ce titre. Un compte à
   * double capacité arrivé ici depuis son espace coach y bascule d'abord — sinon le fil
   * chercherait un athlète du nom de son coach.
   */
  function openThread() {
    if (current === "coach") select("athlete");
    router.push(`/messages/${coach.coachId}`);
  }

  // Le bouton SOUS l'identité, comme sur la carte d'invitation : `CmvButton` prend toute la
  // largeur, et posé à côté du nom il l'écrasait jusqu'à zéro.
  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-md bg-cmv-surface-hi">
          <CmvText className="font-cmv-display text-cmv-text-mid text-xs">
            {initialsOf(coach.coachName)}
          </CmvText>
        </View>
        <View className="flex-1 gap-1">
          <CmvText className="text-cmv-text-hi" numberOfLines={1}>
            {coach.coachName}
          </CmvText>
          {/* `null` = lien direct, « aucune entreprise » et non une donnée manquante : pas de « — ». */}
          {coach.organizationName == null ? null : (
            <CmvText className="text-cmv-text-mid text-xs" numberOfLines={1}>
              {t("coach.via", { name: coach.organizationName })}
            </CmvText>
          )}
          {/* `joinedAt` est nullable (relation posée sans acceptation) : « — », pas de date
              inventée. */}
          <CmvText className="text-cmv-text-lo text-xs">
            {coach.joinedAt == null
              ? t("coach.sinceUnknown")
              : t("coach.since", { date: formatInstantDate(coach.joinedAt) })}
          </CmvText>
        </View>
      </View>
      <CmvButton label={t("coach.message")} onPress={openThread} />
    </View>
  );
}

/**
 * L'athlète n'a pas de coach : on lui dit à quelle adresse un coach doit l'inviter (#390).
 *
 * C'est le seul recours qui reste à une invitation partie vers une autre adresse : sans code à
 * saisir, un compte créé avec une autre adresse ne verrait jamais la carte, et rien ne lui dirait
 * pourquoi.
 */
function NoCoachBlock() {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
      <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
        {t("coach.join.title")}
      </CmvText>
      <Address description={t("coach.join.description")} />
    </View>
  );
}

/** L'adresse que l'athlète donne à un coach pour qu'il l'invite — avec ou sans coach déjà. */
function Address({ description }: Readonly<{ description: string }>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  return (
    <View className="gap-1">
      <CmvText className="text-cmv-text-mid text-sm">{description}</CmvText>
      <CmvText className="mt-2 text-cmv-text-lo text-xs">{t("coach.join.address")}</CmvText>
      {/* Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5). */}
      <CmvText className="text-cmv-text-hi">{session?.user.email ?? "—"}</CmvText>
    </View>
  );
}
