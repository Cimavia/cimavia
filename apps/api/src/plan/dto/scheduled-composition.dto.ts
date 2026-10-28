import { scheduledCompositionInputSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ScheduledCompositionDto extends createZodDto(scheduledCompositionInputSchema) {}
