import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import type {
  IGetMyProfileQuery,
  MyProfile,
} from "@/application/queries/user/get-my-profile.query";
import { DoctorTreatment } from "@/domain/enums/doctor-treatment";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import z from "zod";

export const updateMyProfileSchema = z.strictObject({
  name: z.string().trim().min(1, { error: "Ingresa tu nombre" }),
  lastName: z.string().trim().min(1, { error: "Ingresa tu apellido" }),
  phone: z.string().trim().min(1, { error: "Ingresa tu celular" }),
  // Ausente = no cambia; null = sin tratamiento.
  treatment: z.enum(DoctorTreatment).nullable().optional(),
});

export type UpdateMyProfileDto = z.infer<typeof updateMyProfileSchema> & {
  userId: string;
  accountId: string;
};

export class UpdateMyProfileUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly getMyProfile: IGetMyProfileQuery,
  ) {}

  async execute({
    userId,
    accountId,
    ...data
  }: UpdateMyProfileDto): Promise<MyProfile> {
    // Sin transacción a propósito: si quitan al médico de su sede entre esta
    // comprobación y el guardado, solo queda un tratamiento que no se muestra
    // en ningún lado (el nombre del médico solo se arma donde atiende).
    await this.assertCanSetTreatment(userId, accountId, data.treatment);

    const updated = await this.users.updateProfile(userId, accountId, data);
    if (!updated) throw new NotFound("User not found");

    const profile = await this.getMyProfile.execute(userId, accountId);
    if (!profile) throw new NotFound("User not found");
    return profile;
  }

  private async assertCanSetTreatment(
    userId: string,
    accountId: string,
    treatment: DoctorTreatment | null | undefined,
  ) {
    // Quitarlo se permite siempre: quien dejó de atender debe poder limpiarlo.
    if (!treatment) return;

    if (!(await this.getMyProfile.canSetTreatment(userId, accountId))) {
      throw new Forbidden(
        "Solo quien atiende como médico puede tener tratamiento.",
      );
    }
  }
}
