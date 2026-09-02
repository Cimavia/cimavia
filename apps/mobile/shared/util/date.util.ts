import { formatters } from "@/shared/util/formatter.util";

/** Les formateurs de DATE du mobile. Ce qu'ils font — et le piège du fuseau — vit dans `@cmv/shared`. */
export const {
  formatWeekday,
  formatDate,
  formatDateTime,
  formatDayNumber,
  formatFullDay,
  formatDateRange,
  formatRelativeTime,
} = formatters;
