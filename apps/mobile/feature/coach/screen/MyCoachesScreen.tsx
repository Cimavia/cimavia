import {
  type CoachAthleteDto,
  coachPresence,
  directConversationWith,
  splitFollows,
} from "@cmv/shared";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { PendingInvitationCard } from "@/feature/coach/component/PendingInvitationCard";
import { useLeaveCoach, useMyCoaches, useMyInvitations } from "@/feature/coach/hook/useMyCoach";
import { useConversations, useOpenCoachConversation } from "@/feature/message/hook/useConversation";
import {
  CmvAvatar,
  CmvButton,
  CmvConfirmButton,
  CmvErrorState,
  CmvScreen,
  CmvText,
} from "@/shared/component";
import { CmvArchiveList } from "@/shared/component/CmvArchiveList";
import { useArchiveThreadActions } from "@/shared/hook/useArchiveThreadActions";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { apiErrorMessage } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";
import { openUnder } from "@/shared/lib/open-under";
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
 *
 * L'athlète quitte un coach depuis sa carte (#911). Les coachs quittés — ou qui ont mis fin au
 * suivi — passent dans « Anciens coachs », replié sous la liste : leur fil se relit. Sans coach en
 * cours, le bloc « pas de coach » revient, l'archive dessous.
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
        {coaches.data == null ? null : <Follows coaches={coaches.data} />}
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

/**
 * Les suivis en cours, puis l'archive de ceux qui ont pris fin (#911). Montée seulement s'il y en a :
 * elle lit les fils pour s'y rouvrir, et un athlète qui n'a quitté personne n'a rien à y relire.
 */
function Follows({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { ongoing, ended } = splitFollows(coaches);
  return (
    <>
      {ongoing.length === 0 ? <NoCoachBlock /> : <CoachList coaches={ongoing} />}
      {ended.length === 0 ? null : <FormerCoaches coaches={ended} />}
    </>
  );
}

/**
 * Les anciens coachs, le plus récent d'abord. Leur fil se relit par son id, à titre d'athlète :
 * `useOpenCoachConversation` ouvrirait — ou créerait — un fil avec un coach encore suivi, et l'API
 * refuse d'en créer un vers un suivi terminé. Sans fil, rien à relire, pas de bouton.
 */
function FormerCoaches({ coaches }: Readonly<{ coaches: CoachAthleteDto[] }>) {
  const { t } = useTranslation();
  const endedText = useFollowEndedText();
  const threadActions = useArchiveThreadActions("athlete");
  const { data: conversations } = useConversations("athlete");

  const items = coaches.map((coach) => ({
    id: coach.id,
    name: coach.coachName,
    detail: endedText(coach.endedAt),
    actions: threadActions(directConversationWith(conversations, coach.coachId, "coach")),
  }));

  return (
    <CmvArchiveList title={t("follow.archive.coaches", { count: coaches.length })} items={items} />
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
  const capabilitySwitch = useCapabilitySwitch();
  const open = useOpenCoachConversation();
  const leave = useLeaveCoach();

  /**
   * Écrire à son coach est un geste d'ATHLÈTE : le fil se résout et se lit à ce titre. Un compte à
   * double capacité arrivé ici depuis son espace coach y bascule avant d'y aller (`openUnder`) —
   * sinon la conversation se chercherait dans sa liste de coach. Depuis #612 un fil s'ouvre par son
   * id : on résout la conversation à deux, puis on bascule et on y va. Un fil qui ne s'ouvre pas ne
   * change donc pas d'espace sous les yeux.
   */
  function openThread() {
    open.mutate(coach.coachId, {
      onSuccess: (conversation) =>
        openUnder(`/messages/${conversation.id}`, "athlete", capabilitySwitch),
    });
  }

  // Le bouton SOUS l'identité, comme sur la carte d'invitation : `CmvButton` prend toute la
  // largeur, et posé à côté du nom il l'écrasait jusqu'à zéro.
  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      <View className="flex-row items-center gap-3">
        <CmvAvatar name={coach.coachName} />
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
      {open.isError ? (
        <CmvText className="text-cmv-error-on text-sm">{t("coach.messageError")}</CmvText>
      ) : null}
      <CmvButton label={t("coach.message")} onPress={openThread} disabled={open.isPending} />
      {/* Les seuls liens à rompre : ni l'auto-coaching (absent de cette liste), ni un suivi terminé
          (rangé dans l'archive). Armé, il dit ce qui reste et ce qui cesse (#911). Pas en rouge :
          rien ne s'efface, l'archive se relit. */}
      <CmvConfirmButton
        label={t("follow.end.athlete.action")}
        confirmLabel={t("follow.end.athlete.confirm")}
        cancelLabel={t("common.cancel")}
        confirmHint={t("follow.end.athlete.hint", { name: coach.coachName })}
        variant="ghost"
        disabled={leave.isPending}
        onConfirm={() => leave.mutate(coach.coachId)}
      />
      {/* Pas de toast sur mobile : l'échec se dit sur la carte, celle qu'on voulait quitter. */}
      {leave.isError ? (
        <CmvText className="text-cmv-error-on text-sm">
          {apiErrorMessage(leave.error) ?? t("follow.end.athlete.error")}
        </CmvText>
      ) : null}
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
