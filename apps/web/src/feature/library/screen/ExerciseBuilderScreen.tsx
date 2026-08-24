import { EXERCISE_MAX_TAGS, type ExerciseDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { ExercisePreview } from "@/feature/library/component/ExercisePreview";
import { InstructionMediaProvider } from "@/feature/library/component/InstructionMediaContext";
import { StructureSection } from "@/feature/library/component/StructureSection";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useExerciseDraft } from "@/feature/library/hook/useExerciseDraft";
import { useExercise, useExerciseTags } from "@/feature/library/hook/useExercises";
import {
  CmvAppShell,
  CmvButton,
  CmvErrorState,
  CmvTagInput,
  CmvTextField,
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
  exerciseId?: string;
};

/**
 * Le constructeur d'exercice (#163) — pleine page et non panneau, parce qu'il porte à terme la
 * consigne structurée, les blocs de dosage et l'aperçu athlète : trois choses qu'un tiroir de
 * 480 px ne peut pas montrer côte à côte.
 *
 * L'aperçu est en LECTURE SEULE, et le restera : le coach n'y configure ni les timers ni le suivi
 * d'exécution, qui découlent des valeurs qu'il saisit. Rien ne doit y laisser croire le contraire.
 */
export function ExerciseBuilderScreen({ exerciseId }: Readonly<ExerciseBuilderScreenProps>) {
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
      onLeave={() => navigate({ to: "/library" })}
    />
  );
}

type ExerciseBuilderProps = {
  exercise: ExerciseDto | null;
  onLeave: () => void;
};

function ExerciseBuilder({ exercise, onLeave }: Readonly<ExerciseBuilderProps>) {
  const { t } = useTranslation();
  const { data: knownTags } = useExerciseTags();
  // Les colonnes maison résolvent leur type de valeur et leur échelle ici : sans elles, une
  // cotation du coach se saisirait comme du texte libre.
  const { data: customMetrics } = useCustomMetrics();
  const draft = useExerciseDraft(exercise);

  const isEditing = exercise != null;

  async function onSubmit() {
    await draft.submit();
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
          isEditing={isEditing}
          isSaving={draft.isSaving}
          canSubmit={draft.trimmedTitle !== ""}
          onCancel={onLeave}
          onSubmit={onSubmit}
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
              placeholder={t("library.builder.titlePlaceholder")}
              required
              requiredMark
            />

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
              resolveImage={draft.media.resolve}
            />
          </aside>
        </div>
      </InstructionMediaProvider>
    </CmvAppShell>
  );
}

type BuilderActionsProps = {
  isEditing: boolean;
  isSaving: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

function BuilderActions({
  isEditing,
  isSaving,
  canSubmit,
  onCancel,
  onSubmit,
}: Readonly<BuilderActionsProps>) {
  const { t } = useTranslation();
  const submitKey = isEditing ? "library.builder.submitEdit" : "library.builder.submitCreate";

  return (
    <>
      <CmvButton variant="ghost" onClick={onCancel} disabled={isSaving}>
        {t("library.builder.cancel")}
      </CmvButton>
      <CmvButton onClick={onSubmit} disabled={isSaving || !canSubmit}>
        {isSaving ? t("library.builder.saving") : t(submitKey)}
      </CmvButton>
    </>
  );
}
