import {
  STRUCTURE_PRESET_NAME_KEY,
  type StructureDto,
  type StructureLibraryDto,
} from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { BuilderActions } from "@/feature/library/component/BuilderActions";
import { nameErrorOf, StructureFields } from "@/feature/library/component/StructureFields";
import { keptCopiesHint } from "@/feature/library/component/StructureList";
import { StructurePreview } from "@/feature/library/component/StructurePreview";
import { useBuilderSave } from "@/feature/library/hook/useBuilderSave";
import { useStructureDraft } from "@/feature/library/hook/useStructureDraft";
import {
  structureDetailQuery,
  useDeleteStructure,
  useStructure,
  useStructureLibrary,
} from "@/feature/library/hook/useStructures";
import { LibraryTab } from "@/feature/library/util/library-tab.util";
import { type StructureStart, structureStart } from "@/feature/library/util/structure-start.util";
import { CmvAppShell, CmvErrorState, CmvLeaveDialog, CmvStaleBanner } from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useStaleReload } from "@/shared/hook/useStaleReload";
import { isStaleWriteError } from "@/shared/lib/api";

type StructureBuilderScreenProps = {
  /** Absent = création. Sinon la structure est chargée depuis l'URL. */
  structureId?: string | undefined;
  /** Création seulement : la structure prête (sa clé) ou celle du Coach (son id) à copier. */
  from?: string | undefined;
};

/**
 * Le formulaire d'une structure du Coach (#717, maquette `coach_bibliotheque_structures`, frames 2
 * à 6) — pleine page comme les autres constructeurs de la bibliothèque, et pour la même raison :
 * le formulaire et ce que l'athlète en lira se lisent côte à côte.
 *
 * Une structure prête ne s'ouvre jamais ici : elle se duplique, et c'est la copie qui s'ouvre.
 */
