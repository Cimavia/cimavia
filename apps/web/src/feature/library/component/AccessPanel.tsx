import {
  AccessLevel,
  type AccessLevel as AccessLevelValue,
  accessChanges,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type CoachPanelAccess,
  coachAccessChanges,
  type ElementAccessDto,
  type ExerciseDto,
  foreignOf,
  inheritedAccess,
  MIXED_ACCESS,
  MyAccessLevel,
  type PanelAccess,
  type PanelCoach,
  panelAccess,
  panelCoachAccess,
  panelCoaches,
  required,
} from "@cmv/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { myRightText } from "@/feature/library/util/access-text.util";
import { CmvButton, CmvFormError, CmvPanel, CmvSegmented, useToast } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

// i18n-values library.access.level: AccessLevel

/** Un choix du sélecteur d'une entreprise : un niveau, ou « Mixte » pour la ligne qui l'était. */
type Segment = AccessLevelValue | typeof MIXED_ACCESS;

const LEVELS: readonly Segment[] = [AccessLevel.NONE, AccessLevel.READ, AccessLevel.WRITE];

/** « Hérité » sur la ligne d'un Coach (#608) : l'absence de ligne, il suit ses entreprises. */
const INHERITED = "INHERITED";

/** Un choix du sélecteur d'un Coach : « Hérité », un niveau — « Aucun » compris —, ou « Mixte ». */
type CoachSegment = AccessLevelValue | typeof INHERITED | typeof MIXED_ACCESS;

const COACH_LEVELS: readonly CoachSegment[] = [
  INHERITED,
  AccessLevel.NONE,
  AccessLevel.READ,
  AccessLevel.WRITE,
];

/** Ce que le panneau lit d'un exercice ou d'une séance : les deux portent les mêmes champs. */
export type AccessElement = Pick<
  ExerciseDto,
  "id" | "title" | "owner" | "myAccess" | "grants" | "coachGrants"
>;

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
  /**
   * Les Coachs dont une ligne ouvre encore le cycle sans qu'ils suivent son athlète (#608) : comme
   * l'entreprise plus éligible, leur ligne ne propose que de rendre la main, et `caption` dit
   * pourquoi. `null` : aucun.
   */
  staleCoaches: { coaches: readonly PanelCoach[]; caption: string } | null;
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
 * Sous chaque entreprise, ses Coachs en retrait (#608, frame 5) : « Hérité · Aucun · Lecture ·
 * Écriture ». Leur ligne l'emporte sur l'entreprise, « Aucun » compris ; en « Hérité », elle dit le
 * droit qui en découle.
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
  const ownerId = required(first, "panneau des accès sans élément").owner.id;
  const isSingle = elements.length === 1;

  const coachGroups = panelCoaches(organizations, ownerId);
  const staleCoaches = framing?.staleCoaches?.coaches ?? [];
  const [initialCoaches] = useState(() =>
    panelCoachAccess(
      elements.map((element) =>
        required(element.coachGrants, "droits des Coachs d'un élément à soi"),
      ),
      [...coachGroups.flatMap((group) => group.coaches), ...staleCoaches].map(
        (coach) => coach.coachId,
      ),
    ),
  );
  const [editedCoaches, setEditedCoaches] = useState(initialCoaches);
  const coachChanges = coachAccessChanges(initialCoaches, editedCoaches);
  const unchanged = changes.length === 0 && coachChanges.length === 0;
  const nameOf = (organizationId: string) =>
    organizations.find((organization) => organization.id === organizationId)?.name ?? "";
  const coachRow = (coach: PanelCoach, caption: string, stale: boolean) => (
    <CoachRow
      key={coach.coachId}
      coach={coach}
      caption={caption}
      initial={initialCoaches.get(coach.coachId)}
      value={editedCoaches.get(coach.coachId)}
      stale={stale}
      inherited={inheritedText(coach, edited, nameOf, copyPrefix, t)}
      disabled={mutation.isPending}
      onChange={(next) => setEditedCoaches((current) => new Map(current).set(coach.coachId, next))}
    />
  );
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
      { ids: elements.map((element) => element.id), changes, coachChanges },
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
          <CmvFormError error={unchanged ? null : mutation.error} />
          <div className="flex gap-cmv-sm">
            <CmvButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              {t("common.cancel")}
            </CmvButton>
            <CmvButton onClick={onSubmit} disabled={mutation.isPending || unchanged}>
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
            const stale = framing?.stale?.ids.has(organization.id) === true;
            const others = organization.coaches
              .filter((coach) => coach.coachId !== ownerId)
              .map((coach) => coach.name);
            const group = coachGroups.find((each) => each.organizationId === organization.id);
            return (
              <Fragment key={organization.id}>
                <AccessRow
                  name={organization.name}
                  caption={
                    stale
                      ? (framing?.stale?.caption ?? "")
                      : t("library.access.organizationCoaches", {
                          count: others.length,
                          coaches: others.join(", "),
                        })
                  }
                  value={toSegment(edited.get(organization.id))}
                  options={levelsOf(initial.get(organization.id), stale)}
                  disabled={mutation.isPending}
                  onChange={(next) =>
                    setEdited((current) => new Map(current).set(organization.id, fromSegment(next)))
                  }
                />
                {(group?.coaches ?? []).map((coach) =>
                  coachRow(
                    coach,
                    t("library.access.coachOf", {
                      organizations: coach.organizationIds.map(nameOf).join(", "),
                    }),
                    false,
                  ),
                )}
              </Fragment>
            );
          })}
          {staleCoaches.map((coach) => coachRow(coach, framing?.staleCoaches?.caption ?? "", true))}
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

