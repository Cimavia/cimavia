import { seriesOf as seriesNamed } from "@cmv/e2e/seed";
import { t } from "./i18n";

export {
  type Account,
  json,
  mondayOfThisWeek,
  PASSWORD,
  type Seed,
  upcomingDueDate,
} from "@cmv/e2e/seed";

/** Le nom d'un bloc Séries tel que le constructeur du web le pose. */
export const SERIES_NAME = t("block.preset.series");

/** Un bloc Séries d'un exercice, sous le nom que le web lui donne. */
export const seriesOf = (exerciseId: string, grid?: Parameters<typeof seriesNamed>[2]) =>
  seriesNamed(exerciseId, SERIES_NAME, grid);
