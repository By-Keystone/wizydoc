import type { User } from "@/domain/entities/user/entity";
import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";

export interface CreateUserData {
  email: string;
  name: string;
  lastName: string;
  phone: string;
}

export interface UpdateProfileData {
  name: string;
  lastName: string;
  phone: string;
  treatment?: DoctorTreatment | null;
}

export interface IUserRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  assignAccountIfNone(userId: string, accountId: string): Promise<boolean>;
  updateProfile(
    userId: string,
    accountId: string,
    data: UpdateProfileData,
  ): Promise<boolean>;
}
