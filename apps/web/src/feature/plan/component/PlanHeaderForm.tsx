import {
  daysBetweenIsoDates,
  isMondayIsoDate,
  mondayOfIsoWeek,
  type PlanDto,
  PlanStatus,
  type UpdatePlanInput,
} from "@cmv/shared";
import { type SyntheticEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanAthletePicker } from "@/feature/plan/component/PlanAthletePicker";
import { CmvButton, CmvCard, CmvTextArea, CmvTextField } from "@/shared/component";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { formatDate } from "@/shared/util/date.util";

type PlanHeaderFormProps = {
  plan: PlanDto;
  isSaving: boolean;
  onSave: (input: UpdatePlanInput) => void;
};

/**
 * Ce qui DÉFINIT un cycle — son titre, sa description, son début, son destinataire — au-dessus des
 * semaines (#207). Ces quatre champs ne se saisissaient qu'une fois, dans un panneau de création
 * qui ne revenait jamais : une faute de frappe dans le titre coûtait le cycle entier.
 *
 * Le destinataire a quitté l'en-tête FIXE pour venir ici : un seul endroit pour tout ce qui
 * définit le cycle l'emporte sur l'accès sans défilement, l'affectation se faisant une fois par
 * cycle et non en cours de construction.
 */
export function PlanHeaderForm({ plan, isSaving, onSave }: Readonly<PlanHeaderFormProps>) {
  const { t } = useTranslation();
  const toast = useMutationToast();

  const [title, setTitle] = useState(plan.title);
  const [description, setDescription] = useState(plan.description ?? "");
  const [startDate, setStartDate] = useState(plan.startDate);
  const [athleteId, setAthleteId] = useState(plan.athleteId);

  /**
   * Réaligné sur les VALEURS du serveur, jamais sur l'objet `plan` : celui-ci change à chaque
   * invalidation du cache — dont celles que déclenchent les autres écritures du builder (ajouter
   * une semaine, coller, enregistrer une séance). Dépendre de l'objet effacerait la saisie en
   * cours à chacune d'elles.
   */
  useEffect(() => {
    setTitle(plan.title);
    setDescription(plan.description ?? "");
    setStartDate(plan.startDate);
    setAthleteId(plan.athleteId);
  }, [plan.title, plan.description, plan.startDate, plan.athleteId]);

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
    toast.onInfo("plan.header.startDateSnapped", { date: formatDate(monday) });
  }

  /**
   * Ce qui a CHANGÉ, et rien d'autre. Renvoyer les quatre champs à chaque enregistrement ferait
   * traverser `shiftSessions` à une date immobile, et rejouerait la propagation du destinataire
   * sur six tables sans qu'il ait bougé. Le `undefined` d'`updatePlanSchema` existe pour ça.
   */
  function changedFields(): UpdatePlanInput {
    const input: UpdatePlanInput = {};
    const nextTitle = title.trim();
    if (nextTitle !== plan.title) input.title = nextTitle;
    // Une description vidée vaut `null` — l'absence, pas une chaîne vide qui n'est ni l'un ni
    // l'autre et que le rendu afficherait comme un paragraphe blanc.
    const nextDescription = description.trim() === "" ? null : description.trim();
    if (nextDescription !== plan.description) input.description = nextDescription;
    if (startDate !== plan.startDate) input.startDate = startDate;
    if (athleteId !== plan.athleteId) input.athleteId = athleteId;
    return input;
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const input = changedFields();
    if (!canSubmit) return;
    onSave(input);
  }

  const isPublished = plan.status === PlanStatus.PUBLISHED;
  const hasChanges = Object.keys(changedFields()).length > 0;
  const canSubmit =
    !isPublished && !isSaving && hasChanges && title.trim() !== "" && isMondayIsoDate(startDate);

  /**
   * De combien le cycle se déplace. `null` = la date n'a pas bougé, ou elle est en cours de saisie
   * et illisible : on n'annonce rien plutôt qu'un « 0 jour » inventé.
   */
  const shiftDays =
    startDate === plan.startDate ? null : daysBetweenIsoDates(plan.startDate, startDate);
  const warning = shiftWarning(shiftDays, plan.sessionCount);

  return (
    <CmvCard>
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("plan.header.title")}</h2>
          {/* Fermé et EXPLIQUÉ, jamais masqué : faire disparaître les champs laisserait croire
              qu'un cycle ne se nomme pas, alors qu'il ne se renomme plus. Même grammaire que
              « Coller ici », « Supprimer le cycle » et le sélecteur de destinataire. */}
          <p className="text-cmv-caption text-cmv-text-lo">
            {t(isPublished ? "plan.header.lockedPublished" : "plan.header.hint")}
          </p>
        </div>

        <div className="grid gap-cmv-md md:grid-cols-2">
          <CmvTextField
            label={t("plan.header.titleLabel")}
            name="planTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("plan.header.titlePlaceholder")}
            disabled={isPublished}
            required
            requiredMark
          />

          <PlanAthletePicker
            athleteId={athleteId}
            isPublished={isPublished}
            isBusy={isSaving}
            onChange={setAthleteId}
          />
        </div>

        <div className="flex flex-col gap-cmv-xs">
          <CmvTextField
            label={t("plan.header.startDate")}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            onBlur={snapToMonday}
            disabled={isPublished}
            required
            requiredMark
          />
          <p className="text-cmv-caption text-cmv-text-lo">{t("plan.header.startDateHint")}</p>
          {/* Déplacer la date REJOUE tout le cycle. Le dire avant l'enregistrement, sinon un
              report d'un mois se lit comme un simple champ de formulaire. */}
          {warning == null ? null : (
            <p className="text-cmv-caption text-cmv-warning-on">
              {/* Le décalage est composé À PART puis interpolé : i18next n'accorde que sur
                  `count`, et cette phrase en accorde DEUX — les séances et les jours. */}
              {t(warning.key, {
                count: plan.sessionCount,
                shift: t("plan.header.startDateShiftDays", { count: warning.days }),
              })}
            </p>
          )}
        </div>

        <CmvTextArea
          label={t("plan.header.descriptionLabel")}
          name="planDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("plan.header.descriptionPlaceholder")}
          disabled={isPublished}
          rows={3}
        />

        {isPublished ? null : (
          <div className="flex items-center gap-cmv-sm">
            <CmvButton type="submit" onClick={onSubmit} disabled={!canSubmit}>
              {isSaving ? t("plan.header.submitting") : t("plan.header.submit")}
            </CmvButton>
            <p className="text-cmv-caption text-cmv-text-lo">{t("plan.header.requiredLegend")}</p>
          </div>
        )}
      </form>
    </CmvCard>
  );
}

