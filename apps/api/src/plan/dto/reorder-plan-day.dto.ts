import { reorderPlanDaySchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ReorderPlanDayDto extends createZodDto(reorderPlanDaySchema) {}
