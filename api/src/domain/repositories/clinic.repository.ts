import type { Clinic } from "../entities/clinic/entity";

export interface CreateClinicData {
  name: string;
  address: string;
  phone: string;
  createdBy: string;
  accountId: string;
  organizationId: string;
}

export interface IClinicRepository {
  save(data: CreateClinicData): Promise<Clinic>;
  update(id: string, data: Partial<Clinic>): Promise<Clinic>;
  get(accountId: string): Promise<Clinic[]>;
}
