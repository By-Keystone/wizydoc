import type { User } from "@/domain/entities/user/entity";

export interface CreateUserData {
  email: string;
  name: string;
  lastName: string;
  phone: string;
}

export interface IUserRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User>;
  assignAccountIfNone(userId: string, accountId: string): Promise<boolean>;
}
