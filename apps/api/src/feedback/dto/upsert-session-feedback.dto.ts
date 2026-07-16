import { upsertSessionFeedbackSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpsertSessionFeedbackDto extends createZodDto(upsertSessionFeedbackSchema) {}
