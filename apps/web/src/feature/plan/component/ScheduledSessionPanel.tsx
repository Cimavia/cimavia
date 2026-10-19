import type { ExerciseDto, PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import {
  planWeekDays,
  required,
  ScheduledSessionStatus,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  sameJson,
} from "@cmv/shared";
import { type SyntheticEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import { CompositionEditor } from "@/feature/plan/component/CompositionEditor";
import { ExercisePicker } from "@/feature/plan/component/ExercisePicker";
import {
  ScheduledDosageLegend,
  scheduledDosageDetail,
} from "@/feature/plan/component/ScheduledDosage";
import { SessionPanelFooter } from "@/feature/plan/component/SessionPanelFooter";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import {
  type EditorItem,
  toExerciseInput,
  useSessionComposition,
} from "@/feature/plan/hook/useSessionComposition";
import {
  CmvLeaveDialog,
  CmvPanel,
  CmvSelect,
  CmvStaleBanner,
  CmvTextArea,
  CmvTextField,
  useToast,
} from "@/shared/component";
import type { LeaveDialogProps, SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useReportUnsaved } from "@/shared/hook/useReportUnsaved";
import { useSingleFlight } from "@/shared/hook/useSingleFlight";
import { isStaleWriteError } from "@/shared/lib/api";
import { formatDayLabel } from "@/shared/util/date.util";

/**
 * Création : depuis un MODÈLE, l'API copie titre, consignes, exercices et documents — on ne lui
 * envoie donc pas de titre. Sans modèle, la séance part vide et le titre devient obligatoire.
 */
function toCreateInput(sourceSessionId: string, title: string, scheduledDate: string) {
  const fromTemplate = sourceSessionId !== "";
  return {
    sourceSessionId: fromTemplate ? sourceSessionId : null,
    scheduledDate,
    ...(fromTemplate ? {} : { title: title.trim() }),
  };
}

/**
 * Édition : replace-all — ce qu'on envoie EST la nouvelle vérité de la séance (le détail de chaque
 * ligne est dans `toExerciseInput`).
 */
function toSaveInput(
  title: string,
  notes: string,
  scheduledDate: string,
  items: readonly EditorItem[],
) {
  return {
    title: title.trim(),
    // Champ vide → null (nullable, pas de fallback silencieux).
    notes: notes.trim() || null,
    scheduledDate,
    exercises: items.map(toExerciseInput),
  };
}

/**
 * Fermer le panneau — Annuler, la croix, Échap, le fond — demande avant de perdre une saisie
 * (#518, **G-1**) : il porte désormais une grille de dosage par exercice. Seules les fermetures
 * qui SUIVENT un enregistrement ou une suppression réussis passent : elles appellent `onClose`
 * sans passer par ici.
 *
 * « Enregistrer » (#682) passe par `saveAndClose`, qui ferme le panneau s'il a tout enregistré ;
 * sur un refus, la question se ferme et le panneau reste, avec la raison.
 */
function useCloseGuard(
  isDirty: boolean,
  onClose: () => void,
  saveAndClose: SaveBeforeLeaving,
): { requestClose: () => void; dialog: LeaveDialogProps } {
  const [asking, setAsking] = useState(false);
  const [isSaving, setSaving] = useState(false);
  async function onSave() {
    setSaving(true);
    try {
      if (!(await saveAndClose())) setAsking(false);
    } finally {
      setSaving(false);
    }
  }
  return {
    requestClose: () => (isDirty ? setAsking(true) : onClose()),
    dialog: {
      open: asking,
      isSaving,
      onSave,
      onDiscard: onClose,
      onCancel: () => setAsking(false),
    },
  };
}

/**
 * Les écritures du panneau. Enregistrer et retirer citent la version sur laquelle la saisie a
 * commencé (#604), figée à l'ouverture : la séance en cache peut être relue entre-temps (retour
 * d'onglet), la saisie, elle, ne l'a pas vue. « Recharger » remonte le panneau, et la fige à
 * nouveau.
 */
function useSessionWrites(planId: string, session: ScheduledSessionDto | null) {
  const { createSession, saveSession, removeSession, isBusy } = usePlanMutations(planId);
  const [opened] = useState(
    session == null ? null : { id: session.id, version: session.updatedAt },
  );
  // Enregistrer et supprimer ne sont offerts qu'en édition, donc sur une séance existante.
  const edited = () => required(opened, "écriture hors édition");

  return {
    createSession,
    isBusy,
    // Chaque écriture oublie le refus de l'autre : le bandeau ne dit que celui du dernier geste.
    // Rejette sur un échec, que le bandeau ou un toast dit déjà.
    save(input: ReturnType<typeof toSaveInput>) {
      const { id, version } = edited();
      removeSession.reset();
      return saveSession.mutateAsync({
        sessionId: id,
        input: { ...input, expectedUpdatedAt: version },
      });
    },
    remove(onSuccess: () => void) {
      const { id, version } = edited();
      saveSession.reset();
      removeSession.mutate({ sessionId: id, expectedUpdatedAt: version }, { onSuccess });
    },
    staleMessage: staleMessageOf(saveSession.error, removeSession.error),
  };
}

/**
 * Ce que dit le bandeau quand la séance a changé depuis l'ouverture, ou `null` sans conflit. Un
 * enregistrement refusé garde une saisie ; une suppression refusée n'en a pas, elle invite à voir
 * ce qui a changé avant de retirer.
 */
function staleMessageOf(saveError: unknown, removeError: unknown): string | null {
  if (isStaleWriteError(saveError)) return "library.session.stale";
  if (isStaleWriteError(removeError)) return "plan.session.staleDelete";
  return null;
}

/**
 * La taille et les textes du panneau : large en édition, où la bibliothèque s'ouvre à côté ; en
 * Lecture (#607), il dit que la séance se consulte plutôt qu'il invite à la modifier.
 */
function panelHeading(isEditing: boolean, readOnly: boolean) {
  return {
    size: isEditing ? ("lg" as const) : ("md" as const),
    title: isEditing ? "plan.session.editTitle" : "plan.session.createTitle",
    description: readOnly ? "plan.session.readOnlyDescription" : "plan.session.panelDescription",
  };
}

type ScheduledSessionPanelProps = {
  planId: string;
  // Cycle diffusé : retirer une séance prévient l'athlète, le panneau l'annonce avant confirmation.
  isPublished: boolean;
  /**
   * Le cycle d'un autre Coach, ouvert en Lecture (#607) : la séance s'ouvre pour se lire — jour,
   * consignes, dosage —, ne se saisit pas et ne se retire pas. Jamais en création : le jour n'offre
   * alors pas « Ajouter une séance ».
   */
  readOnly: boolean;
  week: PlanWeekDto;
  // Jour cliqué (création) ou jour de la séance (édition).
  date: string;
  // null = création d'une séance ; sinon édition de cette instance.
  session: ScheduledSessionDto | null;
  /**
   * Pour qui le dosage s'ajuste, tel qu'il s'écrit (`useAthleteLabel`), ou `null` sur un cycle
   * dont le destinataire n'est pas encore choisi : la légende dit alors « l'athlète ».
   */
  athleteName: string | null;
  onClose: () => void;
  /**
   * Le panneau porte une saisie non enregistrée, et voici de quoi l'enregistrer — `null` sinon :
   * l'écran du cycle retient alors la navigation, comme pour son en-tête et sa facturation (#327),
   * et l'enregistre avec eux (#682). Doit être stable.
   */
  onUnsavedChange: (save: SaveBeforeLeaving | null) => void;
  /**
   * Remplace la saisie par la dernière version de la séance, après un conflit (#604) : l'écran
   * relit la séance et remonte le panneau dessus.
   */
  onReload: () => void;
  isReloading: boolean;
};

/**
 * Création puis édition d'une séance planifiée.
 * - Création : on choisit un MODÈLE de la bibliothèque (l'API en copie titre, consignes,
 *   exercices et documents) ou on part d'une séance vide.
 * - Édition : replace-all — la séance renvoyée EST la nouvelle vérité. La bibliothèque, elle,
 *   ne bouge jamais : cette séance est une copie (CDC §5.4).
 */
export function ScheduledSessionPanel({
  planId,
  isPublished,
  readOnly,
  week,
  date,
  session,
  athleteName,
  onClose,
  onUnsavedChange,
  onReload,
  isReloading,
}: Readonly<ScheduledSessionPanelProps>) {
  const { t } = useTranslation();
  const toast = useToast();
  const { createSession, save, remove, isBusy, staleMessage } = useSessionWrites(planId, session);
  const { data: templates } = useSessions();
  const { data: exercises } = useExercises({});
  // Une valeur refusée reste dans sa cellule mais pas dans le brouillon : enregistrer enverrait
  // l'ancienne (#566).
  const refused = useRefusedFields();

  const isEditing = session != null;

  const [sourceSessionId, setSourceSessionId] = useState("");
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  // Le jour de la séance relue, et non celui du clic : un autre Coach a pu la déplacer.
  const [scheduledDate, setScheduledDate] = useState(session?.scheduledDate ?? date);
  const composition = useSessionComposition(session);

  /**
   * « Modifié » = ce qui partirait diffère de ce qui était là à l'ouverture, mis en forme comme à
   * l'envoi (règle de #327) : une espace ajoutée au titre, une valeur remise à l'identique ne
   * retiennent rien. Une saisie refusée retient aussi (#566) : la quitter la perdrait.
   */
  const form = { sourceSessionId, ...toSaveInput(title, notes, scheduledDate, composition.items) };
  const [opened] = useState(form);
  const isDirty = !sameJson(form, opened) || refused.hasRefused;
  const canSubmit = isEditing || sourceSessionId !== "" || title.trim() !== "";

  /**
   * Enregistre la séance, ou dit ce qui l'en empêche — le bouton fermé ne suffit pas : Entrée dans
   * un champ soumet aussi, et le dialogue de sortie enregistre sans lui (#682). Ferme le panneau
   * une fois enregistré : resté ouvert, il citerait encore la version d'avant, et un second envoi
   * se ferait refuser comme si un autre Coach l'avait changée. Vrai si la séance est partie. Un
   * second geste pendant l'envoi attend celui-là (`useSingleFlight`) : une création partirait deux fois.
   */
  const saveAndClose = useSingleFlight(async (): Promise<boolean> => {
    if (refused.hasRefused) {
      toast.error(t("library.builder.refusedBlocksSave"));
      return false;
    }
    if (!canSubmit) {
      toast.error(t("plan.session.titleRequired"));
      return false;
    }
    try {
      await (isEditing
        ? save(toSaveInput(title, notes, scheduledDate, composition.items))
        : createSession.mutateAsync({
            weekId: week.id,
            input: toCreateInput(sourceSessionId, title, scheduledDate),
          }));
    } catch {
      return false;
    }
    onClose();
    return true;
  });

  useReportUnsaved(isDirty, saveAndClose, onUnsavedChange);
  const close = useCloseGuard(isDirty, onClose, saveAndClose);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    void saveAndClose();
  }

  const dayOptions = required(planWeekDays(week.startDate), "lundi de semaine illisible").map(
    (day) => ({
      value: day,
      label: formatDayLabel(day),
    }),
  );

  const heading = panelHeading(isEditing, readOnly);

  return (
    <CmvPanel
      open
      size={heading.size}
      title={t(heading.title)}
      description={t(heading.description)}
      onClose={close.requestClose}
      footer={
        <SessionPanelFooter
          readOnly={readOnly}
          isEditing={isEditing}
          isDebriefed={session?.status === ScheduledSessionStatus.DONE}
          isPublished={isPublished}
          isBusy={isBusy}
          canSubmit={canSubmit}
          hasRefused={refused.hasRefused}
          onDelete={() => remove(onClose)}
          onClose={close.requestClose}
          onSubmit={onSubmit}
        />
      }
    >
      {staleMessage == null ? null : (
        <div className="mb-cmv-lg">
          <CmvStaleBanner message={t(staleMessage)} onReload={onReload} isReloading={isReloading} />
        </div>
      )}
      <RefusedFieldsContext value={refused.report}>
        <form onSubmit={onSubmit} className="flex flex-col gap-cmv-xl lg:flex-row">
          <section className="flex flex-1 flex-col gap-cmv-lg">
            <CmvSelect
              label={t("plan.session.day")}
              name="scheduledDate"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              options={dayOptions}
              disabled={readOnly}
            />

            {isEditing ? null : (
              <CmvSelect
                label={t("plan.session.template")}
                name="sourceSessionId"
                value={sourceSessionId}
                onChange={(event) => setSourceSessionId(event.target.value)}
                placeholder={t("plan.session.templateNone")}
                options={(templates ?? []).map((template) => ({
                  value: template.id,
                  label: template.title,
                }))}
              />
            )}

            {/* Sans modèle, la séance part vide : il lui faut au moins un titre. */}
            {isEditing || sourceSessionId === "" ? (
              <SessionTitleField title={title} onChange={setTitle} readOnly={readOnly} />
            ) : (
              <p className="text-cmv-caption text-cmv-text-lo">{t("plan.session.templateHint")}</p>
            )}

            {isEditing ? (
              <EditedSessionFields
                session={session}
                athleteName={athleteName}
                notes={notes}
                onNotesChange={setNotes}
                composition={composition}
                library={exercises}
                readOnly={readOnly}
              />
            ) : null}
          </section>

          {/* En édition seulement : la bibliothèque dans laquelle piocher des exercices. */}
          {isEditing && !readOnly ? (
            <ExercisePicker exercises={exercises ?? []} onPick={composition.addExercise} />
          ) : null}
        </form>
      </RefusedFieldsContext>
      <CmvLeaveDialog {...close.dialog} />
    </CmvPanel>
  );
}

type SessionTitleFieldProps = {
  title: string;
  onChange: (title: string) => void;
  /** En Lecture, le titre se lit : ni astérisque, ni légende qui l'expliquerait. */
  readOnly: boolean;
};

/**
 * Le titre, et sa légende. Elle suit le champ dans son apparition : choisir un modèle retire le
 * titre, et laisserait sinon une légende qui n'explique plus aucun astérisque.
 */
function SessionTitleField({ title, onChange, readOnly }: Readonly<SessionTitleFieldProps>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-cmv-xs">
      <CmvTextField
        label={t("plan.session.titleLabel")}
        name="sessionTitle"
        maxLength={SESSION_TITLE_MAX_LENGTH}
        value={title}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("plan.session.titlePlaceholder")}
        required
        requiredMark={!readOnly}
        disabled={readOnly}
      />
      {readOnly ? null : (
        <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
      )}
    </div>
  );
}

