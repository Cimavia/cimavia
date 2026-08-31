import { EXERCISE_MAX_TAGS, type ExerciseDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentsSection } from "@/feature/library/component/AttachmentsSection";
import { ExercisePreview } from "@/feature/library/component/ExercisePreview";
import { InstructionMediaProvider } from "@/feature/library/component/InstructionMediaContext";
import { StructureSection } from "@/feature/library/component/StructureSection";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useExerciseDraft } from "@/feature/library/hook/useExerciseDraft";
import {
  useDeleteExercise,
  useExercise,
  useExerciseTags,
} from "@/feature/library/hook/useExercises";
import {
  CmvAppShell,
  CmvButton,
  CmvConfirmButton,
  CmvErrorState,
  CmvTagInput,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Chargé à la demande : TipTap et ProseMirror pèsent ~120 kB gzip, pour un éditeur que seul le
 * coach ouvre, et seulement sur cette route. Les laisser dans le bundle initial les ferait payer
 * à l'athlète, qui n'y touchera jamais.
 */
const InstructionsEditor = lazy(() =>
  import("@/feature/library/component/InstructionsEditor").then((module) => ({
    default: module.InstructionsEditor,
  })),
);

type ExerciseBuilderScreenProps = {
  /** Absent = création. Sinon l'exercice est chargé depuis l'URL. */
  exerciseId?: string | undefined;
  /** Titre pré-rempli, repris de la recherche restée sans résultat. */
  initialTitle: string | undefined;
};

/**
 * Le constructeur d'exercice (#163) — pleine page et non panneau, parce qu'il porte à terme la
 * consigne structurée, les blocs de dosage et l'aperçu athlète : trois choses qu'un tiroir de
 * 480 px ne peut pas montrer côte à côte.
 *
 * L'aperçu est en LECTURE SEULE, et le restera : le coach n'y configure ni les timers ni le suivi
 * d'exécution, qui découlent des valeurs qu'il saisit. Rien ne doit y laisser croire le contraire.
 */
export function ExerciseBuilderScreen({
  exerciseId,
  initialTitle,
}: Readonly<ExerciseBuilderScreenProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: exercise, isPending, isError, refetch } = useExercise(exerciseId);

  if (exerciseId != null && isPending) {
    return (
      <CmvAppShell title={t("library.builder.loadingTitle")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  if (exerciseId != null && isError) {
    return (
      <CmvAppShell title={t("library.builder.loadingTitle")}>
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      </CmvAppShell>
    );
  }

  // `key` remonte l'identité de l'exercice au montage : l'état local du formulaire naît de lui, et
  // React doit repartir de zéro si l'URL change d'exercice sans démonter l'écran.
  return (
    <ExerciseBuilder
      key={exercise?.id ?? "new"}
      exercise={exercise ?? null}
      initialTitle={initialTitle}
      onLeave={() => navigate({ to: "/library" })}
    />
  );
}

type ExerciseBuilderProps = {
  exercise: ExerciseDto | null;
  initialTitle: string | undefined;
  onLeave: () => void;
};

function ExerciseBuilder({ exercise, initialTitle, onLeave }: Readonly<ExerciseBuilderProps>) {
  const { t } = useTranslation();
  const { data: knownTags } = useExerciseTags();
  // Les colonnes maison résolvent leur type de valeur et leur échelle ici : sans elles, une
  // cotation du coach se saisirait comme du texte libre.
  const { data: customMetrics } = useCustomMetrics();
  const toast = useToast();
  const draft = useExerciseDraft(exercise, initialTitle);

  const isEditing = exercise != null;
  // Le message n'apparaît qu'APRÈS que le champ a été touché : l'afficher au premier rendu
  // accueillerait le coach par une erreur qu'il n'a pas encore eu l'occasion de commettre.
  const [titleTouched, setTitleTouched] = useState(false);
  const titleMissing = titleTouched && draft.trimmedTitle === "";

  /**
   * `mutateAsync` REJETTE en cas d'échec : sans ce `try`, le rejet remonte non capturé, on reste
   * sur la page sans savoir pourquoi, et rien ne dit au coach que son enregistrement a échoué.
   * Le message d'erreur, lui, s'affiche déjà sous le formulaire.
   */
  async function onSubmit() {
    try {
      await draft.submit();
    } catch {
      toast.error(t("library.builder.saveFailed"));
      return;
    }
    toast.success(t("library.builder.saved"));
    onLeave();
  }

  /**
   * Le décompte ne s'affiche QUE s'il y a quelque chose à annoncer. « Utilisé dans 0 séance » est
   * un non-événement, et le français n'a pas de forme plurielle « zéro » — i18next rendrait le
   * singulier, qui se lit mal.
   */
  const subtitle =
    isEditing && exercise.usedInSessionCount > 0
      ? t("library.builder.usedInSessions", { count: exercise.usedInSessionCount })
      : t("library.builder.subtitle");

  return (
    <CmvAppShell
      title={isEditing ? t("library.builder.editTitle") : t("library.builder.createTitle")}
      subtitle={subtitle}
      actions={
        <BuilderActions
          exercise={exercise}
          isSaving={draft.isSaving}
          canSubmit={draft.trimmedTitle !== ""}
          onCancel={onLeave}
          onSubmit={onSubmit}
          onDeleted={onLeave}
        />
      }
    >
      {/* Deux colonnes dès `xl` seulement : en dessous, l'aperçu passe SOUS le formulaire plutôt
          que de le comprimer — une grille de dosage étroite devient illisible. */}
      {/* Éditeur ET aperçu sous le même magasin : ils résolvent les mêmes `mediaId`, et l'aperçu
          doit montrer l'image dès qu'elle est posée — pas seulement après enregistrement. */}
      <InstructionMediaProvider media={draft.media}>
        <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-cmv-xl">
            <CmvTextField
              label={t("library.builder.titleLabel")}
              name="title"
              value={draft.title}
              onChange={(event) => draft.setTitle(event.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder={t("library.builder.titlePlaceholder")}
              required
              requiredMark
            />
            {titleMissing ? (
              <p className="text-cmv-caption text-cmv-error">
                {t("library.builder.titleRequired")}
              </p>
            ) : null}

            <CmvTagInput
              label={t("library.tags.label")}
              value={draft.tags}
              onChange={draft.setTags}
              suggestions={knownTags ?? []}
              placeholder={t("library.tags.placeholder")}
              removeLabel={t("library.tags.remove")}
              max={EXERCISE_MAX_TAGS}
            />

            <Suspense fallback={<p className="text-cmv-text-mid">{t("common.loading")}</p>}>
              <InstructionsEditor
                initialValue={exercise?.instructions ?? null}
                onChange={draft.setInstructions}
              />
            </Suspense>

            <StructureSection
              blocks={draft.blocks}
              customMetrics={customMetrics ?? []}
              onChange={draft.setBlocks}
            />

            <AttachmentsSection
              exercise={exercise}
              pendingFiles={draft.pendingFiles}
              pendingLinks={draft.pendingLinks}
              progress={draft.progress}
              isSaving={draft.isSaving}
              onPendingFiles={draft.setPendingFiles}
              onPendingLinks={draft.setPendingLinks}
            />

            {draft.error == null ? null : (
              <p className="text-cmv-caption text-cmv-error">{apiErrorMessage(draft.error)}</p>
            )}
          </div>

          {/* `sticky` : l'aperçu suit le défilement du formulaire, qui sera bien plus long que lui. */}
          <aside className="xl:sticky xl:top-cmv-xl xl:self-start">
            <ExercisePreview
              title={draft.trimmedTitle}
              tags={draft.tags}
              instructions={draft.instructions}
              blocks={draft.blocks}
              customMetrics={customMetrics ?? []}
              documents={exercise?.documents ?? []}
              resolveImage={draft.media.resolve}
            />
          </aside>
        </div>
      </InstructionMediaProvider>
    </CmvAppShell>
  );
}

type BuilderActionsProps = {
  exercise: ExerciseDto | null;
  isSaving: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  onDeleted: () => void;
};

function BuilderActions({
  exercise,
  isSaving,
  canSubmit,
  onCancel,
  onSubmit,
  onDeleted,
}: Readonly<BuilderActionsProps>) {
  const { t } = useTranslation();
  const removeExercise = useDeleteExercise();

  const isEditing = exercise != null;
  const submitKey = isEditing ? "library.builder.submitEdit" : "library.builder.submitCreate";
  const isBusy = isSaving || removeExercise.isPending;

  return (
    <>
      {isEditing ? (
        <CmvConfirmButton
          label={t("library.builder.deleteExercise")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy}
          // `mutate` et non `mutateAsync` : le 409 « exercice utilisé dans N séances » atterrit
          // dans `removeExercise.error`, pas en rejet non capturé.
          onConfirm={() => removeExercise.mutate(exercise.id, { onSuccess: onDeleted })}
        />
      ) : null}
      <CmvButton variant="ghost" onClick={onCancel} disabled={isBusy}>
        {t("library.builder.cancel")}
      </CmvButton>
      <CmvButton onClick={onSubmit} disabled={isBusy || !canSubmit}>
        {isSaving ? t("library.builder.saving") : t(submitKey)}
      </CmvButton>
      {removeExercise.error == null ? null : (
        <span className="text-cmv-caption text-cmv-error">
          {apiErrorMessage(removeExercise.error)}
        </span>
      )}
    </>
  );
}
