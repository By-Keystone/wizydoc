import type { Metadata } from "next";
import { ClinicsTable } from "@/components/clinic/clinics-table";
import { TopHeader } from "@/components/clinic/top-header";
import { clinicApi } from "@/lib/api/clinic";

export const metadata: Metadata = { title: "Sedes" };

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function ClinicsPage({ params }: Props) {
  const { accountId, resourceId } = await params;

  const clinics = await clinicApi.getOrganizationClinics(resourceId);

  return (
    <div>
      <TopHeader />
      <ClinicsTable
        clinics={clinics}
        accountId={accountId}
        organizationId={resourceId}
      />
    </div>
  );
}
