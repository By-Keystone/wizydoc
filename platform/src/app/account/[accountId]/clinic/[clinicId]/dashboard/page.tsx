import type { Metadata } from "next";
import { cache } from "react";
import { BookingLinkStatus } from "@/components/app/dashboard/clinic/booking-link-status";
import { BookingUsageCard } from "@/components/app/dashboard/clinic/booking-usage-card";
import { FirstSteps } from "@/components/app/dashboard/clinic/first-steps";
import { ClinicStats } from "@/components/app/dashboard/clinic/stats";
import { TodayAppointments } from "@/components/app/dashboard/clinic/today-appointments";
import { CopyButton } from "@/components/app/dashboard/copy-button";
import { StatisticsWrapper } from "@/components/app/dashboard/stats-wrapper";
import { availabilityApi } from "@/lib/api/availability";
import { clinicApi } from "@/lib/api/clinic";
import type { BookingUsage } from "@/lib/api/clinic/types";
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
  bookingUsage: Promise<BookingUsage | null>;
}

interface FirstStepsData {
  specialties: string[];
  hasSchedule: boolean;
  canEditSpecialties: boolean;
}

const loadMembership = cache(userMembershipsApi.getMembershipForResource);

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

async function loadBookingStatus(clinicId: string) {
  try {
    return await clinicApi.getBookingStatus(clinicId);
  } catch (error) {
    logBookingSetupFailure(clinicId, error);
    return null;
  }
}

async function loadBookingUsage(
  clinicId: string,
): Promise<BookingUsage | null> {
  try {
    const membership = await loadMembership(clinicId);
    if (membership.role !== MembershipRole.ADMIN) return null;
    return await clinicApi.getBookingUsage(clinicId);
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

function CopyLinkOnly({
  clinicId,
  usage,
}: {
  clinicId: string;
  usage: BookingUsage | null;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <div>
        <CopyButton clinicId={clinicId} />
      </div>
      {usage && (
        <BookingUsageCard
          usage={usage}
          clinicId={clinicId}
          isClinicBookable={false}
        />
      )}
    </div>
  );
}

async function BookingSetup({
  accountId,
  clinicId,
  bookingUsage,
}: BookingSetupProps) {
  const [membership, doctors, bookingStatus, usage] = await Promise.all([
    loadMembership(clinicId),
    loadDoctors(clinicId),
    loadBookingStatus(clinicId),
    bookingUsage,
  ]);
  if (!doctors) return <CopyLinkOnly clinicId={clinicId} usage={usage} />;

  const doctorProfileId =
    membership.resourceType === "CLINIC" ? membership.doctorProfileId : null;
  const isAttending = doctorProfileId !== null;
  const isListed = doctors.some(
    (doctor) => doctor.doctorProfileId === doctorProfileId,
  );
  const needsFirstSteps = isAttending && !isListed;
  const firstSteps = needsFirstSteps ? await loadFirstSteps(clinicId) : null;
  if (needsFirstSteps && !firstSteps) {
    return <CopyLinkOnly clinicId={clinicId} usage={usage} />;
  }

  const isClinicBookable = doctors.length > 0;
  const isAcceptingBookings = bookingStatus?.isAcceptingBookings ?? true;
  const isAdmin = membership.role === MembershipRole.ADMIN;

  return (
    <div className="mb-8 flex flex-col gap-4">
      {(isClinicBookable || !isAttending) && (
        <BookingLinkStatus
          accountId={accountId}
          clinicId={clinicId}
          clinicName={membership.resourceName}
          isBookable={isClinicBookable}
          isAcceptingBookings={isAcceptingBookings}
          canManageUsers={isAdmin}
          canChangePlan={isAdmin}
        />
      )}
      {firstSteps && (
        <FirstSteps
          accountId={accountId}
          clinicId={clinicId}
          clinicName={membership.resourceName}
          isClinicBookable={isClinicBookable}
          isAcceptingBookings={isAcceptingBookings}
          {...firstSteps}
        />
      )}
      {usage && (
        <BookingUsageCard
          usage={usage}
          clinicId={clinicId}
          isClinicBookable={isClinicBookable}
        />
      )}
    </div>
  );
}

export default async function ClinicDashboardPage({ params }: Props) {
  const { accountId, clinicId } = await params;
  const bookingUsage = loadBookingUsage(clinicId);

  return (
    <div>
      <StatisticsWrapper
        actions={
          <BookingSetup
            accountId={accountId}
            clinicId={clinicId}
            bookingUsage={bookingUsage}
          />
        }
      >
        <ClinicStats resourceId={clinicId} bookingUsage={bookingUsage} />
      </StatisticsWrapper>

      <TodayAppointments resourceId={clinicId} />
    </div>
  );
}
