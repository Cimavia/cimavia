import { formatters } from "@/shared/util/formatter.util";

/** Les formateurs d'ARGENT du web. La division par 100 vit dans `@cmv/shared`. */
export const { formatMoney, formatPeriod } = formatters;
