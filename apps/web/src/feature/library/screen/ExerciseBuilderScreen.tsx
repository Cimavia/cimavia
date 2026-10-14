import {
  canWrite,
  EXERCISE_MAX_TAGS,
  EXERCISE_TAG_MAX_LENGTH,
  EXERCISE_TITLE_MAX_LENGTH,
  type ExerciseDto,
  isOwner,
} from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentsSection } from "@/feature/library/component/AttachmentsSection";
import { ExercisePreview } from "@/feature/library/component/ExercisePreview";
import { InstructionMediaProvider } from "@/feature/library/component/InstructionMediaContext";
import { StructureSection } from "@/feature/library/component/StructureSection";
import { useExerciseCatalog } from "@/feature/library/hook/useCustomMetrics";
import { useExerciseDraft } from "@/feature/library/hook/useExerciseDraft";
import {
  exerciseDetailQuery,
  useDeleteExercise,
  useExercise,
  useExerciseTags,
} from "@/feature/library/hook/useExercises";
import { myRightText } from "@/feature/library/util/access-text.util";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import {
  CmvAppShell,
  CmvButton,
  CmvConfirmButton,
  CmvErrorState,
  CmvFormError,
  CmvLeaveDialog,
  CmvReadOnlyBanner,
  CmvStaleBanner,
  CmvTagInput,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useStaleReload } from "@/shared/hook/useStaleReload";
