import type { IClinicRepository } from "@/domain/repositories/clinic.repository";

export class GetClinicsUseCase {
  constructor(private readonly clinicRepository: IClinicRepository) {}

  async execute(accountId: string) {
    return await this.clinicRepository.get(accountId);
  }
}
