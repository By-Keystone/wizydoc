import { Forbidden } from "@/application/errors/forbidden.error";
import { IOrganizationRepository } from "@/domain/repositories/organization.repository";
import { IUserRepository } from "@/domain/repositories/user.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

export const createOrganizationSchema = z.object({
  name: z.string("Name is required"),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema> & {
  userId: string;
  accountId: string;
};

export class CreateOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  // Sólo el dueño sin organizaciones o un ADMIN vivo de una ya existente puede crear otra.
  private async assertCanCreateOrganization(userId: string, accountId: string) {
    const account = await getClient().account.findUnique({
      where: { id: accountId },
      select: { ownerId: true, _count: { select: { organizations: true } } },
    });

    const isOwnerCreatingFirstOrganization =
      account?.ownerId === userId && account._count.organizations === 0;
    if (isOwnerCreatingFirstOrganization) return;

    const adminMembership = await getClient().userResourceMembership.findFirst({
      where: {
        userId,
        accountId,
        deletedAt: null,
        role: "ADMIN",
        resource: { type: "ORGANIZATION", accountId },
      },
      select: { id: true },
    });

    if (!adminMembership)
      throw new Forbidden("Sólo un administrador puede crear organizaciones");
  }

  async execute(data: CreateOrganizationDto, isOnboarding: boolean = false) {
    await this.assertCanCreateOrganization(data.userId, data.accountId);

    const organization = await this.organizationRepository.save(data);

    if (organization && isOnboarding) {
      await this.userRepository.update(data.userId, {
        onboardingCompleted: true,
      });
    }
  }
}
