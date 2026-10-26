import {
  everyPhrase,
  formatTrainingDuration,
  type StructureSettings,
  settingsPhrase,
  structureDuration,
  structureTimeline,
  type TimelineLegend,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";

/**
 * Le panneau à côté du formulaire d'une structure (#717) : ce que l'athlète lira, la durée du bloc
 * quand elle se calcule, et le déroulé. Il suit chaque réponse : c'est là que le Coach vérifie
 * qu'il a dit ce qu'il voulait.
 */
export function StructurePreview({ settings }: Readonly<{ settings: StructureSettings }>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const duration = structureDuration(settings);
  const timeline = structureTimeline(settings);
  // Sans exercice, aucune phrase ne manque : « un seul par bip » n'a personne à faire alterner.
  const phrase = text(settingsPhrase(settings, null) ?? []);

  return (
    <div className="flex flex-col gap-cmv-lg rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-lg">
      <section className="flex flex-col gap-cmv-xs">
        <h2 className="text-cmv-caption text-cmv-text-mid">
          {t("library.structure.preview.reads")}
        </h2>
        <p className="text-cmv-body text-cmv-text-hi">
          {t("library.structure.preview.phrase", { phrase })}
        </p>
      </section>

      <section className="flex flex-col gap-cmv-xs">
        <h2 className="text-cmv-caption text-cmv-text-mid">
          {t("library.structure.preview.duration")}
        </h2>
        {/* Rien d'inventé quand l'athlète va à son rythme : personne ne connaît la durée. */}
        <p className="text-cmv-body text-cmv-text-hi tabular-nums">
          {duration == null ? "—" : formatTrainingDuration(duration.totalSeconds)}
        </p>
        {duration == null ? null : (
          <p className="text-cmv-caption text-cmv-text-lo">
            {t("library.structure.preview.durationWhy", {
              count: duration.rounds,
              unit: formatTrainingDuration(duration.unitSeconds),
            })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-cmv-sm">
        <h2 className="text-cmv-caption text-cmv-text-mid">
          {t("library.structure.preview.timeline")}
        </h2>
        {/* La frise est un dessin : la phrase au-dessus la dit déjà, en mots. Ses segments n'ont
            pas d'identité — elle se redessine à chaque réponse —, leur rang leur en tient lieu. */}
        <div aria-hidden className="flex h-6 gap-px overflow-hidden rounded-cmv-sm">
          {timeline.segments.map((segment, index) =>
            segment.kind === "work" ? (
              <span
                key={`work-${index}`}
                className="flex flex-[3] items-center justify-center bg-cmv-accent text-cmv-caption text-cmv-text-hi tabular-nums"
              >
                {segment.round}
              </span>
            ) : (
              <span key={`rest-${index}`} className="flex-1 bg-cmv-surface-hi" />
            ),
          )}
        </div>
        {timeline.axisSeconds == null ? null : (
          <div aria-hidden className="flex justify-between text-cmv-caption text-cmv-text-lo">
            {timeline.axisSeconds.map((seconds) => (
              <span key={seconds} className="tabular-nums">
                {seconds === 0 ? "0" : formatTrainingDuration(seconds)}
              </span>
            ))}
          </div>
        )}
        <ul className="flex flex-wrap gap-cmv-md text-cmv-caption text-cmv-text-mid">
          {legendItems(timeline.legend, t, (seconds) => text([everyPhrase(seconds)])).map(
            (item) => (
              <li key={item.label} className="flex items-center gap-cmv-xs">
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-3 rounded-cmv-sm",
                    item.rest ? "bg-cmv-surface-hi" : "bg-cmv-accent",
                  )}
                />
                {item.label}
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}

/** La légende : un effort, et son repos s'il y en a un. */
function legendItems(
  legend: TimelineLegend,
  t: TFunction,
  every: (seconds: number) => string,
): { label: string; rest: boolean }[] {
  if (legend.kind === "beep") {
    return [
      {
        label: t("library.structure.preview.beep", { every: every(legend.everySeconds) }),
        rest: false,
      },
    ];
  }
  if (legend.kind === "cycle") {
    return [
      {
        label: t("library.structure.preview.work", {
          duration: formatTrainingDuration(legend.workSeconds),
        }),
        rest: false,
      },
      {
        label: t("library.structure.preview.rest", {
          duration: formatTrainingDuration(legend.restSeconds),
        }),
        rest: true,
      },
    ];
  }
  const work =
    legend.capSeconds == null
      ? t("library.structure.preview.ownPace")
      : t("library.structure.preview.roundsDuring", {
          duration: formatTrainingDuration(legend.capSeconds),
        });
  const items = [{ label: work, rest: false }];
  if (legend.restSeconds != null) {
    items.push({
      label: t("library.structure.preview.rest", {
        duration: formatTrainingDuration(legend.restSeconds),
      }),
      rest: true,
    });
  }
  return items;
}
