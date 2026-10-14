import {
  AccessLevel,
  type AccessLevel as AccessLevelValue,
  accessChanges,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type ElementAccessDto,
  type ExerciseDto,
  MIXED_ACCESS,
  MyAccessLevel,
  type PanelAccess,
  panelAccess,
  required,
} from "@cmv/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CmvBadge,
  CmvButton,
  CmvFormError,
  CmvPanel,
  CmvSegmented,
  useToast,
} from "@/shared/component";

// i18n-values library.access.level: AccessLevel

/** Ce que le panneau lit d'un exercice ou d'une séance : les deux portent les mêmes champs. */
export type AccessElement = Pick<ExerciseDto, "id" | "title" | "owner" | "myAccess" | "grants">;

type AccessPanelProps<T extends AccessElement> = {
  /** Un élément depuis sa cellule Accès, plusieurs depuis la sélection — tous au Coach alors. */
  elements: readonly T[];
  /** Les entreprises du Coach : une ligne chacune. */
  organizations: readonly CoachOrganizationDto[];
  /**
   * `library.access.exercise` ou `library.access.session` : les phrases qui nomment l'élément
   * (« cet exercice », « cette séance »). Passé en dur par l'appelant, pour que `check:i18n` les
   * vérifie toutes les deux.
   */
  copyPrefix: string;
  mutation: UseMutationResult<ElementAccessDto[], Error, ChangeAccessInput>;
  onClose: () => void;
  /** Lecture seule : « Ouvrir l'exercice ». */
  onOpen: (element: T) => void;
};

/**
 * Le panneau des accès (#606, maquette #597, frames 4 à 7 et 13). Le propriétaire y règle, pour
 * chacune de ses entreprises, « Aucun · Lecture · Écriture » ; sur plusieurs éléments, une ligne
 * qui diffère reste « Mixte » tant qu'on n'y touche pas, et n'est pas envoyée. Ouvert sur
 * l'élément d'un autre Coach, il dit seulement le propriétaire et le droit de l'acteur.
 *
 * Les lignes d'un Coach (« Hérité ») arrivent avec #608.
 */
export function AccessPanel<T extends AccessElement>(props: Readonly<AccessPanelProps<T>>) {
  const [first] = props.elements;
  const element = required(first, "panneau des accès sans élément");
  if (props.elements.length === 1 && element.myAccess.level !== MyAccessLevel.OWNER) {
    return <ReadOnlyAccess element={element} {...props} />;
  }
  return <OwnerAccess {...props} />;
}

