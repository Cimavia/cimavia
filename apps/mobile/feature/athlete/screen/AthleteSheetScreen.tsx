import {
  ATHLETE_SHEET_CONTENT_MAX_LENGTH,
  type AthleteSheetDto,
  athleteSheetDraft,
  type CoachAthleteDto,
  initialsOf,
  isEndedLink,
  type UpdateAthleteSheetInput,
} from "@cmv/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import {
  useAthleteSheet,
  useAthletes,
  useSaveAthleteSheet,
} from "@/feature/athlete/hook/useAthletes";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { useLatch } from "@/shared/hook/useLatch";
import { apiErrorMessage, isStaleWriteError } from "@/shared/lib/api";
import { formatInstantDate } from "@/shared/util/date.util";

/**
 * Fiche athlète sur mobile (#31) : UN champ texte libre, éditable par le coach seul (CDC §5.9).
 * Pas de structure imposée en MVP — objectifs, points de vigilance, blessures, tout y tient.
 *
 * Le nom vient de la liste d'athlètes déjà en cache, pas d'une requête de plus : `GET /athletes`
 * est chargée par le tableau de bord d'où l'on arrive.
 *
 * Suivi terminé (#911) : la fiche se relit, elle ne se modifie plus — l'API refuserait l'écriture
 * en 409. Tant que la liste se lit pour la première fois, on ne sait pas : la fiche se lit, sans
 * « Modifier » — offert puis retiré à l'arrivée d'un suivi terminé, il emporterait la frappe, comme
 * le composeur d'un débrief. Illisible, ou en pause hors ligne sans cache, la liste ne ferme rien :
 * l'édition s'offre, et c'est l'API qui tranche, comme avant #909.
 */
export function AthleteSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const athletes = useAthletes();
  const athlete = (athletes.data ?? []).find((relation) => relation.athleteId === id) ?? null;
  const followEndedText = useFollowEndedText();
  // Su une fois, ça ne se désapprend pas sur une relance, que TanStack remet en `pending` (#911).
  const known = useLatch(
    id,
    athletes.data != null || athletes.isError || athletes.fetchStatus === "paused",
  );
  const closedNote = known ? closedNoteOf(athlete, followEndedText) : undefined;

  return (
    <CmvScreen>
      <OfflineBanner />

      <ScrollView contentContainerClassName="gap-6 p-4">
        <AthleteIdentity athlete={athlete} />
        <SheetNote athleteId={id} followEnded={closedNote} />
      </ScrollView>
    </CmvScreen>
  );
}

/** « Suivi terminé le … » sur un lien rompu, `null` sur un suivi qui court — ou un athlète absent. */
function closedNoteOf(
  athlete: CoachAthleteDto | null,
  followEndedText: (endedAt: string | null) => string,
): string | null {
  return athlete != null && isEndedLink(athlete) ? followEndedText(athlete.endedAt) : null;
}

// L'en-tête : qui l'on regarde, et depuis quand on le suit.
function AthleteIdentity({ athlete }: Readonly<{ athlete: CoachAthleteDto | null }>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();

  return (
    <View className="flex-row items-center gap-3">
      {/* Fond NEUTRE : colorer une pastille par personne demanderait une palette décorative que
          `@cmv/tokens` n'a pas — ses familles sont des ÉTATS (arbitrage #37). */}
      <View className="h-11 w-11 items-center justify-center rounded-md bg-cmv-surface-hi">
        <CmvText className="font-cmv-display text-cmv-text-mid">
          {initialsOf(athlete?.athleteName ?? "")}
        </CmvText>
      </View>

      <View className="flex-1 gap-1">
        {/* « — » si la liste n'est pas (encore) là : on ne fabrique pas un nom depuis l'id. */}
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {athlete == null ? "—" : athleteLabel(athlete.athleteId, athlete.athleteName)}
        </CmvText>
        {/* `joinedAt` est nullable : la relation peut exister sans acceptation datée. */}
        <CmvText className="text-cmv-text-lo text-xs">
          {athlete?.joinedAt == null
            ? t("athlete.sheet.sinceUnknown")
            : t("athlete.sheet.since", { date: formatInstantDate(athlete.joinedAt) })}
        </CmvText>
      </View>
    </View>
  );
}

/**
 * La note, en deux modes RÉELS — lecture et édition — et non un champ toujours ouvert : sur un
 * téléphone, un formulaire permanent se modifie du pouce en faisant défiler l'écran.
 *
 * `draft` à `null` EST le mode lecture. Un booléen séparé pourrait mentir sur le contenu en cours
 * de saisie ; ici les deux ne peuvent pas diverger.
 *
 * Le brouillon porte la version de la fiche sur laquelle il a commencé (#440), figée à « Modifier » :
 * c'est elle que l'API compare, pas celle d'une relecture arrivée pendant la saisie.
 *
 * `followEnded` (« Suivi terminé le … », `null` sur un suivi qui court, `undefined` tant qu'on ne
 * le sait pas) n'ouvre l'édition que sur `null`, et la ferme même ouverte : la fin du suivi peut
 * arriver pendant la saisie, par une relecture de la liste.
 */
