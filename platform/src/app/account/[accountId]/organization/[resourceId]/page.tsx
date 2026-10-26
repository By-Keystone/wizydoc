import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function OrganizationIndexPage({ params }: Props) {
  const { accountId, resourceId } = await params;

  redirect(`/account/${accountId}/organization/${resourceId}/dashboard`);
}
