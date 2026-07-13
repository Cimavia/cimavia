import { updatePlanSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdatePlanDto extends createZodDto(updatePlanSchema) {}
