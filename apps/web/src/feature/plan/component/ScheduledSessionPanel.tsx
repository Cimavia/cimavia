import type {
  ExerciseDto,
  PlanWeekDto,
  ScheduledCompositionInput,
  ScheduledSessionCopyDto,
  ScheduledSessionDto,
} from "@cmv/shared";
import {
  planCycleDays,
  planWeekNumber,
  required,
  ScheduledSessionStatus,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  sameJson,
} from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { ScheduledComposition } from "@/feature/plan/component/ScheduledComposition";
import { SessionPanelFooter } from "@/feature/plan/component/SessionPanelFooter";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import {
  CmvLeaveDialog,
  CmvPanel,
  CmvSelect,
  CmvStaleBanner,
  CmvTextArea,
  CmvTextField,
} from "@/shared/component";
import { useCheckedSave } from "@/shared/hook/useCheckedSave";
import type { LeaveDialogProps, SaveBeforeLeaving } from "@/shared/hook/useLeaveGuard";
import { useReportUnsaved } from "@/shared/hook/useReportUnsaved";
import { isStaleWriteError } from "@/shared/lib/api";
import { formatDayLabel } from "@/shared/util/date.util";

/**
 * Ce que porte « Enregistrer » : titre, consignes et jour. La composition ne s'y envoie pas (#720),
 * elle s'écrit geste par geste.
 */
function toSaveInput(title: string, notes: string, scheduledDate: string) {
  return {
    title: title.trim(),
    // Champ vide → null (nullable, pas de fallback silencieux).
    notes: notes.trim() || null,
    scheduledDate,
  };
}

/**
 * Fermer le panneau — Annuler, la croix, Échap, le fond — demande avant de perdre une saisie
 * (#518, **G-1**). Seules les fermetures
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
 *
 * Seuls les gestes de composition (#720) la font avancer : ils s'écrivent tout de suite, et le
 * panneau qui les a faits sait ce qu'ils ont changé — sans quoi « Enregistrer » se ferait refuser
 * sur sa propre composition.
 */
function useSessionWrites(planId: string, session: ScheduledSessionDto | null) {
  const { createSession, saveSession, removeSession, composeSession, resetComposition, isBusy } =
    usePlanMutations(planId);
  const [opened, setOpened] = useState(
    session == null ? null : { id: session.id, version: session.updatedAt },
  );
  // Enregistrer et supprimer ne sont offerts qu'en édition, donc sur une séance existante.
  const edited = () => required(opened, "écriture hors édition");
  const writes = [saveSession, removeSession, composeSession, resetComposition];
  // Chaque écriture oublie le refus des autres : le bandeau ne dit que celui du dernier geste.
  const forgetOthers = (kept: (typeof writes)[number]) => {
    for (const write of writes) if (write !== kept) write.reset();
  };
  /**
   * Avance la version figée sur celle que le geste a écrite — seulement si le geste est parti de
   * cette version-là. Écrit sur une version plus récente que la saisie (un autre Coach est passé
   * entre-temps), il ne doit pas absorber cette écriture : « Enregistrer » se fera refuser, et
   * c'est juste.
   */
  function advance(copies: readonly ScheduledSessionCopyDto[], cited: string | undefined) {
    const { id } = edited();
    const anchor = copies.find((copy) => copy.id === id);
    if (anchor == null || cited === undefined) return;
    setOpened((current) =>
      current?.id === id && current.version === cited ? { id, version: anchor.updatedAt } : current,
    );
  }

  return {
    createSession,
    isBusy,
    // Rejette sur un échec, que le bandeau ou un toast dit déjà.
    save(input: ReturnType<typeof toSaveInput>) {
      const { id, version } = edited();
      forgetOthers(saveSession);
      return saveSession.mutateAsync({
        sessionId: id,
        input: { ...input, expectedUpdatedAt: version },
      });
    },
    remove(onSuccess: () => void) {
      const { id, version } = edited();
      forgetOthers(removeSession);
      removeSession.mutate({ sessionId: id, expectedUpdatedAt: version }, { onSuccess });
    },
    // Les gestes citent la version de chaque copie telle que la fenêtre l'a lue, pas celle figée.
    // Ils ne rejettent pas : rien n'a été écrit, et le bandeau ou un toast dit déjà pourquoi.
    async compose(input: ScheduledCompositionInput) {
      forgetOthers(composeSession);
      const copies = await composeSession
        .mutateAsync({ sessionId: edited().id, input })
        .catch(() => null);
      const here = [...input.apply, ...input.revert].find((copy) => copy.id === edited().id);
      if (copies != null) advance(copies, here?.expectedUpdatedAt);
    },
    async reset(expectedUpdatedAt: string) {
      forgetOthers(resetComposition);
      const copies = await resetComposition
        .mutateAsync({ sessionId: edited().id, expectedUpdatedAt })
        .catch(() => null);
      if (copies != null) advance(copies, expectedUpdatedAt);
    },
    staleMessage: staleMessageOf(
      saveSession.error,
      removeSession.error,
      composeSession.error ?? resetComposition.error,
    ),
  };
}

