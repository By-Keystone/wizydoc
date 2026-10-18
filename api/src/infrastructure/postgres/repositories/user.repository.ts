import type { User } from "@/domain/entities/user/entity";
import type {
  CreateUserData,
  IUserRepository,
  UpdateProfileData,
} from "@/domain/repositories/user.repository";
import { getClient } from "../transaction-context.js";
import { toDomain } from "../../mappers/user/mapper.js";

export class PrismaUserRepository implements IUserRepository {
  async create(data: CreateUserData): Promise<User> {
    const user = await getClient().user.create({ data });
    return toDomain(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await getClient().user.findUnique({ where: { id } });
    return user ? toDomain(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await getClient().user.findUnique({ where: { email } });
    return user ? toDomain(user) : null;
  }

  async assignAccountIfNone(
    userId: string,
    accountId: string,
  ): Promise<boolean> {
    const { count } = await getClient().user.updateMany({
      where: { id: userId, accountId: null },
      data: { accountId, onboardingCompleted: true },
    });
    return count === 1;
  }

  async updateProfile(
    userId: string,
    accountId: string,
    data: UpdateProfileData,
  ): Promise<boolean> {
    const { count } = await getClient().user.updateMany({
      where: { id: userId, accountId },
      data: {
        name: data.name,
        lastName: data.lastName,
        phone: data.phone,
        ...(data.treatment !== undefined && { treatment: data.treatment }),
      },
    });
    return count === 1;
  }
}
