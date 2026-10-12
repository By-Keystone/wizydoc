import { test, expect } from "../../support/test";
import {
  appointmentRow,
  bookAppointment,
  countChangeNotices,
  createManageClient,
  emailsWithSubject,
  rescheduleBody,
  seedBookableDoctor,
} from "../../support/self-service";

const MAX_DOCTOR_NOTICES_PER_HOUR = 10;
const RESCHEDULE_TIMES_BY_BOOKING = [
  ["09:00", ["11:00", "11:30", "12:00"]],
  ["10:00", ["13:00", "13:30", "14:00"]],
  ["10:30", ["15:00", "15:30", "16:00"]],
] as const;

test("los avisos al médico se limitan por hora y el exceso no afecta a la cita ni al paciente", async () => {
  const seed = await seedBookableDoctor("doctor-notice-limit");
  const manage = await createManageClient();
  const bookings = [];

  for (const [bookedTime, rescheduleTimes] of RESCHEDULE_TIMES_BY_BOOKING) {
    const booked = await bookAppointment(seed, { time: bookedTime });
    bookings.push(booked);
    for (const time of rescheduleTimes) {
      const response = await manage.reschedule(
        booked.token,
        rescheduleBody({ date: booked.date, time }),
      );
      expect(response.status()).toBe(200);
    }
    expect((await manage.cancel(booked.token)).status()).toBe(200);
  }

  expect(countChangeNotices(seed.doctor.email)).toBe(
    MAX_DOCTOR_NOTICES_PER_HOUR,
  );

  const [, , lastBooking] = bookings;
  const row = await appointmentRow(lastBooking.appointmentId);
  expect(row.status).toBe("CANCELLED");
  expect(row.rescheduleCount).toBe(RESCHEDULE_TIMES_BY_BOOKING[2][1].length);
  expect(
    emailsWithSubject(lastBooking.patient.email, /cambió de horario/),
  ).toHaveLength(3);
  expect(
    emailsWithSubject(lastBooking.patient.email, /fue cancelada/),
  ).toHaveLength(1);
});
