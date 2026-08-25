import type { CustomMetric } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PreviewBlock } from "@/feature/library/component/PreviewBlock";
import type { CompositionItem } from "@/feature/library/hook/useSessionDraft";
import { CmvCard } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type SessionPreviewProps = {
  items: readonly CompositionItem[];
  customMetrics: readonly CustomMetric[];
};

/**
 * Ce que l'athlète verra de la séance ENTIÈRE. **Lecture seule** : ni timers ni cases à cocher
 * n'y sont paramétrables, ils découlent des valeurs saisies.
 */
export function SessionPreview({ items, customMetrics }: Readonly<SessionPreviewProps>) {
  const { t } = useTranslation();

  return (
    <section className="flex min-w-0 flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.session.previewTitle")}
      </span>

      {items.length === 0 ? (
        <p className="rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">
          {t("library.session.previewEmpty")}
        </p>
      ) : (
        <CmvCard className="flex min-w-0 flex-col gap-cmv-lg">
          {/* Un filet entre les exercices : sans lui deux exercices successifs se lisent comme
              un seul, et l'athlète confond leurs dosages. Même règle que dans l'aperçu d'exercice. */}
          {items.map((item, index) => (
            <div
              key={item.key}
              className={cn(
                "flex flex-col gap-cmv-xs",
                index === 0 ? "" : "border-cmv-border border-t pt-cmv-lg",
              )}
            >
              <h4 className="text-cmv-body text-cmv-text-hi">{item.title}</h4>
              {item.blocks.map((block) => (
                <PreviewBlock key={block.id} block={block} customMetrics={customMetrics} />
              ))}
              {item.note.trim() === "" ? null : (
                <p className="text-cmv-caption text-cmv-text-mid">{item.note}</p>
              )}
            </div>
          ))}
        </CmvCard>
      )}
    </section>
  );
}
