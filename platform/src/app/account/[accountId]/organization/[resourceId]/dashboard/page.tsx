import { MembershipRole } from "@/lib/utils";
import { StatisticsWrapper } from "@/components/app/dashboard/stats-wrapper";
import { OrganizationStats } from "@/components/app/dashboard/organization/stats";
import { userMembershipsApi } from "@/lib/api/memberships";

interface PageProps {
  params: Promise<{ resourceId: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { resourceId } = await params;
  const membership =
    await userMembershipsApi.getMembershipForResource(resourceId);

  return (
    <div>
      <StatisticsWrapper>
        {membership.role === MembershipRole.ADMIN && (
          <OrganizationStats resourceId={membership.resourceId} />
        )}
      </StatisticsWrapper>
      {/* <UpcomingAppointments appointments={upcoming} isAdmin={isAdmin} /> */}
    </div>
  );
}
