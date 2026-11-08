import { eraseAccountSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class EraseAccountDto extends createZodDto(eraseAccountSchema) {}
