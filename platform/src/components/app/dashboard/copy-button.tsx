"use client";

import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app/app.context";
import { generateClinicInvitationUrl } from "@/lib/helpers";
import { toast } from "@/lib/toast";

export const CopyButton = () => {
    const { membership } = useApp();


    const handleCopy = async () => {
        const invitationUrl = generateClinicInvitationUrl(location.origin, membership.resourceId)
        await navigator.clipboard.writeText(invitationUrl);
        toast.success("Link copiado!")
    }

    return <Button onClick={handleCopy} size={'sm'} variant={'coral'} className="mb-8">Copiar link de invitación</Button>
}