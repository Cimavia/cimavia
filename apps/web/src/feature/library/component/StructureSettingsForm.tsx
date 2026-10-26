import {
  disabledOptions,
  type Phrase,
  SettingValue,
  STRUCTURE_MAX_DURATION_SECONDS,
  STRUCTURE_MAX_ROUNDS,
  STRUCTURE_MIN_DURATION_SECONDS,
  STRUCTURE_MIN_ROUNDS,
  StructureAdvance,
  StructureRepeat,
  type StructureSettings,
  StructureToggle,
  settingValues,
  withAdvance,
  withRepeat,
  withSettingValue,
  withToggle,
} from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvCountField, CmvDurationField } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";

const DURATION_BOUNDS = {
  min: STRUCTURE_MIN_DURATION_SECONDS,
  max: STRUCTURE_MAX_DURATION_SECONDS,
};

const ADVANCES = [
  {
    kind: StructureAdvance.ATHLETE,
    title: "library.structure.form.athlete",
    sub: "library.structure.form.athleteSub",
  },
  {
    kind: StructureAdvance.BEEP,
    title: "library.structure.form.beep",
    sub: "library.structure.form.beepSub",
  },
  {
    kind: StructureAdvance.CYCLE,
    title: "library.structure.form.cycle",
    sub: "library.structure.form.cycleSub",
  },
] as const;

const REPEATS = [
  {
    kind: StructureRepeat.ROUNDS,
    title: "library.structure.form.rounds",
    sub: "library.structure.form.roundsSub",
    option: null,
  },
  {
    kind: StructureRepeat.MAX,
    title: "library.structure.form.max",
    sub: "library.structure.form.maxSub",
    option: "REPEAT_MAX",
  },
  {
    kind: StructureRepeat.ONCE,
    title: "library.structure.form.once",
    sub: "library.structure.form.onceSub",
    option: "REPEAT_ONCE",
  },
] as const;

const TOGGLES = [
  {
    toggle: StructureToggle.REST_BETWEEN_EXERCISES,
    value: SettingValue.REST_BETWEEN_EXERCISES,
    title: "library.structure.form.restBetweenExercises",
    sub: "library.structure.form.restBetweenExercisesSub",
  },
  {
    toggle: StructureToggle.REST_BETWEEN_ROUNDS,
    value: SettingValue.REST_BETWEEN_ROUNDS,
    title: "library.structure.form.restBetweenRounds",
    sub: "library.structure.form.restBetweenRoundsSub",
  },
  {
    toggle: StructureToggle.LIMIT,
    value: SettingValue.LIMIT,
    title: "library.structure.form.limit",
    sub: "library.structure.form.limitSub",
  },
] as const;

type StructureSettingsFormProps = {
  settings: StructureSettings;
  onChange: (settings: StructureSettings) => void;
};

/**
 * Les trois questions d'une structure (#717, maquette `structure_formulaire`) : quand passe-t-on
 * à la suite, combien de fois, quels repos et quelle limite. Une réponse que les autres grisent
 * reste visible, fermée, avec sa raison — la cacher laisserait chercher où elle est passée.
 *
 * L'ordre des exercices n'est pas ici : il n'a de sens qu'avec des exercices, dans le bloc (#719).
 */
