import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { isPlanFeatureError } from "@/lib/api/errors";
import { userMembershipsApi } from "@/lib/api/memberships";
import { patientsApi } from "@/lib/api/patients";
import type { PatientsPage } from "@/lib/api/patients/types";
import { PatientsBrowser } from "./patients-browser";

interface Props {
  resourceId: string;
  patientsPath: string;
  scopeDescription: string;
}

async function loadFirstPage(resourceId: string): Promise<PatientsPage | null> {
  try {
    return await patientsApi.getPatients({ resourceId });
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export async function PatientsView({
  resourceId,
  patientsPath,
  scopeDescription,
}: Props) {
  const [firstPage, membership] = await Promise.all([
    loadFirstPage(resourceId),
    userMembershipsApi.getMembershipForResource(resourceId),
  ]);

  if (!firstPage) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-brand-teal-dark">
          Pacientes
        </h1>
        <PlanFeatureNotice plan="CONSULTORIO" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-teal-dark">Pacientes</h1>
        <p className="mt-1 text-sm text-brand-gray">
          {scopeDescription} Los nuevos aparecen primero.
        </p>
      </div>
      <PatientsBrowser
        resourceId={resourceId}
        patientsPath={patientsPath}
        resourceType={membership.resourceType}
        resourceName={membership.resourceName}
        initialPage={firstPage}
      />
    </div>
  );
}
