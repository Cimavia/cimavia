import { updateScheduledSessionSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateScheduledSessionDto extends createZodDto(updateScheduledSessionSchema) {}
