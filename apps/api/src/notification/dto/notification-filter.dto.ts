import { notificationFilterSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class NotificationFilterDto extends createZodDto(notificationFilterSchema) {}
