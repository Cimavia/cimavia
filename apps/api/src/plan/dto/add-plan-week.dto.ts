import { planWeekInputSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class AddPlanWeekDto extends createZodDto(planWeekInputSchema) {}
