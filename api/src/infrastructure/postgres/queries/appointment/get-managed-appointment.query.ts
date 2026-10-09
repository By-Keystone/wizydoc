import type { IGetManagedAppointmentQuery } from "@/application/queries/appointment/get-managed-appointment.query";
import {
  type ManagedAppointment,
  toManagedAppointment,
} from "@/domain/entities/appointment/self-service";
import type { IManagedAppointmentRepository } from "@/domain/repositories/managed-appointment.repository";
import { ManagedAppointmentRepository } from "../../repositories/managed-appointment.repository";

export class GetManagedAppointmentQuery implements IGetManagedAppointmentQuery {
  constructor(
    private readonly appointments: IManagedAppointmentRepository = new ManagedAppointmentRepository(),
  ) {}

  async execute(token: string): Promise<ManagedAppointment | null> {
    const appointment = await this.appointments.findByToken(token);
    return appointment ? toManagedAppointment(appointment, new Date()) : null;
  }
}
