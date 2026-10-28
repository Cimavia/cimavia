import { scheduledDosageInputSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ScheduledDosageDto extends createZodDto(scheduledDosageInputSchema) {}
