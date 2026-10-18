import {
  AccessLevel,
  type AccessLevel as AccessLevelValue,
  accessChanges,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type ElementAccessDto,
  type ExerciseDto,
  foreignOf,
  MIXED_ACCESS,
  MyAccessLevel,
  type PanelAccess,
  panelAccess,
  required,
} from "@cmv/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { myRightText } from "@/feature/library/util/access-text.util";
import { CmvButton, CmvFormError, CmvPanel, CmvSegmented, useToast } from "@/shared/component";

// i18n-values library.access.level: AccessLevel

/** Un choix du sélecteur d'une entreprise : un niveau, ou « Mixte » pour la ligne qui l'était. */
type Segment = AccessLevelValue | typeof MIXED_ACCESS;

const LEVELS: readonly Segment[] = [AccessLevel.NONE, AccessLevel.READ, AccessLevel.WRITE];

/** Ce que le panneau lit d'un exercice ou d'une séance : les deux portent les mêmes champs. */
export type AccessElement = Pick<ExerciseDto, "id" | "title" | "owner" | "myAccess" | "grants">;

/**
 * Ce que le panneau d'une planification dit de plus (#607, maquette #597, frames 9 et 10) : son
 * droit ne vaut que pour les Coachs de son athlète, et une entreprise peut n'avoir personne à qui
 * l'ouvrir. Sans cadrage, le panneau est celui de la bibliothèque.
 */
export type AccessFraming = {
  /** Sous le titre, à la place de « Exercice · à toi ». */
  caption: string;
  /** L'en-tête des lignes, à la place de « Entreprises ». */
  sectionTitle: string;
  /** Avant les lignes : à qui le droit peut valoir. `null` : rien à rappeler. */
  scope: string | null;
  /** Après les lignes : le droit que le cycle reçoit par défaut. `null` : aucun. */
  defaultNote: string | null;
  /** Aucune entreprise à proposer (frame 10) : la phrase qui le dit, à la place des lignes. */
  empty: string;
  /** Ce qui reste au propriétaire, à la place de la phrase de la bibliothèque. */
  ownerOnly: string;
  /**
   * Les entreprises qu'un droit cite encore sans plus y être éligibles : leur ligne ne propose que
   * de le retirer, et `caption` dit pourquoi, à la place de ses Coachs. `null` : aucune.
   */
  stale: { ids: ReadonlySet<string>; caption: string } | null;
};

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
  /** Les accès sont enregistrés — avant la fermeture, qui suit. */
  onSaved: () => void;
  /** Lecture seule : « Ouvrir l'exercice ». */
  onOpen: (element: T) => void;
  framing?: AccessFraming;
};

/**
 * Le panneau des accès (#606, maquette #597, frames 4 à 7 et 13). Le propriétaire y règle, pour
 * chacune de ses entreprises, « Aucun · Lecture · Écriture » ; sur plusieurs éléments, une ligne
 * qui diffère reste « Mixte » tant qu'on n'y touche pas — ou qu'on y revient —, et n'est pas
 * envoyée. Ouvert sur l'élément d'un autre Coach, il dit seulement le propriétaire et le droit de
 * l'acteur.
 *
 * Les lignes d'un Coach (« Hérité ») arrivent avec #608.
 */
