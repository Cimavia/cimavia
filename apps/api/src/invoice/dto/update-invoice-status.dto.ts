import { updateInvoiceStatusSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateInvoiceStatusDto extends createZodDto(updateInvoiceStatusSchema) {}
