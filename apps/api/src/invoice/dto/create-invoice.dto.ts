import { createInvoiceSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
