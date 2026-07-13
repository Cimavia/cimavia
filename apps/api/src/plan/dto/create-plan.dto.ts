import { createPlanSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreatePlanDto extends createZodDto(createPlanSchema) {}
