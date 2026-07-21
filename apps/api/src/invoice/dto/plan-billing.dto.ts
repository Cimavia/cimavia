import { planBillingSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class PlanBillingDto extends createZodDto(planBillingSchema) {}
