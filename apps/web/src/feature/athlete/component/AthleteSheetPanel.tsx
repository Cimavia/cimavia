import {
  ATHLETE_SHEET_CONTENT_MAX_LENGTH,
  type AthleteIdentity,
  athleteSheetDraft,
  type CoachAthleteDto,
  isEndedLink,
  type UpdateAthleteSheetInput,
} from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { accountApi } from "@/feature/athlete/api";
import {
  useAthleteSheet,
  useAthletes,
  useSaveAthleteSheet,
} from "@/feature/athlete/hook/useAthletes";
import {
  CmvButton,
  CmvConfirmButton,
  CmvErrorState,
  CmvPanel,
  CmvReadOnlyBanner,
  CmvStaleBanner,
  CmvTextArea,
} from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { useEndFollow } from "@/shared/hook/useEndFollow";
import { useFollowEndedText } from "@/shared/hook/useFollowEndedText";
import { isStaleWriteError } from "@/shared/lib/api";

type AthleteSheetPanelProps = {
  /**
   * Un id et un nom, pas un `CoachAthleteDto` : c'est tout ce que ce panneau lit, et l'exiger
   * entier obligeait chaque appelant à charger la liste des athlètes pour ouvrir une fiche. Le
   * volet de lecture d'un débrief, lui, a déjà les deux sous la main.
   */
  athlete: AthleteIdentity;
  onClose: () => void;
};

/**
 * Fiche athlète : UN champ texte libre, éditable par le coach seul (CDC §5.9). Pas de structure
 * imposée en MVP — objectifs, points forts, notes, tout tient dans ce champ.
 *
 * C'est aussi d'ici que le Coach met fin au suivi (#910), et la fiche d'un suivi terminé se relit
 * sans s'écrire (l'API la refuse en 409). Le lien se lit dans la liste des athlètes, déjà en cache
 * sous le tableau de bord : le panneau garde son contrat d'un id et d'un nom.
 */
export function AthleteSheetPanel({ athlete, onClose }: Readonly<AthleteSheetPanelProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: sheet, isError, isFetching, refetch } = useAthleteSheet(athlete.athleteId);
  const saveSheet = useSaveAthleteSheet(athlete.athleteId);
  const link = useAthletes().data?.find((item) => item.athleteId === athlete.athleteId) ?? null;
  const followEnded = link != null && isEndedLink(link);
  const followEndedText = useFollowEndedText();

  // `PUT` REMPLACE la fiche (#301) : n'offrir l'édition que sur une fiche REÇUE, sinon un échec de
  // lecture se rend comme une fiche vierge et l'enregistrement efface des mois de notes. Le critère
  // est la donnée, pas `isError` : au retour d'onglet, une relance ratée passe `isError` à vrai
  // alors que la fiche est en cache — masquer le formulaire perdrait le brouillon en cours.
  const isReceived = sheet !== undefined;
  const canSave = isReceived && !followEnded;

  /**
   * `null` tant que le coach n'a pas tapé : le champ suit alors la fiche en cache. À la première
   * frappe, le brouillon fige la version que l'enregistrement citera (#440) — pas celle du cache au
   * moment d'enregistrer : au retour d'onglet, la relance y range la version d'un autre onglet, et
   * la citer ferait passer le brouillon par-dessus sans un mot.
   */
  const [draft, setDraft] = useState<UpdateAthleteSheetInput | null>(null);
  const current = draft ?? athleteSheetDraft(sheet ?? null);
  const isStale = isStaleWriteError(saveSheet.error);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    saveSheet.mutate(current, { onSuccess: onClose });
  }

  // « Recharger » REMPLACE la saisie par la dernière version (maquette #597) — une fois celle-ci
  // reçue seulement : sur une relecture ratée, le brouillon et le bandeau restent.
  async function onReload() {
    const { isSuccess } = await refetch();
    if (!isSuccess) return;
    setDraft(null);
    saveSheet.reset();
  }

  return (
    <CmvPanel
      open
      title={athleteLabel(athlete.athleteId, athlete.athleteName)}
      description={t("athlete.sheet.description")}
      onClose={onClose}
      footer={
        <>
          <CmvButton variant="ghost" onClick={onClose} disabled={saveSheet.isPending}>
            {t("common.cancel")}
          </CmvButton>
          {canSave ? (
            <CmvButton type="submit" onClick={onSubmit} disabled={saveSheet.isPending}>
              {saveSheet.isPending ? t("athlete.sheet.submitting") : t("athlete.sheet.submit")}
            </CmvButton>
          ) : null}
        </>
      }
    >
      {isReceived ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
          {followEnded ? <CmvReadOnlyBanner message={followEndedText(link.endedAt)} /> : null}
          {isStale ? (
            <CmvStaleBanner
              message={t("athlete.sheet.stale")}
              onReload={onReload}
              isReloading={isFetching}
            />
          ) : null}
          <CmvTextArea
            label={t("athlete.sheet.label")}
            name="sheetContent"
            value={current.content}
            onChange={(event) => setDraft({ ...current, content: event.target.value })}
            placeholder={t("athlete.sheet.placeholder")}
            rows={16}
            maxLength={ATHLETE_SHEET_CONTENT_MAX_LENGTH}
            disabled={followEnded}
          />
        </form>
      ) : (
        <SheetUnavailable isError={isError} onRetry={() => refetch()} />
      )}
      {link == null || followEnded || link.isSelf ? null : <EndFollow link={link} />}
    </CmvPanel>
  );
}

/**
 * Mettre fin au suivi (#910) : sous la fiche, à l'écart de son enregistrement — ce n'est pas un
 * réglage de la fiche, c'est la fin du couple. En deux temps, et l'avertissement dit ce qui reste
 * et ce qui cesse au moment de confirmer. Rien pour l'auto-coaching : il n'a pas de lien à rompre.
 */
function EndFollow({ link }: Readonly<{ link: CoachAthleteDto }>) {
  const { t } = useTranslation();
  const end = useEndFollow("coach", accountApi);

  return (
    <section className="mt-cmv-xl flex flex-col items-start gap-cmv-sm border-cmv-border border-t pt-cmv-lg">
      <p className="text-cmv-caption text-cmv-text-mid">{t("follow.end.coach.description")}</p>
      <CmvConfirmButton
        label={t("follow.end.coach.action")}
        confirmLabel={t("follow.end.coach.confirm")}
        cancelLabel={t("common.cancel")}
        confirmHint={t("follow.end.coach.hint", { name: link.athleteName })}
        disabled={end.isPending}
        onConfirm={() => end.mutate(link.athleteId)}
      />
    </section>
  );
}

// Tant que la fiche n'est pas reçue : un échec se dit, il ne se rend jamais comme une fiche vide.
function SheetUnavailable({
  isError,
  onRetry,
}: Readonly<{ isError: boolean; onRetry: () => void }>) {
  const { t } = useTranslation();

  if (isError) {
    return (
      <CmvErrorState
        title={t("common.errorTitle")}
        description={t("common.errorDescription")}
        retryLabel={t("common.retry")}
        onRetry={onRetry}
      />
    );
  }
  return <p className="text-cmv-text-mid">{t("common.loading")}</p>;
}
