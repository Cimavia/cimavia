import { isMondayIsoDate, mondayOfIsoWeek, PLAN_MAX_WEEKS, PlanWeekType } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { DEFAULT_WEEK_COUNT } from "@/feature/plan/constant";
import { useCreatePlan } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { formatDate } from "@/shared/util/date.util";

type PlanFormProps = {
  open: boolean;
  onClose: () => void;
};

// Création d'un cycle. À l'enregistrement, on ouvre directement le builder : un plan sans séance
// n'a aucun intérêt, autant enchaîner.
export function PlanForm({ open, onClose }: Readonly<PlanFormProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const navigate = useNavigate();
  const { data: athletes } = useAthletes();
  const createPlan = useCreatePlan();
  const toast = useMutationToast();

  const [athleteId, setAthleteId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weekCount, setWeekCount] = useState(DEFAULT_WEEK_COUNT);

  /**
   * Un cycle démarre un lundi (contrainte du schéma partagé). Plutôt que de rejeter la saisie du
   * coach, on RÉÉCRIT le champ au lundi de la semaine choisie dès qu'il le quitte — et on le lui
   * DIT par un toast : une valeur qui change toute seule sans explication est plus déroutante
   * qu'un refus.
   */
  function snapToMonday() {
    if (startDate === "" || isMondayIsoDate(startDate)) return;
    const monday = mondayOfIsoWeek(startDate);
    if (monday == null) return;
    setStartDate(monday);
    toast.onInfo("plan.form.startDateSnapped", { date: formatDate(monday) });
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (!isMondayIsoDate(startDate)) return;

    createPlan.mutate(
      {
        // Le choix neutre du sélecteur vaut « pas encore décidé » (#144), et se transmet comme
        // tel : `null`, pas une chaîne vide que l'API prendrait pour un identifiant.
        athleteId: athleteId === "" ? null : athleteId,
        title: title.trim(),
        description: description.trim() || null,
        startDate,
        weeks: Array.from({ length: weekCount }, () => ({ type: PlanWeekType.TRAINING })),
      },
      {
        onSuccess: (plan) => {
          onClose();
          navigate({ to: "/plans/$planId", params: { planId: plan.id } });
        },
      },
    );
  }

  // L'athlète n'en fait plus partie : un cycle se construit avant de savoir pour qui (#144).
  const canSubmit = title.trim() !== "" && startDate !== "";

  return (
    <CmvPanel
      open={open}
      title={t("plan.form.title")}
      description={t("plan.form.description")}
      onClose={onClose}
      footer={
        <>
          <CmvButton variant="ghost" onClick={onClose} disabled={createPlan.isPending}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton type="submit" onClick={onSubmit} disabled={!canSubmit || createPlan.isPending}>
            {createPlan.isPending ? t("plan.form.submitting") : t("plan.form.submit")}
          </CmvButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-lg">
        <div className="flex flex-col gap-cmv-xs">
          <CmvSelect
            label={t("plan.form.athlete")}
            name="athleteId"
            value={athleteId}
            onChange={(event) => setAthleteId(event.target.value)}
            // Le choix neutre porte un libellé qui DIT ce qu'il vaut. Une option vide laisserait
            // croire à un oubli là où c'est une décision qu'on remet à plus tard (#144).
            placeholder={t("plan.form.athletePlaceholder")}
            // « (moi) » sur sa propre entrée : dans une liste d'athlètes, son propre nom ne se
            // distingue pas des autres — et écrire un cycle pour soi n'est pas le cas courant (#14).
            options={(athletes ?? []).map((relation) => ({
              value: relation.athleteId,
              label: athleteLabel(relation.athleteId, relation.athleteName),
            }))}
          />
          <p className="text-cmv-caption text-cmv-text-lo">{t("plan.form.athleteHint")}</p>
        </div>

        <CmvTextField
          label={t("plan.form.titleLabel")}
          name="planTitle"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("plan.form.titlePlaceholder")}
          required
        />

        <CmvTextArea
          label={t("plan.form.descriptionLabel")}
          name="planDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("plan.form.descriptionPlaceholder")}
          rows={3}
        />

        <div className="flex flex-col gap-cmv-xs">
          <CmvTextField
            label={t("plan.form.startDate")}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            onBlur={snapToMonday}
            required
          />
          <p className="text-cmv-caption text-cmv-text-lo">{t("plan.form.startDateHint")}</p>
        </div>

        <CmvTextField
          label={t("plan.form.weekCount")}
          name="weekCount"
          type="number"
          value={String(weekCount)}
          onChange={(event) => setWeekCount(Number(event.target.value))}
          min={1}
          max={PLAN_MAX_WEEKS}
        />
      </form>
    </CmvPanel>
  );
}
