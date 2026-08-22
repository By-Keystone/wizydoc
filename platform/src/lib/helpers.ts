export const generateClinicInvitationUrl = (origin: string, clinicId: string) => {
    return `${origin}/clinic/${clinicId}/create-appointment`
}