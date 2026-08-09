import { copyPlanWeekSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CopyPlanWeekDto extends createZodDto(copyPlanWeekSchema) {}