export function StructureSettingsForm({
  settings,
  onChange,
}: Readonly<StructureSettingsFormProps>) {
  const { t } = useTranslation();
  const disabled = disabledOptions(settings);
  const values = settingValues(settings);

  /** Le champ d'une durée que la réponse choisie porte : sans elle, il n'existe pas. */
  function seconds(value: SettingValue, label: string, labelHidden = false) {
    const current = values[value];
    if (current == null) return null;
    return (
      <CmvDurationField
        label={label}
        labelHidden={labelHidden}
        value={current}
        bounds={DURATION_BOUNDS}
        nullable={false}
        onChange={(amount) => {
          // Exigée (`nullable={false}`), la durée n'arrive jamais vide.
          if (amount != null) onChange(withSettingValue(settings, value, amount));
        }}
      />
    );
  }

  /** Les valeurs d'une réponse à la question 1 : aucune quand l'athlète va à son rythme. */
  function advanceFields(kind: StructureAdvance) {
    if (kind === StructureAdvance.BEEP) {
      return seconds(SettingValue.EVERY, t("library.structure.form.every"));
    }
    if (kind === StructureAdvance.CYCLE) {
      return (
        <>
          {seconds(SettingValue.WORK, t("library.structure.form.work"))}
          {seconds(SettingValue.REST, t("library.structure.form.rest"))}
        </>
      );
    }
    return null;
  }

  /** Les valeurs d'une réponse à la question 2 : aucune pour une seule fois. */
  function repeatFields(kind: StructureRepeat) {
    if (kind === StructureRepeat.MAX) {
      return seconds(SettingValue.CAP, t("library.structure.form.capIn"));
    }
    const rounds = values.ROUNDS;
    if (kind !== StructureRepeat.ROUNDS || rounds == null) return null;
    return (
      <CmvCountField
        label={t("library.structure.form.roundsLabel")}
        labelHidden
        unit={t("library.structure.form.roundsUnit", { count: rounds })}
        value={rounds}
        min={STRUCTURE_MIN_ROUNDS}
        max={STRUCTURE_MAX_ROUNDS}
        onChange={(count) => onChange(withSettingValue(settings, SettingValue.ROUNDS, count))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-cmv-xl">
      <Question number={1} title={t("library.structure.form.advance")}>
        {ADVANCES.map((option) => (
          <Choice
            key={option.kind}
            type="radio"
            name="advance"
            title={t(option.title)}
            sub={t(option.sub)}
            checked={settings.advance.kind === option.kind}
            reason={null}
            onToggle={() => onChange(withAdvance(settings, option.kind))}
          >
            {advanceFields(option.kind)}
          </Choice>
        ))}
      </Question>

      <Question number={2} title={t("library.structure.form.repeat")}>
        {REPEATS.map((option) => (
          <Choice
            key={option.kind}
            type="radio"
            name="repeat"
            title={t(option.title)}
            sub={t(option.sub)}
            checked={settings.repeat.kind === option.kind}
            reason={option.option == null ? null : (disabled[option.option] ?? null)}
            onToggle={() => onChange(withRepeat(settings, option.kind))}
          >
            {repeatFields(option.kind)}
          </Choice>
        ))}
      </Question>

      <Question number={3} title={t("library.structure.form.restAndLimit")}>
        {TOGGLES.map((option) => (
          <Choice
            key={option.toggle}
            type="checkbox"
            name={option.toggle}
            title={t(option.title)}
            sub={t(option.sub)}
            checked={values[option.value] != null}
            reason={disabled[option.toggle] ?? null}
            onToggle={(on) => onChange(withToggle(settings, option.toggle, on))}
          >
            {seconds(option.value, t(option.title), true)}
          </Choice>
        ))}
      </Question>

      <p className="text-cmv-caption text-cmv-text-lo">{t("library.structure.form.defaults")}</p>
    </div>
  );
}

function Question({
  number,
  title,
  children,
}: Readonly<{ number: number; title: string; children: ReactNode }>) {
  return (
    <fieldset className="flex flex-col gap-cmv-sm">
      <legend className="mb-cmv-sm flex items-baseline gap-cmv-sm text-cmv-body text-cmv-text-hi">
        <span aria-hidden className="text-cmv-caption text-cmv-accent-on tabular-nums">
          {number}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

type ChoiceProps = {
  type: "radio" | "checkbox";
  name: string;
  title: string;
  sub: string;
  checked: boolean;
  /** Pourquoi les autres réponses grisent celle-ci, ou `null` quand elle est libre. */
  reason: Phrase | null;
  onToggle: (checked: boolean) => void;
  /** Les valeurs de la réponse, montrées une fois choisie. */
  children?: ReactNode;
};

/** Une réponse : son titre, ce qu'elle veut dire, et ses valeurs une fois choisie. */
function Choice({
  type,
  name,
  title,
  sub,
  checked,
  reason,
  onToggle,
  children,
}: Readonly<ChoiceProps>) {
  const text = usePhraseText();
  const closed = reason != null;
  // Une réponse grisée n'est jamais choisie (`withoutDisabled`) : ses valeurs n'existent pas.
  const on = checked && !closed;
  return (
    <div
      className={cn(
        "flex flex-col gap-cmv-sm rounded-cmv-md border px-cmv-md py-cmv-sm",
        on ? "border-cmv-accent bg-cmv-accent-soft" : "border-cmv-border bg-cmv-surface",
        closed && "opacity-60",
      )}
    >
      {/* Une grille plutôt qu'une colonne imbriquée : le texte du libellé reste à portée des
          lecteurs d'écran — et de la règle d'accessibilité, qui ne descend que de deux niveaux. */}
      <label
        className={cn(
          "grid grid-cols-[auto_1fr] items-start gap-x-cmv-sm",
          !closed && "cursor-pointer",
        )}
      >
        <input
          type={type}
          name={name}
          checked={on}
          disabled={closed}
          onChange={(event) => onToggle(event.target.checked)}
          className="row-span-2 mt-1 accent-cmv-accent"
        />
        <span className="text-cmv-body text-cmv-text-hi">{title}</span>
        <span className="text-cmv-caption text-cmv-text-mid">{closed ? text([reason]) : sub}</span>
      </label>
      {on && children != null ? (
        <div className="flex flex-wrap gap-cmv-md pl-cmv-xl">{children}</div>
      ) : null}
    </div>
  );
}
