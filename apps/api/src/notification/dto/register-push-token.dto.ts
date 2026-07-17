import { registerPushTokenSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class RegisterPushTokenDto extends createZodDto(registerPushTokenSchema) {}
