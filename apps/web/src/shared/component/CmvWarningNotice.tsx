import type { ReactNode } from "react";
import { IoWarningOutline } from "react-icons/io5";

/**
 * Ce qu'on s'apprête à perdre de vue, avant un geste qui compte. Mêmes tokens que le variant
 * `warning` de `CmvBadge` : ce n'est pas une note d'information.
 */
export function CmvWarningNotice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="flex items-center gap-cmv-sm rounded-cmv-md border border-cmv-warning-line bg-cmv-warning-soft p-cmv-md text-cmv-caption text-cmv-warning-on">
      <IoWarningOutline aria-hidden className="shrink-0 text-cmv-body" />
      <span>{children}</span>
    </p>
  );
}
