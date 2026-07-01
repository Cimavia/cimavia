import { acceptInvitationSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}