function OwnerAccess<T extends AccessElement>({
  elements,
  organizations,
  copyPrefix,
  mutation,
  onClose,
}: Readonly<AccessPanelProps<T>>) {
  const { t } = useTranslation();
  const toast = useToast();
  // Le panneau naît à chaque ouverture : un refus laissé par la précédente ne doit pas s'y lire.
  const { reset } = mutation;
  useEffect(() => reset(), [reset]);

  // Le propriétaire reçoit toujours ses droits : leur absence est une réponse incomplète, et
  // l'afficher « Aucun » ferait écrire des retraits que personne n'a demandés (règle dure n°5).
  const [initial] = useState(() =>
    panelAccess(
      elements.map((element) => required(element.grants, "droits d'un élément à soi")),
      organizations.map((organization) => organization.id),
    ),
  );
  const [edited, setEdited] = useState(initial);
  const changes = accessChanges(initial, edited);
  const [first] = elements;
  const ownerId = first?.owner.id;
  const isSingle = elements.length === 1;
  // Fermé en vol, le panneau suivant détacherait l'écriture (`reset`) : son refus ne se lirait
  // nulle part. Il reste donc ouvert jusqu'à la réponse — Annuler l'est déjà, la croix et Échap aussi.
  const close = () => {
    if (!mutation.isPending) onClose();
  };

  function onSubmit() {
    mutation.mutate(
      { ids: elements.map((element) => element.id), changes },
      {
        onSuccess: () => {
          toast.success(t("library.access.saved"));
          onClose();
        },
      },
    );
  }

  return (
    <CmvPanel
      open
      title={t("library.access.title")}
      onClose={close}
      footer={
        <div className="flex w-full flex-col items-end gap-cmv-sm">
          {/* Au-dessus des boutons, la saisie gardée (frame 13) : le refus de réduire un accès
              dit pourquoi, et le Coach choisit autrement sans tout refaire. */}
          <CmvFormError error={mutation.error} />
          <div className="flex gap-cmv-sm">
            <CmvButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              {t("common.cancel")}
            </CmvButton>
            <CmvButton onClick={onSubmit} disabled={mutation.isPending || changes.length === 0}>
              {isSingle
                ? t("library.access.save")
                : t(`${copyPrefix}.applyTo`, { count: elements.length })}
            </CmvButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-cmv-xl">
        <div className="flex flex-col gap-cmv-xs">
          <p className="text-cmv-subtitle text-cmv-text-hi">
            {isSingle ? first?.title : t(`${copyPrefix}.count`, { count: elements.length })}
          </p>
          <p className="text-cmv-caption text-cmv-text-mid">
            {isSingle
              ? t(`${copyPrefix}.mine`)
              : elements.map((element) => element.title).join(", ")}
          </p>
        </div>

        <section className="flex flex-col gap-cmv-sm">
          <span className="text-cmv-caption uppercase tracking-wide text-cmv-text-lo">
            {t("library.access.organizations")}
          </span>
          {organizations.map((organization) => {
            const value = edited.get(organization.id);
            const others = organization.coaches
              .filter((coach) => coach.coachId !== ownerId)
              .map((coach) => coach.name);
            return (
              <div
                key={organization.id}
                className="flex flex-wrap items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
              >
                <div className="flex flex-col">
                  <span className="text-cmv-body text-cmv-text-hi">{organization.name}</span>
                  <span className="text-cmv-caption text-cmv-text-mid">
                    {t("library.access.organizationCoaches", {
                      count: others.length,
                      coaches: others.join(", "),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-cmv-sm">
                  {value === MIXED_ACCESS ? (
                    <CmvBadge variant="neutral">{t("library.access.mixed")}</CmvBadge>
                  ) : null}
                  <CmvSegmented
                    value={toSegment(value)}
                    disabled={mutation.isPending}
                    onChange={(next) =>
                      setEdited((current) =>
                        new Map(current).set(organization.id, fromSegment(next)),
                      )
                    }
                    options={[AccessLevel.NONE, AccessLevel.READ, AccessLevel.WRITE].map(
                      (level) => ({ value: level, label: t(`library.access.level.${level}`) }),
                    )}
                  />
                </div>
              </div>
            );
          })}
        </section>

        <LevelLegend copyPrefix={copyPrefix} />
      </div>
    </CmvPanel>
  );
}

/**
 * « Mixte » n'est aucune des trois options : rien ne s'allume tant que le Coach ne choisit pas.
 * « Aucun » est l'absence de ligne de droit, `null` (#605).
 */
function toSegment(value: PanelAccess | undefined): AccessLevelValue | typeof MIXED_ACCESS {
  if (value === MIXED_ACCESS) return MIXED_ACCESS;
  return value ?? AccessLevel.NONE;
}

function fromSegment(value: AccessLevelValue | typeof MIXED_ACCESS): PanelAccess {
  return value === AccessLevel.NONE ? null : value;
}

/** Ce que veulent dire les deux droits, et ce qu'aucun n'ouvre. */
function LevelLegend({ copyPrefix }: Readonly<{ copyPrefix: string }>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-cmv-xs text-cmv-caption text-cmv-text-mid">
      <p>
        <span className="text-cmv-text-hi">{t("library.access.level.READ")}</span>
        {t(`${copyPrefix}.readMeans`)}
      </p>
      <p>
        <span className="text-cmv-text-hi">{t("library.access.level.WRITE")}</span>
        {t("library.access.writeMeans")}
      </p>
      <p className="text-cmv-text-lo">{t("library.access.ownerOnly")}</p>
    </div>
  );
}

/** Frame 7 : l'élément d'un autre Coach. Ni sélecteur, ni droit des autres — le sien, et d'où. */
function ReadOnlyAccess<T extends AccessElement>({
  element,
  copyPrefix,
  onClose,
  onOpen,
}: Readonly<AccessPanelProps<T> & { element: T }>) {
  const { t } = useTranslation();
  const { level, via } = element.myAccess;
  return (
    <CmvPanel
      open
      title={t("library.access.title")}
      onClose={onClose}
      footer={<CmvButton onClick={() => onOpen(element)}>{t(`${copyPrefix}.open`)}</CmvButton>}
    >
      <div className="flex flex-col gap-cmv-xl">
        <div className="flex flex-col gap-cmv-xs">
          <p className="text-cmv-subtitle text-cmv-text-hi">{element.title}</p>
          <p className="text-cmv-caption text-cmv-text-mid">
            {t(`${copyPrefix}.ofOwner`, { owner: element.owner.name })}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-cmv-lg gap-y-cmv-sm text-cmv-body">
          <dt className="text-cmv-text-mid">{t("library.access.owner")}</dt>
          <dd className="text-cmv-text-hi">{element.owner.name}</dd>
          <dt className="text-cmv-text-mid">{t("library.access.myRight")}</dt>
          <dd className="text-cmv-text-hi">
            {via == null
              ? t(`library.access.level.${level}`)
              : t("library.access.via", {
                  level: t(`library.access.level.${level}`),
                  organization: via.name,
                })}
          </dd>
        </dl>
        <p className="text-cmv-body text-cmv-text-mid">
          {t(level === MyAccessLevel.WRITE ? `${copyPrefix}.canWrite` : `${copyPrefix}.canRead`)}
        </p>
        <p className="text-cmv-caption text-cmv-text-lo">{t("library.access.ownerOnly")}</p>
      </div>
    </CmvPanel>
  );
}
