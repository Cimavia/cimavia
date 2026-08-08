import { updateReminderStatusSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateReminderStatusDto extends createZodDto(updateReminderStatusSchema) {}
