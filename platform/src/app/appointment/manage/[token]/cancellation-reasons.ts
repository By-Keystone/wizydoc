import type { CancellationReason } from "@/lib/api/appointments/types";

export const CANCELLATION_REASONS: {
  code: CancellationReason;
  label: string;
}[] = [
  { code: "UNEXPECTED_EVENT", label: "Me surgió un imprevisto" },
  { code: "CANNOT_MAKE_IT", label: "No puedo llegar a esa hora" },
  { code: "NO_LONGER_NEEDED", label: "Ya no necesito la cita" },
  { code: "SEEN_ELSEWHERE", label: "Me atenderé en otro lugar" },
  { code: "BOOKED_BY_MISTAKE", label: "Reservé por error" },
];
