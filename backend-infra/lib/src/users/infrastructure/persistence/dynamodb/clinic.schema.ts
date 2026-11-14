import { z } from "zod";

type PK = `CLINIC#${string}`;
type SK = "!";

export const CLINIC_ITEM_TYPE = "CLINIC";

export const clinicItemSchema = z.object({ OrganizationId: z.ulid() });

export const clinicPk = (id: string): PK => `CLINIC#${id}`;
export const clinicSk = (): SK => "!";