/**
 * Ce que dit le bandeau quand la séance a changé depuis l'ouverture, ou `null` sans conflit. Un
 * enregistrement refusé garde une saisie ; une suppression refusée n'en a pas, elle invite à voir
 * ce qui a changé avant de retirer ; un geste de composition refusé n'a rien écrit, il invite à
 * recomposer sur la dernière version.
 */
function staleMessageOf(
  saveError: unknown,
  removeError: unknown,
  composeError: unknown,
): string | null {
  if (isStaleWriteError(saveError)) return "library.session.stale";
  if (isStaleWriteError(removeError)) return "plan.session.staleDelete";
  if (isStaleWriteError(composeError)) return "plan.composition.stale";
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
  // Le lundi de départ du cycle, et ses semaines telles que l'écran les montre : le sélecteur
  // « Jour » couvre tout le cycle (#689), et une séance créée part dans la semaine de son jour.
  planStartDate: string;
  weeks: readonly PlanWeekDto[];
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
 * - Création : on choisit un MODÈLE de la bibliothèque, dont l'API copie titre, consignes,
 *   exercices et documents. Le panneau ne crée plus de séance vide (#720).
 * - Édition : titre, consignes et jour partent avec « Enregistrer ». La séance se compose geste
 *   par geste (`ScheduledComposition`), et ses valeurs se règlent dans Dosage (#721). La
 *   bibliothèque, elle, ne bouge jamais : cette séance est une copie (CDC §5.4).
 */
export function ScheduledSessionPanel({
  planId,
  isPublished,
  readOnly,
  planStartDate,
  weeks,
  date,
  session,
  athleteName,
  onClose,
  onUnsavedChange,
  onReload,
  isReloading,
}: Readonly<ScheduledSessionPanelProps>) {
  const { t } = useTranslation();
  const writes = useSessionWrites(planId, session);
  const { createSession, save, remove, isBusy, staleMessage } = writes;
  const { data: templates } = useSessions();
  const { data: exercises } = useExercises({});

  const isEditing = session != null;

  const [sourceSessionId, setSourceSessionId] = useState("");
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  // Le jour de la séance relue, et non celui du clic : un autre Coach a pu la déplacer.
  const [scheduledDate, setScheduledDate] = useState(session?.scheduledDate ?? date);

  /**
   * « Modifié » = ce qui partirait diffère de ce qui était là à l'ouverture, mis en forme comme à
   * l'envoi (règle de #327) : une espace ajoutée au titre ne retient rien.
   */
  const form = { sourceSessionId, ...toSaveInput(title, notes, scheduledDate) };
  const [opened] = useState(form);
  const isDirty = !sameJson(form, opened);
  const canSubmit = isEditing || sourceSessionId !== "";

  /**
   * Enregistre la séance, ou dit ce qui l'en empêche — le bouton fermé ne suffit pas : Entrée dans
   * un champ soumet aussi, et le dialogue de sortie enregistre sans lui (#682). Ferme le panneau
   * une fois enregistré : resté ouvert, il citerait encore la version d'avant, et un second envoi
   * se ferait refuser comme si un autre Coach l'avait changée. Vrai si la séance est partie.
   */
  // La semaine qui porte le jour choisi — une séance créée y part (#689). `null` quand le jour
  // n'est plus dans le cycle : un autre Coach l'a raccourci ou décalé depuis l'ouverture.
  const weekNumber = planWeekNumber(
    { startDate: planStartDate, weekCount: weeks.length },
    scheduledDate,
  );
  const arrival = weeks.find((week) => week.weekNumber === weekNumber) ?? null;

  const sendAndClose = useCheckedSave(
    () => {
      if (!canSubmit) return "plan.session.templateRequired";
      // À l'édition, l'API juge elle-même la date et répond 400 ; à la création, sans semaine, la
      // requête ne saurait même pas où partir.
      return isEditing || arrival != null ? null : "plan.session.dayOutsideCycle";
    },
    async () => {
      await (isEditing
        ? save(toSaveInput(title, notes, scheduledDate))
        : createSession.mutateAsync({
            weekId: required(arrival, "semaine du jour choisi").id,
            input: { sourceSessionId, scheduledDate },
          }));
      onClose();
      return true;
    },
  );
  const saveAndClose = async () => (await sendAndClose()) != null;

  useReportUnsaved(isDirty, saveAndClose, onUnsavedChange);
  const close = useCloseGuard(isDirty, onClose, saveAndClose);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    void saveAndClose();
  }

  // Tout le cycle, regroupé par semaine (#689) : c'est le chemin clavier du glisser d'une semaine
  // à l'autre. Le lundi d'un cycle servi par l'API est une date valide (#512).
  const dayGroups = required(
    planCycleDays(planStartDate, weeks.length),
    "début de cycle illisible",
  ).map(({ weekNumber, days }) => ({
    label: t("plan.week.number", { number: weekNumber }),
    options: days.map((day) => ({ value: day, label: formatDayLabel(day) })),
  }));

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
      <form onSubmit={onSubmit}>
        <section className="flex flex-col gap-cmv-lg">
          <CmvSelect
            label={t("plan.session.day")}
            name="scheduledDate"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
            groups={dayGroups}
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

          {isEditing ? (
            <>
              <SessionTitleField title={title} onChange={setTitle} readOnly={readOnly} />
              <EditedSessionFields
                session={session}
                weeks={weeks}
                athleteName={athleteName}
                isPublished={isPublished}
                notes={notes}
                onNotesChange={setNotes}
                library={exercises}
                readOnly={readOnly}
                isBusy={isBusy}
                onCompose={writes.compose}
                onReset={writes.reset}
              />
            </>
          ) : (
            <p className="text-cmv-caption text-cmv-text-lo">{t("plan.session.templateHint")}</p>
          )}
        </section>
      </form>
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

/** Le titre, et la légende de son astérisque. */
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
  weeks: readonly PlanWeekDto[];
  athleteName: string | null;
  isPublished: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  /** Les exercices où le sélecteur pioche : ceux d'autres Coachs apportent leurs métriques. */
  library: readonly ExerciseDto[] | undefined;
  readOnly: boolean;
  isBusy: boolean;
  onCompose: (input: ScheduledCompositionInput) => Promise<void>;
  onReset: (expectedUpdatedAt: string) => Promise<void>;
};

/** Ce que seule l'édition montre : les consignes, puis la composition par blocs (#720). */
function EditedSessionFields(props: Readonly<EditedSessionFieldsProps>) {
  const { session, athleteName, notes, onNotesChange, library, readOnly } = props;
  const { t } = useTranslation();
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
      <ScheduledComposition
        session={session}
        weeks={props.weeks}
        athleteName={athleteName ?? t("plan.session.dosage.theAthlete")}
        isPublished={props.isPublished}
        readOnly={readOnly}
        exercises={library ?? []}
        isBusy={props.isBusy}
        onCompose={props.onCompose}
        onReset={props.onReset}
      />
    </>
  );
}
