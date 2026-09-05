import { declineInvitationSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class DeclineInvitationDto extends createZodDto(declineInvitationSchema) {}
