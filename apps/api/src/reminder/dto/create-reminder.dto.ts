import { createReminderSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateReminderDto extends createZodDto(createReminderSchema) {}
