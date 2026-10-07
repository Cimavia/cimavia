import { createOrganizationInvitationSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateOrganizationInvitationDto extends createZodDto(
  createOrganizationInvitationSchema,
) {}
