import { isMondayIsoDate, mondayOfIsoWeek, PLAN_MAX_WEEKS, PlanWeekType } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_WEEK_COUNT } from "@/feature/plan/constant";
import { useAthletes, useCreatePlan } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

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

  const [athleteId, setAthleteId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weekCount, setWeekCount] = useState(DEFAULT_WEEK_COUNT);

  // Un cycle démarre un lundi (contrainte du schéma partagé) : plutôt que de rejeter la saisie du
  // coach, on la ramène au lundi de la semaine choisie — et on le lui dit.
  const snappedDate = startDate === "" ? "" : (mondayOfIsoWeek(startDate) ?? "");
  const wasSnapped = startDate !== "" && !isMondayIsoDate(startDate);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (athleteId === "" || snappedDate === "") return;

    const plan = await createPlan.mutateAsync({
      athleteId,
      title: title.trim(),
      description: description.trim() || null,
      startDate: snappedDate,
      weeks: Array.from({ length: weekCount }, () => ({ type: PlanWeekType.TRAINING })),
    });
    onClose();
    navigate({ to: "/plans/$planId", params: { planId: plan.id } });
  }

  const errorMessage = apiErrorMessage(createPlan.error);
  const canSubmit = athleteId !== "" && title.trim() !== "" && snappedDate !== "";

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
            required
          />
          <p className="text-cmv-caption text-cmv-text-lo">
            {wasSnapped
              ? t("plan.form.startDateSnapped", { date: snappedDate })
              : t("plan.form.startDateHint")}
          </p>
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

        {errorMessage == null ? null : (
          <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
        )}
      </form>
    </CmvPanel>
  );
}