export function AccessPanel<T extends AccessElement>(props: Readonly<AccessPanelProps<T>>) {
  const [first] = props.elements;
  const element = required(first, "panneau des accès sans élément");
  if (props.elements.length === 1 && foreignOf(element) != null) {
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
  onSaved,
  framing,
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

  const ownerOnly = framing?.ownerOnly ?? t("library.access.ownerOnly");
  // Personne à qui ouvrir le cycle (frame 10) : rien à régler, le panneau se ferme seulement.
  if (framing != null && organizations.length === 0) {
    return (
      <CmvPanel
        open
        title={t("library.access.title")}
        onClose={onClose}
        footer={<CmvButton onClick={onClose}>{t("common.close")}</CmvButton>}
      >
        <div className="flex flex-col gap-cmv-xl">
          <ElementHeading title={first?.title} caption={framing.caption} />
          <section className="flex flex-col gap-cmv-sm">
            <SectionTitle>{framing.sectionTitle}</SectionTitle>
            <p className="rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-lg text-center text-cmv-body text-cmv-text-mid">
              {framing.empty}
            </p>
          </section>
          <p className="text-cmv-caption text-cmv-text-lo">{ownerOnly}</p>
        </div>
      </CmvPanel>
    );
  }

  function onSubmit() {
    mutation.mutate(
      { ids: elements.map((element) => element.id), changes },
      {
        onSuccess: () => {
          toast.success(t("library.access.saved"));
          onSaved();
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
          {/* Revenu à son point de départ, le panneau n'a plus rien à enregistrer : le refus ne
              porte plus sur rien. */}
          <CmvFormError error={changes.length === 0 ? null : mutation.error} />
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
        <ElementHeading
          title={isSingle ? first?.title : t(`${copyPrefix}.count`, { count: elements.length })}
          caption={
            isSingle
              ? (framing?.caption ?? t(`${copyPrefix}.mine`))
              : elements.map((element) => element.title).join(", ")
          }
        />

        {framing?.scope == null ? null : (
          <p className="text-cmv-body text-cmv-text-mid">{framing.scope}</p>
        )}

        <section className="flex flex-col gap-cmv-sm">
          <SectionTitle>{framing?.sectionTitle ?? t("library.access.organizations")}</SectionTitle>
          {organizations.map((organization) => {
            const value = edited.get(organization.id);
            const stale = framing?.stale?.ids.has(organization.id) === true;
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
                    {stale
                      ? framing?.stale?.caption
                      : t("library.access.organizationCoaches", {
                          count: others.length,
                          coaches: others.join(", "),
                        })}
                  </span>
                </div>
                <CmvSegmented
                  value={toSegment(value)}
                  disabled={mutation.isPending}
                  onChange={(next) =>
                    setEdited((current) => new Map(current).set(organization.id, fromSegment(next)))
                  }
                  options={levelsOf(initial.get(organization.id), stale).map((level) => ({
                    value: level,
                    label: levelLabel(level, t),
                  }))}
                />
              </div>
            );
          })}
        </section>

        {framing?.defaultNote == null ? null : (
          <p className="rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-caption text-cmv-text-mid">
            {framing.defaultNote}
          </p>
        )}

        <LevelLegend copyPrefix={copyPrefix} ownerOnly={ownerOnly} />
      </div>
    </CmvPanel>
  );
}

/** Le titre de l'élément — ou le compte des éléments —, et ce qui le situe. */
function ElementHeading({
  title,
  caption,
}: Readonly<{ title: string | undefined; caption: string }>) {
  return (
    <div className="flex flex-col gap-cmv-xs">
      <p className="text-cmv-subtitle text-cmv-text-hi">{title}</p>
      <p className="text-cmv-caption text-cmv-text-mid">{caption}</p>
    </div>
  );
}

function SectionTitle({ children }: Readonly<{ children: string }>) {
  return (
    <span className="text-cmv-caption uppercase tracking-wide text-cmv-text-lo">{children}</span>
  );
}

/**
 * Les choix d'une ligne. Partie de « Mixte », elle le garde : y revenir rend à chaque élément sa
 * valeur, sans annuler le reste du panneau. Plus éligible (`stale`), elle ne propose que son droit
 * et « Aucun » — l'API refuserait de l'ouvrir autrement.
 */
function levelsOf(initial: PanelAccess | undefined, stale: boolean): readonly Segment[] {
  if (stale) return LEVELS.filter((level) => level === AccessLevel.NONE || level === initial);
  return initial === MIXED_ACCESS ? [...LEVELS, MIXED_ACCESS] : LEVELS;
}

/** « Aucun » est l'absence de ligne de droit, `null` (#605). */
function toSegment(value: PanelAccess | undefined): Segment {
  return value ?? AccessLevel.NONE;
}

function fromSegment(value: Segment): PanelAccess {
  return value === AccessLevel.NONE ? null : value;
}

function levelLabel(level: Segment, t: TFunction): string {
  return level === MIXED_ACCESS ? t("library.access.mixed") : t(`library.access.level.${level}`);
}

/**
 * Ce que veulent dire les deux droits, et ce qu'aucun n'ouvre. Une liste de définitions : le
 * niveau en terme, son sens en phrase entière — l'anglais la traduira sans recoller de morceaux.
 */
function LevelLegend({
  copyPrefix,
  ownerOnly,
}: Readonly<{ copyPrefix: string; ownerOnly: string }>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-cmv-xs text-cmv-caption text-cmv-text-mid">
      <dl className="grid grid-cols-[auto_1fr] gap-x-cmv-sm gap-y-cmv-xs">
        <dt className="text-cmv-text-hi">{t("library.access.level.READ")}</dt>
        <dd>{t(`${copyPrefix}.readMeans`)}</dd>
        <dt className="text-cmv-text-hi">{t("library.access.level.WRITE")}</dt>
        <dd>{t(`${copyPrefix}.writeMeans`)}</dd>
      </dl>
      <p className="text-cmv-text-lo">{ownerOnly}</p>
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
  const { level } = element.myAccess;
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
          <dd className="text-cmv-text-hi">{myRightText(element.myAccess, t)}</dd>
        </dl>
        <p className="text-cmv-body text-cmv-text-mid">
          {t(level === MyAccessLevel.WRITE ? `${copyPrefix}.canWrite` : `${copyPrefix}.canRead`)}
        </p>
        <p className="text-cmv-caption text-cmv-text-lo">{t("library.access.ownerOnly")}</p>
      </div>
    </CmvPanel>
  );
}