type EditedSessionFieldsProps = {
  session: ScheduledSessionDto;
  athleteName: string | null;
  notes: string;
  onNotesChange: (notes: string) => void;
  composition: ReturnType<typeof useSessionComposition>;
  /** Les exercices où le sélecteur pioche : ceux d'autres Coachs apportent leurs métriques. */
  library: readonly ExerciseDto[] | undefined;
  readOnly: boolean;
};

/**
 * Ce que seule l'édition montre : les consignes, et la composition dont chaque exercice se dose
 * pour l'athlète (#518).
 */
function EditedSessionFields({
  session,
  athleteName,
  notes,
  onNotesChange,
  composition,
  library,
  readOnly,
}: Readonly<EditedSessionFieldsProps>) {
  const { t } = useTranslation();
  const { data: customMetrics } = useCustomMetrics();
  // Une ligne ajoutée n'a pas encore de définitions figées — le serveur les résoudra chez le
  // propriétaire de sa source. D'ici là, elle se lit avec celles que son exercice apporte (#605) :
  // le catalogue du Coach ignore celles d'un autre.
  const libraryMetrics = useMemo(
    () =>
      mergeCatalogs(customMetrics, ...(library ?? []).map((exercise) => exercise.customMetrics)),
    [customMetrics, library],
  );
  const forWhom = athleteName ?? t("plan.session.dosage.theAthlete");

  return (
    <>
      <CmvTextArea
        label={t("plan.session.notesLabel")}
        name="sessionNotes"
        maxLength={SESSION_NOTES_MAX_LENGTH}
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder={t("plan.session.notesPlaceholder")}
        rows={3}
        disabled={readOnly}
      />

      <ScheduledDosageLegend
        adjustedCount={composition.adjustedCount}
        athleteName={forWhom}
        sourceSessionId={session.sourceSessionId}
      />

      <CompositionEditor
        items={composition.items}
        onMove={composition.moveItem}
        onMoveTo={composition.moveTo}
        onRemove={composition.removeItem}
        onNoteChange={composition.setNote}
        detail={scheduledDosageDetail(forWhom, libraryMetrics, composition.dosage)}
        readOnly={readOnly}
      />
    </>
  );
}
