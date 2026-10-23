import Link from "next/link";
import type {
  MyProfileClinic,
  MyProfileEditableClinic,
  MyProfileOrganization,
} from "@/lib/api/user/types";
import { ClinicAvailabilityLink } from "./clinic-availability-link";
import { EditableClinics } from "./editable-clinics";
import { ProfileCard } from "./profile-card";

interface Props {
  clinics: MyProfileClinic[];
  editableClinics: MyProfileEditableClinic[];
  organizations: MyProfileOrganization[];
  accountId: string;
}

export function WhereYouWorkCard({
  clinics,
  editableClinics,
  organizations,
  accountId,
}: Props) {
  const editableIds = new Set(editableClinics.map((clinic) => clinic.clinicId));
  const readOnlyClinics = clinics.filter(
    (clinic) => !editableIds.has(clinic.clinicId),
  );
  const canEdit = editableClinics.length > 0;

  if (!canEdit && readOnlyClinics.length === 0) {
    const organization = organizations.find(
      (item) => item.canCreateSpecialties,
    );
    if (!organization) return null;

    return (
      <ProfileCard
        titleId="where-you-work-title"
        title="Dónde atiendes"
        description="Tus especialidades en cada sede."
      >
        <p className="text-[13px] leading-snug text-brand-gray">
          Todavía no atiendes en ninguna sede. Para recibir citas, asígnate como
          médico desde Usuarios.
        </p>
        <Link
          href={`/account/${accountId}/organization/${organization.organizationId}/users`}
          className="mt-2 inline-block text-[13px] font-medium text-brand-teal hover:text-brand-teal-dark"
        >
          Ir a Usuarios
        </Link>
      </ProfileCard>
    );
  }

  return (
    <ProfileCard
      titleId="where-you-work-title"
      title="Dónde atiendes"
      description={
        canEdit
          ? "Elige las especialidades que atiendes en cada sede."
          : "Tus especialidades en cada sede. Tus horarios se configuran dentro de cada sede."
      }
    >
      <div className="flex flex-col gap-2.5">
        {canEdit && (
          <EditableClinics
            clinics={editableClinics}
            organizations={organizations}
            accountId={accountId}
          />
        )}
        {readOnlyClinics.map((clinic) => (
          <div
            key={clinic.clinicId}
            className="min-w-0 rounded-[10px] border border-gray-200 p-3.5"
          >
            <b className="block break-words text-[14.5px]">
              {clinic.clinicName}
            </b>
            <span className="block break-words text-[12.5px] text-brand-gray">
              {clinic.organizationName}
            </span>

            {clinic.specialties.length > 0 ? (
              <>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {clinic.specialties.map((specialty) => (
                    <li
                      key={specialty.id}
                      className="rounded-full border border-[#cfe5e2] bg-brand-surface px-3 py-1 text-[13px] text-brand-teal-dark"
                    >
                      {specialty.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] leading-snug text-brand-gray">
                  Te las asigna un administrador.
                </p>
              </>
            ) : (
              <p className="mt-2 text-[13px] leading-snug text-brand-gray">
                Aún no tienes una especialidad asignada. Un administrador de{" "}
                {clinic.clinicName} tiene que asignártela.
              </p>
            )}

            <div className="mt-3">
              <ClinicAvailabilityLink
                accountId={accountId}
                clinicId={clinic.clinicId}
              />
            </div>
          </div>
        ))}
      </div>
    </ProfileCard>
  );
}
