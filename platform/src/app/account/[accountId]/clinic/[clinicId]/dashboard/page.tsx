import type { Metadata } from "next";
import { BookingLinkStatus } from "@/components/app/dashboard/clinic/booking-link-status";
import { FirstSteps } from "@/components/app/dashboard/clinic/first-steps";
import { ClinicStats } from "@/components/app/dashboard/clinic/stats";
import { TodayAppointments } from "@/components/app/dashboard/clinic/today-appointments";
import { CopyButton } from "@/components/app/dashboard/copy-button";
import { StatisticsWrapper } from "@/components/app/dashboard/stats-wrapper";
import { availabilityApi } from "@/lib/api/availability";
import { doctorsApi } from "@/lib/api/doctors";
import { ApiError } from "@/lib/api/errors";
import { userMembershipsApi } from "@/lib/api/memberships";
import { usersApi } from "@/lib/api/user";
import { MembershipRole } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

interface Props {
  params: Promise<{ accountId: string; clinicId: string }>;
}

interface BookingSetupProps {
  accountId: string;
  clinicId: string;
}

interface FirstStepsData {
  specialties: string[];
  hasSchedule: boolean;
  canEditSpecialties: boolean;
}

function logBookingSetupFailure(clinicId: string, error: unknown) {
  console.error("[clinic-dashboard] booking setup unavailable", {
    clinicId,
    errName: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof ApiError ? error.status : undefined,
  });
}

async function loadDoctors(clinicId: string) {
  try {
    return await doctorsApi.getDoctorsByResourceId(clinicId);
  } catch (error) {
    logBookingSetupFailure(clinicId, error);
    return null;
  }
}

async function loadFirstSteps(
  clinicId: string,
): Promise<FirstStepsData | null> {
  try {
    const [profile, availability] = await Promise.all([
      usersApi.getMyProfile(),
      availabilityApi.getMyAvailability(clinicId),
    ]);
    const clinic = profile.clinics.find(
      (profileClinic) => profileClinic.clinicId === clinicId,
    );

    return {
      specialties: clinic?.specialties.map((specialty) => specialty.name) ?? [],
      hasSchedule: availability.length > 0,
      canEditSpecialties: profile.editableClinics.some(
        (editableClinic) => editableClinic.clinicId === clinicId,
      ),
    };
  } catch (error) {
    logBookingSetupFailure(clinicId, error);
    return null;
  }
}

function CopyLinkOnly({ clinicId }: { clinicId: string }) {
  return (
    <div className="mb-8">
      <CopyButton clinicId={clinicId} />
    </div>
  );
}

async function BookingSetup({ accountId, clinicId }: BookingSetupProps) {
  const [membership, doctors] = await Promise.all([
    userMembershipsApi.getMembershipForResource(clinicId),
    loadDoctors(clinicId),
  ]);
  if (!doctors) return <CopyLinkOnly clinicId={clinicId} />;

  const doctorProfileId =
    membership.resourceType === "CLINIC" ? membership.doctorProfileId : null;
  const isAttending = doctorProfileId !== null;
  const isListed = doctors.some(
    (doctor) => doctor.doctorProfileId === doctorProfileId,
  );
  const needsFirstSteps = isAttending && !isListed;
  const firstSteps = needsFirstSteps ? await loadFirstSteps(clinicId) : null;
  if (needsFirstSteps && !firstSteps) {
    return <CopyLinkOnly clinicId={clinicId} />;
  }

  const isClinicBookable = doctors.length > 0;

  return (
    <div className="mb-8 flex flex-col gap-4">
      {(isClinicBookable || !isAttending) && (
        <BookingLinkStatus
          accountId={accountId}
          clinicId={clinicId}
          clinicName={membership.resourceName}
          isBookable={isClinicBookable}
          canManageUsers={membership.role === MembershipRole.ADMIN}
        />
      )}
      {firstSteps && (
        <FirstSteps
          accountId={accountId}
          clinicId={clinicId}
          clinicName={membership.resourceName}
          isClinicBookable={isClinicBookable}
          {...firstSteps}
        />
      )}
    </div>
  );
}

export default async function ClinicDashboardPage({ params }: Props) {
  const { accountId, clinicId } = await params;

  return (
    <div>
      <StatisticsWrapper
        actions={<BookingSetup accountId={accountId} clinicId={clinicId} />}
      >
        <ClinicStats resourceId={clinicId} />
      </StatisticsWrapper>

      <TodayAppointments resourceId={clinicId} />
    </div>
  );
}
