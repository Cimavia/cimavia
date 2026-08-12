import { updateReminderSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateReminderDto extends createZodDto(updateReminderSchema) {}
