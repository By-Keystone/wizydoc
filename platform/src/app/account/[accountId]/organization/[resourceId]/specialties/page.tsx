import type { Metadata } from "next";
import { SpecialtiesTable } from "@/components/specialty/specialties-table";
import { TopHeader } from "@/components/specialty/top-header";
import { specialtyApi } from "@/lib/api/specialty";

export const metadata: Metadata = { title: "Especialidades" };

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function SpecialtiesPage({ params }: Props) {
  const { resourceId } = await params;

  const specialties = await specialtyApi.getOrganizationSpecialties(resourceId);

  return (
    <div>
      <TopHeader />
      <SpecialtiesTable specialties={specialties} />
    </div>
  );
}
