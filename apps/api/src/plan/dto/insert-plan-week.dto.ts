import { insertPlanWeekSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class InsertPlanWeekDto extends createZodDto(insertPlanWeekSchema) {}
