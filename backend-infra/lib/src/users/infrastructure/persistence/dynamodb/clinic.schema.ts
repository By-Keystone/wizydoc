import { z } from "zod";

export const CLINIC_ITEM_TYPE = "CLINIC";

export const clinicItemSchema = z.object({ OrganizationId: z.ulid() });

export const clinicPk = (id: string) => `CLINIC#${id}`;
export const clinicSk = () => "!";
