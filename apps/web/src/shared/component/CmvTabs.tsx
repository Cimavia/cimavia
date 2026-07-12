import { cn } from "@/shared/util/cn.util";

export type CmvTab<T extends string> = { value: T; label: string; count?: number };

type CmvTabsProps<T extends string> = {
  tabs: CmvTab<T>[];
  value: T;
  onChange: (value: T) => void;
};

// Onglets de section (Exercices / Séances) avec compteur optionnel.
export function CmvTabs<T extends string>({ tabs, value, onChange }: CmvTabsProps<T>) {
  return (
    <div role="tablist" className="flex gap-cmv-lg border-cmv-border border-b">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex items-center gap-cmv-sm border-b-2 px-cmv-xs pb-cmv-sm text-cmv-subtitle transition-colors",
              active
                ? "border-cmv-accent text-cmv-text-hi"
                : "border-transparent text-cmv-text-mid hover:text-cmv-text-hi",
            )}
          >
            {tab.label}
            {tab.count == null ? null : (
              <span className="rounded-cmv-pill bg-cmv-bg-1 px-cmv-sm text-cmv-caption text-cmv-text-mid">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
