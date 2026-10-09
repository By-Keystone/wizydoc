import { test, expect } from "../../support/test";
import { getTestPrisma } from "../../support/db";
import {
  appointmentRow,
  bookAppointment,
  createManageClient,
  fetchSlots,
  limaWall,
  newPatient,
  postBooking,
  rescheduleBody,
  seedBookableDoctor,
  updateAppointment,
} from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-26, CA-27, CA-28.

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"];

test("CA-26: dos reprogramaciones simultáneas dejan un 200, un 409 y el contador sube una sola vez", async () => {
  const seed = await seedBookableDoctor("ca26");
  const booked = await bookAppointment(seed, { time: "09:00" });
  const manage = await createManageClient();

  const responses = await Promise.all([
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:00" }),
    ),
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:30" }),
    ),
  ]);

  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const row = await appointmentRow(booked.appointmentId);
  expect(row.rescheduleCount).toBe(1);
  expect(["11:00", "11:30"]).toContain(limaWall(row.scheduledAt).time);
});

test("CA-26: con la cita en su segunda reprogramación, dos simultáneas no dejan pasar una cuarta", async () => {
  const seed = await seedBookableDoctor("ca26b");
  const booked = await bookAppointment(seed, { time: "09:00" });
  await updateAppointment(booked.appointmentId, { rescheduleCount: 2 });
  const manage = await createManageClient();

  const responses = await Promise.all([
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:00" }),
    ),
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:30" }),
    ),
  ]);

  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  expect((await appointmentRow(booked.appointmentId)).rescheduleCount).toBe(3);
});

test("CA-27: una reprogramación y una reserva nueva al mismo horario dejan una sola cita activa", async () => {
  const seed = await seedBookableDoctor("ca27");
  const booked = await bookAppointment(seed, { time: "09:00" });
  const manage = await createManageClient();
  const contestedTime = "11:00";
  const newcomer = newPatient();

  const [reschedule, booking] = await Promise.all([
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: contestedTime }),
    ),
    postBooking(seed, newcomer, { date: booked.date, time: contestedTime }),
  ]);

  const statuses = [reschedule.status(), booking.status()].sort();
  expect(statuses).toEqual([200, 409]);

  const prisma = await getTestPrisma();
  const active = await prisma.appointment.findMany({
    where: {
      doctorProfileId: seed.doctorProfileId,
      status: { in: ACTIVE_STATUSES },
    },
  });
  const atContestedTime = active.filter((appointment) => {
    const wall = limaWall(appointment.scheduledAt);
    return wall.date === booked.date && wall.time === contestedTime;
  });
  expect(atContestedTime).toHaveLength(1);

  const row = await appointmentRow(booked.appointmentId);
  if (reschedule.status() === 409) {
    expect(limaWall(row.scheduledAt).time).toBe("09:00");
    expect(row.rescheduleCount).toBe(0);
  } else {
    expect(limaWall(row.scheduledAt).time).toBe(contestedTime);
    expect(
      await prisma.appointment.count({
        where: { patient: { email: newcomer.email } },
      }),
    ).toBe(0);
  }
});

test("CA-28: cancelar y reprogramar a la vez dejan la cita cancelada y ningún horario ocupado", async () => {
  const seed = await seedBookableDoctor("ca28");
  const booked = await bookAppointment(seed, { time: "09:00" });
  const manage = await createManageClient();

  const [cancel] = await Promise.all([
    manage.cancel(booked.token),
    manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:00" }),
    ),
  ]);

  expect(cancel.status()).toBe(200);
  const row = await appointmentRow(booked.appointmentId);
  expect(row.status).toBe("CANCELLED");

  const slots = await fetchSlots(seed.doctorProfileId, booked.date);
  expect(slots).toContain("09:00");
  expect(slots).toContain("11:00");
});