export function StructureBuilderScreen({
  structureId,
  from,
}: Readonly<StructureBuilderScreenProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loadedId, generation, reload, isReloading } = useStaleReload(
    structureId,
    structureDetailQuery,
  );
  const detail = useStructure(loadedId);
  // La copie naît de la liste : la structure source y est, et les noms déjà pris aussi.
  const library = useStructureLibrary();
  const creating = loadedId == null;
  const waitsLibrary = creating && from != null;

  if ((!creating && detail.isPending) || (waitsLibrary && library.isPending)) {
    return (
      <CmvAppShell title={t("library.structure.loadingTitle")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  // Sur la DONNÉE, comme l'exercice : une relecture ratée garde la structure en cache, et la saisie
  // que le bandeau promet de garder.
  const failed =
    (!creating && detail.isError && detail.data === undefined) ||
    (waitsLibrary && library.isError && library.data === undefined);
  if (failed) {
    return (
      <CmvAppShell title={t("library.structure.loadingTitle")}>
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => (creating ? library.refetch() : detail.refetch())}
        />
      </CmvAppShell>
    );
  }

  const start = startOf(from, library.data, t);

  return (
    <StructureBuilder
      key={`${detail.data?.id ?? "new"}:${generation}`}
      structure={detail.data ?? null}
      start={start}
      onLeave={() => navigate({ to: "/library", search: { tab: LibraryTab.STRUCTURES } })}
      onReload={reload}
      isReloading={isReloading}
    />
  );
}

/** Ce dont part une création — le nom de la copie se lit dans la langue du Coach. */
function startOf(
  from: string | undefined,
  library: StructureLibraryDto | undefined,
  t: TFunction,
): StructureStart {
  return structureStart(from, library ?? { presets: [], structures: [] }, {
    preset: (key) => t(STRUCTURE_PRESET_NAME_KEY[key]),
    copy: (base, n) =>
      n === 1
        ? t("library.structure.copyName", { name: base })
        : t("library.structure.copyNameNth", { name: base, n }),
  });
}

type StructureBuilderProps = {
  structure: StructureDto | null;
  start: StructureStart;
  /** Toute sortie : Annuler, enregistrée, ou supprimée — retour à l'onglet Structures. */
  onLeave: () => void;
  /** Remplace la saisie par la dernière version de la structure, après un conflit (#604). */
  onReload: (id: string) => void;
  isReloading: boolean;
};

function StructureBuilder({
  structure,
  start,
  onLeave,
  onReload,
  isReloading,
}: Readonly<StructureBuilderProps>) {
  const { t } = useTranslation();
  const { data: library } = useStructureLibrary();
  const draft = useStructureDraft(structure, start.input);
  // Une durée ou un nombre refusé reste à l'écran, pas dans le brouillon (#566).
  const refused = useRefusedFields();
  const { blockedBy, titleMissing, touchTitle, save } = useBuilderSave(draft, refused.hasRefused, {
    titleRequired: "library.structure.nameRequired",
    saveFailed: "library.structure.saveFailed",
  });
  const guard = useLeaveGuard(
    draft.isDirty || refused.hasRefused,
    async () => (await save("library.structure.saved")) != null,
  );
  const removal = useStructureRemoval(structure, () => {
    guard.release();
    onLeave();
  });

  async function onSubmit() {
    const saved = await save("library.structure.saved");
    if (saved == null) return;
    guard.release();
    onLeave();
  }

  const nameError = nameErrorOf(titleMissing, draft.takenBy, t);
  // Le nom compte pour un point, chaque saisie refusée pour un autre (frame 6).
  const points = (nameError == null ? 0 : 1) + refused.count;
  const staleMessage = staleMessageOf(draft.isStale, removal.isStale);
  const heading = headingOf(structure, start.basedOn, t);
  const knownTags = [...new Set((library?.structures ?? []).flatMap((item) => item.tags))];

  return (
    <CmvAppShell
      title={heading.title}
      subtitle={heading.subtitle}
      actions={
        <>
          {points === 0 ? null : (
            <span className="text-cmv-caption text-cmv-error-on">
              {t("library.structure.points", { count: points })}
            </span>
          )}
          <BuilderActions
            readOnly={false}
            deleteLabel={t("library.structure.delete")}
            deleteHint={structure == null ? undefined : keptCopiesHint(structure, t)}
            onDelete={removal.onDelete}
            isDeleting={removal.isPending}
            deleteError={removal.error}
            isSaving={draft.isSaving}
            isWriting={draft.isSaving}
            submitLabel={submitLabel(draft.isSaving, structure != null, t)}
            canSubmit={draft.trimmedTitle !== ""}
            blockedBy={blockedBy}
            onCancel={onLeave}
            onSubmit={onSubmit}
          />
        </>
      }
    >
      {structure == null || structure.sessionCount === 0 ? null : (
        <p className="mb-cmv-lg text-cmv-caption text-cmv-text-mid">
          {t("library.structure.sessionsUnchanged")}
        </p>
      )}
      {staleMessage != null && structure != null ? (
        <div className="mb-cmv-xl">
          <CmvStaleBanner
            message={t(staleMessage)}
            onReload={() => onReload(structure.id)}
            isReloading={isReloading}
          />
        </div>
      ) : null}
      <RefusedFieldsContext value={refused.report}>
        {/* Deux colonnes dès `xl`, comme l'exercice : en dessous, le panneau passe sous le formulaire. */}
        <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-cmv-xl">
            <StructureFields
              draft={draft}
              nameError={nameError}
              onNameBlur={touchTitle}
              knownTags={knownTags}
            />

            {structure == null ? (
              <p className="text-cmv-caption text-cmv-text-lo">
                {t("library.structure.savedWhere")}
              </p>
            ) : null}
          </div>

          <aside className="xl:sticky xl:top-cmv-xl xl:self-start">
            <StructurePreview settings={draft.settings} />
          </aside>
        </div>
      </RefusedFieldsContext>
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}

/** L'en-tête : « Nouvelle structure » — d'après sa source s'il y en a une —, ou son nom. */
function headingOf(structure: StructureDto | null, basedOn: string | null, t: TFunction) {
  const mine = t("library.structure.mineSubtitle");
  if (structure == null) {
    return {
      title:
        basedOn == null
          ? t("library.structure.createTitle")
          : t("library.structure.createFrom", { name: basedOn }),
      subtitle: mine,
    };
  }
  // Comme l'exercice : « utilisée dans 0 séance » ne dit rien, et se lirait au singulier.
  return {
    title: structure.name,
    subtitle:
      structure.sessionCount === 0
        ? mine
        : t("library.structure.mineUsed", { count: structure.sessionCount }),
  };
}

function staleMessageOf(isSaveStale: boolean, isDeleteStale: boolean): string | null {
  if (isSaveStale) return "library.structure.stale";
  return isDeleteStale ? "library.structure.staleDelete" : null;
}

/** La suppression de la structure affichée — `onDelete` à `null` à la création. */
function useStructureRemoval(structure: StructureDto | null, onDeleted: () => void) {
  const remove = useDeleteStructure();
  return {
    onDelete: structure == null ? null : () => remove.mutate(structure, { onSuccess: onDeleted }),
    isPending: remove.isPending,
    error: remove.error,
    isStale: isStaleWriteError(remove.error),
  };
}

function submitLabel(isSaving: boolean, isEditing: boolean, t: TFunction): string {
  if (isSaving) return t("library.builder.saving");
  return t(isEditing ? "library.structure.submitEdit" : "library.structure.submitCreate");
}
