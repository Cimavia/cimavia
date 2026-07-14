import { createScheduledSessionSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateScheduledSessionDto extends createZodDto(createScheduledSessionSchema) {}
