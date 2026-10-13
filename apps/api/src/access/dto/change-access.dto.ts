import { changeAccessSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class ChangeAccessDto extends createZodDto(changeAccessSchema) {}
