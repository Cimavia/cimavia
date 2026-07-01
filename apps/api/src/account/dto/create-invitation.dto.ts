import { createInvitationSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateInvitationDto extends createZodDto(createInvitationSchema) {}
