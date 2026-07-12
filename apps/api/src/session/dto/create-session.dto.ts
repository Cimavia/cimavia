import { createSessionSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateSessionDto extends createZodDto(createSessionSchema) {}