/**
 * Ce qu'un déplacement du début emporte, et dans quel sens. Avancer et repousser ne se disent pas
 * de la même façon : « de 7 jours » sans la direction laisse le coach deviner de quel côté son
 * cycle vient de partir.
 *
 * Rend la clé ET la distance, plutôt que la clé seule : la phrase accorde sur les SÉANCES et le
 * décalage sur les JOURS, et sans les deux valeurs à la main l'appelant retomberait sur un
 * `?? 0` — un zéro inventé là où le type dit « peut-être rien » (règle 5).
 *
 * DEUX clés littérales plutôt qu'une clé assemblée : une clé assemblée n'est lue ni par
 * TypeScript ni par i18next, et `check-i18n-keys.mjs` ne peut que la lister pour relecture
 * humaine — c'est-à-dire s'afficher en clair en production le jour où elle est renommée.
 *
 * On annonce les SÉANCES, et rien d'autre : l'API les décale toutes (`shiftSessions`), mais
 * l'échéance de la facture, elle, est une saisie du coach et ne suit pas.
 */
function shiftWarning(
  shiftDays: number | null,
  sessionCount: number,
): { key: string; days: number } | null {
  if (shiftDays == null || shiftDays === 0 || sessionCount === 0) return null;
  return {
    key: shiftDays > 0 ? "plan.header.startDateShiftLater" : "plan.header.startDateShiftEarlier",
    days: Math.abs(shiftDays),
  };
}