function SheetNote({
  athleteId,
  followEnded,
}: Readonly<{ athleteId: string; followEnded: string | null | undefined }>) {
  const { t } = useTranslation();
  const { data: sheet, isPending, isError, isFetching, refetch } = useAthleteSheet(athleteId);
  const save = useSaveAthleteSheet(athleteId);
  const [draft, setDraft] = useState<UpdateAthleteSheetInput | null>(null);
  const isStale = isStaleWriteError(save.error);

  // `draft` à `null` EST le mode lecture — mais on n'affiche rien tant que la fiche n'est pas
  // résolue : un « Aucune note » sur une requête en cours serait faux, pas vide.
  const isEditing = draft != null && followEnded === null;
  const isReading = !isPending && !isError && !isEditing;

  // « Recharger » REMPLACE la saisie par la dernière version (maquette #597), en restant en
  // édition — une fois celle-ci reçue seulement : sur une relecture ratée, la saisie reste.
  async function reload() {
    const { isSuccess, data } = await refetch();
    if (!isSuccess) return;
    setDraft(athleteSheetDraft(data ?? null));
    save.reset();
  }

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <View className="gap-1">
        <CmvText className="text-cmv-text-mid text-xs uppercase">
          {t("athlete.sheet.title")}
        </CmvText>
        {/* La fiche est PRIVÉE : aucune route ne la sert à l'athlète. Le dire évite au coach
            d'écrire en s'auto-censurant. */}
        <CmvText className="text-cmv-text-lo text-xs">{t("athlete.sheet.private")}</CmvText>
      </View>

      {isPending ? <ActivityIndicator /> : null}
      {isError ? <CmvErrorState onRetry={() => refetch()} /> : null}

      {isReading ? (
        <SheetReading
          sheet={sheet ?? null}
          followEnded={followEnded}
          onEdit={() => setDraft(athleteSheetDraft(sheet ?? null))}
        />
      ) : null}

      {isEditing ? (
        <>
          {isStale ? <StaleNotice onReload={reload} isReloading={isFetching} /> : null}
          <CmvTextField
            label={t("athlete.sheet.label")}
            placeholder={t("athlete.sheet.placeholder")}
            value={draft.content}
            onChangeText={(content) => setDraft({ ...draft, content })}
            multiline
            maxLength={ATHLETE_SHEET_CONTENT_MAX_LENGTH}
            editable={!save.isPending}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <CmvButton
                label={save.isPending ? t("athlete.sheet.saving") : t("athlete.sheet.save")}
                onPress={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}
                disabled={save.isPending}
              />
            </View>
            <View className="flex-1">
              <CmvButton
                label={t("common.cancel")}
                onPress={() => {
                  setDraft(null);
                  save.reset();
                }}
                disabled={save.isPending}
              />
            </View>
          </View>
          {save.isError && !isStale ? (
            <CmvText className="text-cmv-error-on text-sm">
              {/* Le refus de l'API se dit tel quel (« Ce suivi est terminé ») : une panne réseau
                  n'en est pas une. */}
              {apiErrorMessage(save.error) ?? t("athlete.sheet.error")}
            </CmvText>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * La note a changé pendant la saisie (#440) : l'API a refusé l'écriture. La saisie reste ; ni
 * version serveur à côté, ni nom d'auteur — tranché en #597.
 */
function StaleNotice({
  onReload,
  isReloading,
}: Readonly<{ onReload: () => void; isReloading: boolean }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-2 rounded-md border border-cmv-warning-line bg-cmv-warning-soft p-3">
      <CmvText className="text-cmv-warning-on text-sm">{t("athlete.sheet.stale")}</CmvText>
      <CmvButton label={t("common.staleReload")} onPress={onReload} disabled={isReloading} />
    </View>
  );
}

/**
 * Mode lecture. « Aucune fiche » et « fiche vidée » se rendent pareil, mais le BOUTON diffère :
 * « Ajouter » quand rien n'a jamais été écrit, « Modifier » ensuite — le coach sait ainsi s'il
 * repart de zéro ou s'il reprend quelque chose que l'API a déjà. Suivi terminé (`followEnded`) :
 * la fiche le dit, et ne s'offre plus à modifier — pas davantage tant qu'on l'ignore (`undefined`).
 */
function SheetReading({
  sheet,
  followEnded,
  onEdit,
}: Readonly<{
  sheet: AthleteSheetDto | null;
  followEnded: string | null | undefined;
  onEdit: () => void;
}>) {
  const { t } = useTranslation();
  const hasContent = sheet != null && sheet.content.trim().length > 0;

  return (
    <>
      {followEnded == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">
          {t("athlete.sheet.followEnded", { ended: followEnded })}
        </CmvText>
      )}
      {hasContent ? (
        <CmvText className="text-cmv-text-hi">{sheet.content}</CmvText>
      ) : (
        <CmvText className="text-cmv-text-lo text-sm">{t("athlete.sheet.empty")}</CmvText>
      )}
      {followEnded !== null ? null : (
        <CmvButton
          label={sheet == null ? t("athlete.sheet.add") : t("athlete.sheet.edit")}
          onPress={onEdit}
        />
      )}
    </>
  );
}