import { isStaleWriteError } from "@/shared/lib/api";

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
  /**
   * La séance d'où le coach est parti créer l'exercice manquant (#303). Absente, l'écran revient
   * à la bibliothèque ; présente, il ramène à la séance, et y fait ajouter l'exercice enregistré.
   */
  fromSessionId?: string | undefined;
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
  fromSessionId,
}: Readonly<ExerciseBuilderScreenProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { loadedId, generation, reload, isReloading } = useStaleReload(
    exerciseId,
    exerciseDetailQuery,
  );
  const { data: exercise, isPending, isError, refetch } = useExercise(loadedId);

  if (loadedId != null && isPending) {
    return (
      <CmvAppShell title={t("library.builder.loadingTitle")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  // Sur la DONNÉE, pas sur l'état de la requête : une relecture ratée (« Recharger », retour
  // d'onglet) passe la requête en erreur en gardant l'exercice en cache. Remplacer le constructeur
  // par l'erreur perdrait la saisie que le bandeau promet de garder.
  if (loadedId != null && isError && exercise === undefined) {
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

  // `replace` vers la séance : le détour par la création ne reste pas dans l'historique, où un
  // retour arrière rouvrirait le formulaire d'un exercice déjà créé.
  function leave(saved: ExerciseDto | null) {
    if (fromSessionId == null) {
      navigate({ to: "/library" });
      return;
    }
    navigate({
      to: "/library/sessions/$sessionId",
      params: { sessionId: fromSessionId },
      search: saved == null ? {} : { add: saved.id },
      replace: true,
    });
  }

  // `key` remonte l'identité de l'exercice au montage : l'état local du formulaire naît de lui, et
  // React doit repartir de zéro si l'URL change d'exercice sans démonter l'écran — ou si
  // « Recharger » remplace la saisie.
  return (
    <ExerciseBuilder
      key={`${exercise?.id ?? "new"}:${generation}`}
      exercise={exercise ?? null}
      initialTitle={initialTitle}
      onLeave={() => leave(null)}
      onSaved={leave}
      onReload={reload}
      isReloading={isReloading}
    />
  );
}

type ExerciseBuilderProps = {
  exercise: ExerciseDto | null;
  initialTitle: string | undefined;
  /** Sortie sans enregistrement : Annuler, ou l'exercice supprimé. */
  onLeave: () => void;
  onSaved: (saved: ExerciseDto) => void;
  /** Remplace la saisie par la dernière version de cet exercice, après un conflit (#604). */
  onReload: (id: string) => void;
  isReloading: boolean;
};

function ExerciseBuilder({
  exercise,
  initialTitle,
  onLeave,
  onSaved,
  onReload,
  isReloading,
}: Readonly<ExerciseBuilderProps>) {
  const { t } = useTranslation();
  const { data: knownTags } = useExerciseTags();
  const toast = useToast();
  const { onFailure } = useMutationToast();
  const draft = useExerciseDraft(exercise, initialTitle);
  // Une durée ou un nombre refusé reste à l'écran, mais pas dans le brouillon : enregistrer
  // enverrait l'ancienne valeur, et partir perdrait la saisie sans un mot (#566).
  const refused = useRefusedFields();
  // Annuler, la barre latérale, un retour arrière ou un F5 : tous demandent avant de perdre la
  // saisie (#327). Seules les sorties qui SUIVENT un enregistrement ou une suppression passent.
  const guard = useLeaveGuard(draft.isDirty || refused.hasRefused);
  // Le brouillon et non la prop : un enregistrement interrompu a pu créer l'exercice, et l'écran
  // doit alors se présenter en édition — c'en est une.
  const edited = draft.exercise;
  // Les colonnes maison résolvent leur type de valeur et leur échelle ici : sans elles, une
  // cotation se saisirait comme du texte libre. Celles du PROPRIÉTAIRE de l'exercice (#605).
  // Les métriques que l'exercice cite arrivent avec lui : elles résolvent ses colonnes avant que
  // le catalogue réponde — et à sa place, s'il ne répond pas ou n'est pas demandé (Lecture).
  const catalog = mergeCatalogs(useExerciseCatalog(edited).data, edited?.customMetrics);

  // L'exercice d'un autre Coach (#606) : en Écriture il se modifie, sans suppression ; en Lecture
  // il se consulte.
  const foreign = foreignExercise(edited);
  const readOnly = foreign != null && !canWrite(foreign.myAccess);
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
    let saved: ExerciseDto;
    try {
      saved = await draft.submit();
    } catch (error) {
      // Un conflit d'édition se dit par le bandeau, à côté de la saisie : un toast disparaîtrait
      // en emportant la seule explication.
      if (!isStaleWriteError(error)) onFailure("library.builder.saveFailed", error);
      return;
    }
    toast.success(t("library.builder.saved"));
    guard.release();
    onSaved(saved);
  }

  function onDeleted() {
    guard.release();
    onLeave();
  }

  const heading = builderHeading(edited, t);

  return (
    <CmvAppShell
      title={heading.title}
      subtitle={heading.subtitle}
      actions={
        <BuilderActions
          exercise={edited}
          readOnly={readOnly}
          canDelete={foreign == null}
          isSaving={draft.isSaving}
          canSubmit={draft.trimmedTitle !== ""}
          blockedBy={refused.hasRefused ? t("library.builder.refusedBlocksSave") : undefined}
          onCancel={onLeave}
          onSubmit={onSubmit}
          onDeleted={onDeleted}
        />
      }
    >
      {readOnly ? (
        <div className="mb-cmv-xl">
          <CmvReadOnlyBanner
            message={t("library.builder.readOnly", { owner: foreign.owner.name })}
          />
        </div>
      ) : null}
      {/* Deux colonnes dès `xl` seulement : en dessous, l'aperçu passe SOUS le formulaire plutôt
          que de le comprimer — une grille de dosage étroite devient illisible. */}
      {/* Éditeur ET aperçu sous le même magasin : ils résolvent les mêmes `mediaId`, et l'aperçu
          doit montrer l'image dès qu'elle est posée — pas seulement après enregistrement. */}
      {draft.isStale && edited != null ? (
        <div className="mb-cmv-xl">
          <CmvStaleBanner
            message={t("library.builder.stale")}
            onReload={() => onReload(edited.id)}
            isReloading={isReloading}
          />
        </div>
      ) : null}
      <RefusedFieldsContext value={refused.report}>
        <InstructionMediaProvider media={draft.media}>
          <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* `disabled` sur le fieldset fige d'un geste chaque champ et chaque bouton du
                formulaire ; les liens des pièces jointes restent ouverts. */}
            <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-cmv-xl">
              {/* Champ, message et légende serrés ensemble : l'espacement du formulaire
                (`gap-cmv-xl`) éloignerait la légende de l'astérisque qu'elle explique. */}
              <div className="flex flex-col gap-cmv-xs">
                <CmvTextField
                  label={t("library.builder.titleLabel")}
                  name="title"
                  maxLength={EXERCISE_TITLE_MAX_LENGTH}
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
                <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
              </div>

              <CmvTagInput
                label={t("library.tags.label")}
                maxLength={EXERCISE_TAG_MAX_LENGTH}
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
                  readOnly={readOnly}
                />
              </Suspense>

              <StructureSection
                blocks={draft.blocks}
                customMetrics={catalog}
                catalogOwner={foreign?.owner.name ?? null}
                onChange={draft.setBlocks}
              />

              <AttachmentsSection
                exercise={edited}
                pendingFiles={draft.pendingFiles}
                pendingLinks={draft.pendingLinks}
                progress={draft.progress}
                isSaving={draft.isSaving}
                onPendingFiles={draft.setPendingFiles}
                onPendingLinks={draft.setPendingLinks}
              />

              <CmvFormError error={draft.isStale ? null : draft.error} />
            </fieldset>

            {/* `sticky` : l'aperçu suit le défilement du formulaire, qui sera bien plus long que lui. */}
            <aside className="xl:sticky xl:top-cmv-xl xl:self-start">
              <ExercisePreview
                title={draft.trimmedTitle}
                tags={draft.tags}
                instructions={draft.instructions}
                blocks={draft.blocks}
                customMetrics={catalog}
                documents={edited?.documents ?? []}
                resolveImage={draft.media.resolve}
              />
            </aside>
          </div>
        </InstructionMediaProvider>
      </RefusedFieldsContext>
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}

/** L'exercice s'il est à un autre Coach ; `null` pour le sien, ou pour celui qui naît. */
function foreignExercise(exercise: ExerciseDto | null) {
  return exercise != null && !isOwner(exercise.myAccess) ? exercise : null;
}

/** Le titre et le sous-titre du constructeur : selon l'exercice, et le droit qu'en a l'acteur. */
function builderHeading(exercise: ExerciseDto | null, t: TFunction) {
  if (exercise == null) {
    return { title: t("library.builder.createTitle"), subtitle: t("library.builder.subtitle") };
  }
  // Le décompte ne s'affiche QUE s'il y a quelque chose à annoncer. « Utilisé dans 0 séance » est
  // un non-événement, et le français n'a pas de forme plurielle « zéro » — i18next rendrait le
  // singulier, qui se lit mal.
  const used =
    exercise.usedInSessionCount > 0
      ? t("library.builder.usedInSessions", { count: exercise.usedInSessionCount })
      : null;
  const foreign = foreignExercise(exercise);
  if (foreign == null) {
    return {
      title: t("library.builder.editTitle"),
      subtitle: used ?? t("library.builder.subtitle"),
    };
  }
  const ofOwner = { owner: foreign.owner.name, right: myRightText(foreign.myAccess, t) };
  return {
    // En lecture, l'exercice se nomme : « Modifier l'exercice » annoncerait ce qu'on ne peut pas.
    title: canWrite(foreign.myAccess) ? t("library.builder.editTitle") : foreign.title,
    // Qui écrit sur l'exercice d'un autre doit voir, comme lui, combien de séances il touche.
    subtitle:
      used == null
        ? t("library.builder.ofOwner", ofOwner)
        : t("library.builder.ofOwnerUsed", { ...ofOwner, used }),
  };
}

type BuilderActionsProps = {
  exercise: ExerciseDto | null;
  /** Lecture (#606) : « Fermer », à la place d'Enregistrer et Supprimer (frame 12). */
  readOnly: boolean;
  /** Supprimer reste au propriétaire, même à qui a l'Écriture (#605). */
  canDelete: boolean;
  isSaving: boolean;
  canSubmit: boolean;
  /**
   * Pourquoi l'enregistrement est fermé alors que le titre est là — une saisie refusée (#566).
   * Ferme le bouton ET en devient l'infobulle : une seule valeur pour les deux, sans quoi le bouton
   * pourrait annoncer un refus qu'il ne fait pas (#514).
   */
  blockedBy: string | undefined;
  onCancel: () => void;
  onSubmit: () => void;
  onDeleted: () => void;
};

function BuilderActions({
  exercise,
  readOnly,
  canDelete,
  isSaving,
  canSubmit,
  blockedBy,
  onCancel,
  onSubmit,
  onDeleted,
}: Readonly<BuilderActionsProps>) {
  const { t } = useTranslation();
  const removeExercise = useDeleteExercise();

  const isEditing = exercise != null;
  const submitKey = isEditing ? "library.builder.submitEdit" : "library.builder.submitCreate";
  const isBusy = isSaving || removeExercise.isPending;

  if (readOnly) return <CmvButton onClick={onCancel}>{t("common.close")}</CmvButton>;

  return (
    <>
      {isEditing && canDelete ? (
        <CmvConfirmButton
          label={t("library.builder.deleteExercise")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy}
          // `mutate` et non `mutateAsync` : le 409 « exercice utilisé dans N séances » atterrit
          // dans `removeExercise.error`, pas en rejet non capturé.
          onConfirm={() => removeExercise.mutate(exercise, { onSuccess: onDeleted })}
        />
      ) : null}
      <CmvButton variant="ghost" onClick={onCancel} disabled={isBusy}>
        {t("library.builder.cancel")}
      </CmvButton>
      <CmvButton
        onClick={onSubmit}
        disabled={isBusy || !canSubmit || blockedBy != null}
        title={blockedBy}
      >
        {isSaving ? t("library.builder.saving") : t(submitKey)}
      </CmvButton>
      <CmvFormError error={removeExercise.error} />
    </>
  );
}
