import z from "zod";

export const clinicWallTimeSchema = z.iso
  .datetime({
    local: true,
    precision: -1,
    error: "La fecha y hora deben existir",
  })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    error: "La fecha y hora deben tener formato YYYY-MM-DDTHH:mm",
  });
