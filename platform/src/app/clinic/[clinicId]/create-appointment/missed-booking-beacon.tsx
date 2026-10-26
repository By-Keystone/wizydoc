"use client";

import { useEffect } from "react";
import { recordMissedBookingAction } from "@/lib/actions/clinic/record-missed-booking.action";
import {
  hasMissedBookingMark,
  setMissedBookingMark,
} from "@/lib/missed-booking-mark";

interface Props {
  clinicId: string;
}

export function MissedBookingBeacon({ clinicId }: Props) {
  useEffect(() => {
    if (hasMissedBookingMark(clinicId)) return;
    setMissedBookingMark(clinicId);
    recordMissedBookingAction(clinicId).catch(() => undefined);
  }, [clinicId]);

  return null;
}
