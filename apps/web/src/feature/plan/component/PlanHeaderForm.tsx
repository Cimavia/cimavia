import {
  daysBetweenIsoDates,
  mondayOfIsoWeek,
  PLAN_DESCRIPTION_MAX_LENGTH,
  PLAN_TITLE_MAX_LENGTH,
  type PlanDto,
  PlanStatus,
  sameJson,
  type UpdatePlanInput,
} from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanAthletePicker } from "@/feature/plan/component/PlanAthletePicker";
import { CmvButton, CmvCard, CmvStaleBanner, CmvTextArea, CmvTextField } from "@/shared/component";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { useReportDirty } from "@/shared/hook/useReportDirty";
import { formatDate } from "@/shared/util/date.util";

type PlanHeaderFormProps = {
  plan: PlanDto;
  /** Un justificatif est joint à la facturation : le destinataire est figé (#472). */
  hasInvoiceDocument: boolean;
  /** Le cycle d'un autre Coach, ouvert en Lecture (#607) : rien ne se saisit, rien ne part. */
  readOnly: boolean;
  /** Réaffecter le cycle reste au propriétaire (#607) : en Écriture, le destinataire est figé. */
  canReassign: boolean;
  isSaving: boolean;
  /** `onSaved` reçoit le cycle tel qu'enregistré : sa version est celle que NOUS avons écrite. */
  onSave: (input: UpdatePlanInput, onSaved: (saved: PlanDto) => void) => void;
  /** Le dernier enregistrement a été refusé : le cycle a changé depuis le début de la saisie (#604). */
  isStale: boolean;
  isReloading: boolean;
  /** Relit le cycle ; l'écran remonte alors le formulaire sur la dernière version. */
  onReload: () => void;
  /**
   * Une saisie diffère de ce qui est enregistré : « Diffuser », qui part avec le cycle ENREGISTRÉ,
   * se ferme tant que c'est vrai (#326). Doit être stable : un `setState` de l'écran.
   */
  onDirtyChange: (isDirty: boolean) => void;
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
export function PlanHeaderForm({
  plan,
  hasInvoiceDocument,
  readOnly,
  canReassign,
  isSaving,
  onSave,
  isStale,
  isReloading,
  onReload,
  onDirtyChange,
}: Readonly<PlanHeaderFormProps>) {
  const { t } = useTranslation();
  const toast = useMutationToast();

  /**
   * `null` tant que le coach n'a rien saisi : les champs suivent alors le cycle en cache, version
   * comprise. La première saisie fige les champs ET la version que l'enregistrement citera (#604)
   * — pas celle du cache au moment d'enregistrer : une autre écriture du builder ou un retour
   * d'onglet y range peut-être celle d'un autre Coach, et la citer ferait passer la saisie
   * par-dessus sans un mot.
   */
  const [draft, setDraft] = useState<HeaderDraft | null>(null);
  const current = draft ?? headerDraft(plan);
  const { title, description, startDate, athleteId } = current;
  /**
   * Une saisie revenue à son point de départ relâche le brouillon : le formulaire paraît propre, il
   * doit aussi suivre de nouveau le cycle. Figé, il opposerait à la prochaine écriture d'un autre
   * Coach des champs que personne n'a touchés, et un 409 certain.
   */
  const settle = (next: HeaderDraft) => (sameJson(next, headerDraft(plan)) ? null : next);

  function edit(change: Partial<HeaderDraft>) {
    setDraft(settle({ ...current, ...change }));
  }

  /**
   * Le début qui sera ENREGISTRÉ : le lundi de la semaine saisie. C'est sur lui, et non sur la
   * saisie brute, que se jugent le bouton, le décalage annoncé et ce qui part (#545) — sinon un
   * jeudi choisi au calendrier, qui ne fait pas perdre le focus, grise un bouton dont le clic
   * enregistre pourtant. `null` = champ vide ou illisible : rien ne part, aucun repli.
   */
  const effectiveStartDate = mondayOfIsoWeek(startDate);

  /**
   * Un cycle démarre un lundi (contrainte du schéma partagé). Plutôt que de rejeter la saisie du
   * coach, on RÉÉCRIT le champ au lundi de la semaine choisie dès qu'il le quitte — et on le lui
   * DIT par un toast : une valeur qui change toute seule sans explication est plus déroutante
   * qu'un refus.
   */
  function snapToMonday(): HeaderDraft | null {
    if (effectiveStartDate == null || effectiveStartDate === startDate) return draft;
    const snapped = settle({ ...current, startDate: effectiveStartDate });
    setDraft(snapped);
    toast.onInfo("plan.header.startDateSnapped", { date: formatDate(effectiveStartDate) });
    // Le brouillon tel qu'il part — `null` s'il suit le cycle : la confirmation s'y compare.
    return snapped;
  }

  /**
   * Ce qui a CHANGÉ, et rien d'autre. Renvoyer les quatre champs à chaque enregistrement ferait
   * traverser `shiftSessions` à une date immobile, et rejouerait la propagation du destinataire
   * sur six tables sans qu'il ait bougé. Le `undefined` d'`updatePlanSchema` existe pour ça.
   */
  function changedFields(): HeaderChanges {
    const input: HeaderChanges = {};
    const nextTitle = title.trim();
    if (nextTitle !== plan.title) input.title = nextTitle;
    // Une description vidée vaut `null` — l'absence, pas une chaîne vide qui n'est ni l'un ni
    // l'autre et que le rendu afficherait comme un paragraphe blanc.
    const nextDescription = description.trim() === "" ? null : description.trim();
    if (nextDescription !== plan.description) input.description = nextDescription;
    if (effectiveStartDate != null && effectiveStartDate !== plan.startDate) {
      input.startDate = effectiveStartDate;
    }
    if (athleteId !== plan.athleteId) input.athleteId = athleteId;
    return input;
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    // `canSubmit` faux ferme le bouton, donc aussi l'envoi à la touche Entrée. Ouvert, Entrée
    // envoie sans passer par le blur : le recalage se fait ici aussi, pour que le champ et le
    // toast disent ce qui part.
    const sent = snapToMonday();
    onSave({ ...changedFields(), expectedUpdatedAt: current.version }, (saved) =>
      // Rien saisi pendant l'envoi : le formulaire repart du cycle enregistré. Sinon la saisie
      // reste, et cite la version que NOUS venons d'écrire — pas un conflit avec soi-même.
      setDraft((latest) =>
        latest === sent ? null : latest && { ...latest, version: saved.updatedAt },
      ),
    );
  }

  const isPublished = plan.status === PlanStatus.PUBLISHED;
  // Figé, diffusé ou en Lecture : les champs se lisent, aucun ne se saisit.
  const isLocked = isPublished || readOnly;
  const hasChanges = Object.keys(changedFields()).length > 0;
  const canSubmit =
    !isLocked && !isSaving && hasChanges && title.trim() !== "" && effectiveStartDate != null;
  /**
   * Plus large que `hasChanges` : une date effacée ou illisible n'entre pas dans ce qui part, mais
   * l'écran ne montre plus la date enregistrée — diffuser maintenant partirait sur une valeur que
   * le coach n'a plus sous les yeux. Le début d'un cycle n'est jamais `null` en base : un champ
   * illisible est donc toujours un écart.
   */
  useReportDirty(hasChanges || effectiveStartDate == null, onDirtyChange);

  /**
   * De combien le cycle se déplace — entre deux lundis, donc toujours un multiple de 7. `null` = la
   * date est en cours de saisie et illisible : on n'annonce rien plutôt qu'un « 0 jour » inventé.
   */
  const shiftDays =
    effectiveStartDate == null ? null : daysBetweenIsoDates(plan.startDate, effectiveStartDate);
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
            {t(headerHintKey(isPublished, readOnly))}
          </p>
        </div>

        {isStale ? (
          <CmvStaleBanner
            message={t("plan.header.stale")}
            onReload={onReload}
            isReloading={isReloading}
          />
        ) : null}

        <div className="grid gap-cmv-md md:grid-cols-2">
          <CmvTextField
            label={t("plan.header.titleLabel")}
            name="planTitle"
            maxLength={PLAN_TITLE_MAX_LENGTH}
            value={title}
            onChange={(event) => edit({ title: event.target.value })}
            placeholder={t("plan.header.titlePlaceholder")}
            disabled={isLocked}
            required
            requiredMark
          />

          <PlanAthletePicker
            athleteId={athleteId}
            isPublished={isPublished}
            hasInvoiceDocument={hasInvoiceDocument}
            isOwnerOnly={!canReassign}
            isBusy={isSaving}
            onChange={(next) => edit({ athleteId: next })}
          />
        </div>

        <div className="flex flex-col gap-cmv-xs">
          <CmvTextField
            label={t("plan.header.startDate")}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => edit({ startDate: event.target.value })}
            onBlur={snapToMonday}
            disabled={isLocked}
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
          maxLength={PLAN_DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(event) => edit({ description: event.target.value })}
          placeholder={t("plan.header.descriptionPlaceholder")}
          disabled={isLocked}
          rows={3}
        />

        {isLocked ? null : (
          <div className="flex items-center gap-cmv-sm">
            <CmvButton type="submit" onClick={onSubmit} disabled={!canSubmit}>
              {isSaving ? t("plan.header.submitting") : t("plan.header.submit")}
            </CmvButton>
            <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
          </div>
        )}
      </form>
    </CmvCard>
  );
}

/** Ce que l'en-tête dit de lui-même : diffusé, il ne se réécrit plus ; en Lecture, il se lit. */
function headerHintKey(isPublished: boolean, readOnly: boolean): string {
  if (isPublished) return "plan.header.lockedPublished";
  return readOnly ? "plan.header.lockedReadOnly" : "plan.header.hint";
}

/** Ce qui part : les champs changés, la version s'y ajoute à l'envoi. */
type HeaderChanges = Omit<UpdatePlanInput, "expectedUpdatedAt">;

/** La saisie de l'en-tête, et la version du cycle sur laquelle elle a commencé. */
type HeaderDraft = {
  title: string;
  description: string;
  startDate: string;
  athleteId: string | null;
  version: string;
};

const headerDraft = (plan: PlanDto): HeaderDraft => ({
  title: plan.title,
  description: plan.description ?? "",
  startDate: plan.startDate,
  athleteId: plan.athleteId,
  version: plan.updatedAt,
});

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
