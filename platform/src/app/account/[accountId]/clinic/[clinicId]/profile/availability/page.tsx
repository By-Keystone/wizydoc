import type { Metadata } from "next";
import { availabilityApi } from "@/lib/api/availability";
import { AvailabilityEditor } from "@/components/clinic/availability/availability-editor";

export const metadata: Metadata = { title: "Mi disponibilidad" };

interface Props {
  params: Promise<{ clinicId: string }>;
}

export default async function AvailabilityPage({ params }: Props) {
  const { clinicId } = await params;

  const blocks = await availabilityApi.getMyAvailability(clinicId);

  return <AvailabilityEditor initial={blocks} />;
}
