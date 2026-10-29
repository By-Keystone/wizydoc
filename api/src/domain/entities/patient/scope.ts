export interface PatientScope {
  resourceType: "CLINIC" | "ORGANIZATION";
  resourceId: string;
  organizationId: string;
}
