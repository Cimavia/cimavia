import { publishPlanSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class PublishPlanDto extends createZodDto(publishPlanSchema) {}
