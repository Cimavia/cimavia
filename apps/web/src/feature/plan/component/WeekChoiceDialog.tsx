import {
  type CompositionEdit,
  type CompositionLibrary,
  type CopyChoice,
  compositionTargets,
  copyChoices,
  type PlanWeekDto,
  type ScheduledSessionCopyDto,
  type SessionVersion,
} from "@cmv/shared";
import { type SyntheticEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  type ChangeWords,
  dialogFoot,
  initiallyChecked,
  weekNumberOf,
} from "@/feature/plan/util/composition.util";
import { CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDayLabel } from "@/shared/util/date.util";

// i18n-values plan.composition.dialog.refusal: CompositionRefusal

export type CompositionTargets = { apply: SessionVersion[]; revert: SessionVersion[] };

type WeekChoiceDialogProps = {
  edit: CompositionEdit;
  /** Rouverte depuis l'étiquette d'une carte : le changement est déjà en place quelque part. */
  reopened: boolean;
  copies: readonly ScheduledSessionCopyDto[];
  weeks: readonly PlanWeekDto[];
  /** La séance du panneau : sa semaine est désignée, et cochée d'avance pour un changement nouveau. */
  here: string;
  library: CompositionLibrary;
  /** La phrase de tête : « Remplacer 2.4 Corde à sauter par Rameur. » */
  what: string;
  words: ChangeWords;
  isBusy: boolean;
  onValidate: (targets: CompositionTargets) => void;
  onCancel: () => void;
};

/**
 * « Pour quelles semaines ? » (#720, frames 2 ter à 2 quinquies) : les copies de la séance-type
 * dans le cycle, à cocher. Une semaine où le changement ne s'appliquerait pas — ou ne se
 * déferait pas — est grisée, avec sa raison, et garde son état.
 *
 * Rouverte et tout décoché, « Valider » devient « Annuler ce changement » : chaque semaine qui
 * l'avait retrouve la composition de la séance-type. Nouvelle et rien de coché, il n'y a rien à
 * faire : le bouton se ferme.
 */
export function WeekChoiceDialog(props: Readonly<WeekChoiceDialogProps>) {
  const { edit, reopened, copies, weeks, here, library, what, words, isBusy } = props;
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [choices] = useState(() => copyChoices(copies, edit, library));
  const [checked, setChecked] = useState(() => initiallyChecked(choices, here, reopened));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Échap vaut « Annuler » ; pendant l'envoi, la fenêtre attend sa réponse.
  function onEscape(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!isBusy) props.onCancel();
  }

  const open = choices.filter((choice) => choice.refusal === null);
  const allOn = open.length > 0 && open.every((choice) => checked.has(choice.id));
  const targets = compositionTargets(copies, choices, checked);
  const nothing = targets.apply.length === 0 && targets.revert.length === 0;
  const cancelling = reopened && checked.size === 0;
  const foot = dialogFoot(copies, choices, checked, weeks, words, t);

  function toggle(id: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onEscape}
      className="w-full max-w-md rounded-xl border border-cmv-border bg-cmv-surface p-6 backdrop:bg-cmv-bg-0/70"
    >
      <div className="mb-cmv-sm flex items-center justify-between gap-cmv-md">
        <h2 id={titleId} className="text-cmv-title text-cmv-text-hi">
          {t("plan.composition.dialog.title")}
        </h2>
        <label className="flex cursor-pointer items-center gap-cmv-xs text-cmv-caption text-cmv-text-mid">
          <input
            type="checkbox"
            checked={allOn}
            disabled={open.length === 0}
            onChange={(event) =>
              setChecked(new Set(event.target.checked ? open.map((choice) => choice.id) : []))
            }
            className="accent-cmv-accent"
          />
          {t("plan.composition.dialog.all")}
        </label>
      </div>
      <p className="mb-cmv-md text-cmv-body text-cmv-text-mid">{what}</p>

      <ul className="mb-cmv-md flex flex-col gap-cmv-sm">
        {copies.map((copy, index) => (
          <WeekChoice
            key={copy.id}
            copy={copy}
            choice={choices[index]}
            week={weekNumberOf(copy, weeks)}
            here={copy.id === here}
            checked={checked.has(copy.id)}
            onToggle={(on) => toggle(copy.id, on)}
          />
        ))}
      </ul>

      {foot === "" ? null : <p className="mb-cmv-md text-cmv-caption text-cmv-text-mid">{foot}</p>}

      <div className="flex flex-wrap justify-end gap-cmv-sm">
        <CmvButton variant="secondary" onClick={props.onCancel} disabled={isBusy}>
          {t("plan.composition.dialog.cancel")}
        </CmvButton>
        <CmvButton
          variant={cancelling ? "danger" : "primary"}
          onClick={() => props.onValidate(targets)}
          disabled={isBusy || nothing}
        >
          {cancelling
            ? t("plan.composition.dialog.cancelChange")
            : t("plan.composition.dialog.validate")}
        </CmvButton>
      </div>
    </dialog>,
    document.body,
  );
}

type WeekChoiceProps = {
  copy: ScheduledSessionCopyDto;
  choice: CopyChoice | undefined;
  week: number | null;
  here: boolean;
  checked: boolean;
  onToggle: (on: boolean) => void;
};

/** Une semaine : cochée, décochée, ou grisée avec la raison — et alors figée dans son état. */
function WeekChoice({ copy, choice, week, here, checked, onToggle }: Readonly<WeekChoiceProps>) {
  const { t } = useTranslation();
  const refusal = choice?.refusal ?? null;
  const closed = refusal !== null;
  const on = closed ? choice?.inPlace === true : checked;
  const label = [
    week === null ? null : t("plan.composition.week", { number: week }),
    formatDayLabel(copy.scheduledDate),
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <li>
      <label
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-start gap-x-cmv-sm rounded-cmv-md border px-cmv-md py-cmv-sm",
          closed
            ? "cursor-not-allowed border-dashed border-cmv-border"
            : "cursor-pointer border-cmv-border",
        )}
      >
        <input
          type="checkbox"
          checked={on}
          disabled={closed}
          onChange={(event) => onToggle(event.target.checked)}
          className="row-span-2 mt-1 accent-cmv-accent"
        />
        <span className={cn("text-cmv-body", closed ? "text-cmv-text-lo" : "text-cmv-text-hi")}>
          {label}
        </span>
        {here ? (
          <span className="text-cmv-caption text-cmv-accent-on">
            {t("plan.composition.dialog.here")}
          </span>
        ) : (
          <span />
        )}
        {closed ? (
          <span className="col-span-2 text-cmv-caption text-cmv-text-mid">
            {t(`plan.composition.dialog.refusal.${refusal}`)}
          </span>
        ) : null}
      </label>
    </li>
  );
}
