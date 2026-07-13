import { updatePlanWeekSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdatePlanWeekDto extends createZodDto(updatePlanWeekSchema) {}
