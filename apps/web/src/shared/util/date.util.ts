import { formatters } from "@/shared/util/formatter.util";

/** Les formateurs de DATE du web. Ce qu'ils font — et le piège du fuseau — vit dans `@cmv/shared`. */
export const {
  formatDate,
  formatDayLabel,
  formatWeekday,
  formatDayNumber,
  formatDateRange,
  formatDateTime,
  formatRelativeTime,
} = formatters;
