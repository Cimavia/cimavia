import { updateNotificationEmailPreferencesSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateNotificationEmailPreferencesDto extends createZodDto(
  updateNotificationEmailPreferencesSchema,
) {}