/** Une ligne du panneau : un bénéficiaire, ce qui le situe, et son sélecteur. */
function AccessRow<S extends Segment | CoachSegment>({
  name,
  caption,
  value,
  options,
  disabled,
  onChange,
  indented = false,
  note = null,
}: Readonly<{
  name: string;
  caption: string;
  value: S;
  options: readonly S[];
  disabled: boolean;
  onChange: (next: S) => void;
  indented?: boolean;
  /** Sous le sélecteur : le droit qu'un Coach hérite, quand il est en « Hérité ». */
  note?: string | null;
}>) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm",
        indented && "ml-cmv-xl",
      )}
    >
      <div className="flex flex-col">
        <span className="text-cmv-body text-cmv-text-hi">{name}</span>
        <span className="text-cmv-caption text-cmv-text-mid">{caption}</span>
      </div>
      <div className="flex flex-col items-end gap-cmv-xs">
        <CmvSegmented
          value={value}
          disabled={disabled}
          onChange={onChange}
          options={options.map((option) => ({ value: option, label: segmentLabel(option, t) }))}
        />
        {note == null ? null : <span className="text-cmv-caption text-cmv-text-mid">{note}</span>}
      </div>
    </div>
  );
}

/** La ligne d'un Coach, en retrait sous son entreprise (#608, frame 5). */
function CoachRow({
  coach,
  caption,
  initial,
  value,
  stale,
  inherited,
  disabled,
  onChange,
}: Readonly<{
  coach: PanelCoach;
  caption: string;
  initial: CoachPanelAccess | undefined;
  value: CoachPanelAccess | undefined;
  stale: boolean;
  inherited: string;
  disabled: boolean;
  onChange: (next: CoachPanelAccess) => void;
}>) {
  const segment = toCoachSegment(value);
  return (
    <AccessRow
      name={coach.name}
      caption={caption}
      value={segment}
      options={coachLevelsOf(initial, stale)}
      disabled={disabled}
      onChange={(next) => onChange(fromCoachSegment(next))}
      indented
      note={segment === INHERITED ? inherited : null}
    />
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

/**
 * Les choix de la ligne d'un Coach, selon la même règle. Plus éligible (`stale`), elle ne propose
 * que son droit et « Hérité » : l'API refuserait de lui ouvrir le cycle autrement.
 */
function coachLevelsOf(
  initial: CoachPanelAccess | undefined,
  stale: boolean,
): readonly CoachSegment[] {
  const start = toCoachSegment(initial);
  if (stale) return COACH_LEVELS.filter((level) => level === INHERITED || level === start);
  return start === MIXED_ACCESS ? [...COACH_LEVELS, MIXED_ACCESS] : COACH_LEVELS;
}

/** « Hérité » est l'absence de ligne, `null` ; « Aucun » y est une ligne `NONE` (#608). */
function toCoachSegment(value: CoachPanelAccess | undefined): CoachSegment {
  return value ?? INHERITED;
}

function fromCoachSegment(value: CoachSegment): CoachPanelAccess {
  return value === INHERITED ? null : value;
}

/**
 * Ce que « Hérité » donne au Coach, d'après ses entreprises telles qu'elles sont réglées à
 * l'instant : « Écriture via F », « Aucun », ou — une entreprise en « Mixte » — « Suit la ligne
 * de F sur chaque exercice ».
 */
function inheritedText(
  coach: PanelCoach,
  organizationValues: ReadonlyMap<string, PanelAccess>,
  nameOf: (organizationId: string) => string,
  copyPrefix: string,
  t: TFunction,
): string {
  const inherited = inheritedAccess(coach.organizationIds, organizationValues);
  if (inherited === MIXED_ACCESS) {
    return t(`${copyPrefix}.inheritsMixed`, {
      organizations: coach.organizationIds.map(nameOf).join(", "),
    });
  }
  if (inherited == null) return t("library.access.level.NONE");
  const via = coach.organizationIds.find((id) => organizationValues.get(id) === inherited) ?? "";
  return t("library.access.via", {
    level: t(`library.access.level.${inherited}`),
    organization: nameOf(via),
  });
}

/** « Aucun » est l'absence de ligne de droit, `null` (#605). */
function toSegment(value: PanelAccess | undefined): Segment {
  return value ?? AccessLevel.NONE;
}

function fromSegment(value: Segment): PanelAccess {
  return value === AccessLevel.NONE ? null : value;
}

function segmentLabel(level: Segment | CoachSegment, t: TFunction): string {
  if (level === MIXED_ACCESS) return t("library.access.mixed");
  if (level === INHERITED) return t("library.access.inherited");
  return t(`library.access.level.${level}`);
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
