import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ accountId: string; clinicId: string }>;
}

export default async function ClinicProfilePage({ params }: Props) {
  const { accountId, clinicId } = await params;

  redirect(`/account/${accountId}/clinic/${clinicId}/me`);
}
