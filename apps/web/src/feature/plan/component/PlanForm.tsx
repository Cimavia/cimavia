import { isMondayIsoDate, mondayOfIsoWeek, PLAN_MAX_WEEKS, PlanWeekType } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_WEEK_COUNT } from "@/feature/plan/constant";
import { useAthletes, useCreatePlan } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (athleteId === "" || !isMondayIsoDate(startDate)) return;

    createPlan.mutate(
      {
        athleteId,
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

  const canSubmit = athleteId !== "" && title.trim() !== "" && startDate !== "";

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
        <CmvSelect
          label={t("plan.form.athlete")}
          name="athleteId"
          value={athleteId}
          onChange={(event) => setAthleteId(event.target.value)}
          placeholder={t("plan.form.athletePlaceholder")}
          options={(athletes ?? []).map((relation) => ({
            value: relation.athleteId,
            label: relation.athleteName,
          }))}
          required
        />

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
