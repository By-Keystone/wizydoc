"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDoctorSlotsAction } from "@/lib/actions/doctor-profile/get-slots.action";
import { DoctorSlots } from "@/lib/api/doctor-profile/types";
import {
  addDays,
  dayLabel,
  dayNumber,
  formatWeekRange,
  getWeekDays,
  startOfWeek,
  todayKey,
} from "../lib/week";

interface Props {
  doctorProfileId: string;
  onNext: (selection: {
    date: string;
    time: string;
    durationMinutes: number;
  }) => void;
  onBack: () => void;
}

export function DateTimeStep({ doctorProfileId, onNext, onBack }: Props) {
  const [slots, setSlots] = useState<DoctorSlots | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const today = useMemo(() => todayKey(), []);

  const weekDays = useMemo(
    () => getWeekDays(addDays(startOfWeek(today), weekOffset * 7)),
    [today, weekOffset],
  );

  const from = weekDays[0];
  const to = weekDays[6];

  // Al cambiar de doctor volvemos a la semana actual.
  useEffect(() => {
    setWeekOffset(0);
  }, [doctorProfileId]);

  // Una petición por semana visible: los huecos ya reservados no llegan a
  // mostrarse. `cancelled` descarta respuestas de una semana que el paciente
  // ya abandonó.
  useEffect(() => {
    let cancelled = false;

    setSlots(null);
    setError(null);
    setSelectedDate(null);
    setTime(null);

    getDoctorSlotsAction(doctorProfileId, from, to)
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los horarios.");
      });

    return () => {
      cancelled = true;
    };
  }, [doctorProfileId, from, to]);

  const daySlots = selectedDate ? slots?.days[selectedDate] ?? [] : [];

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-teal-dark">
        Elige fecha y horario
      </h2>
      <p className="mt-1 text-sm text-brand-gray">
        Selecciona el día y un horario disponible.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!error && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              disabled={weekOffset === 0}
              className="rounded-lg p-1.5 text-brand-gray transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-brand-gray">
              {formatWeekRange(weekDays[0], weekDays[6])}
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-lg p-1.5 text-brand-gray transition-colors hover:bg-gray-100"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {weekDays.map((date, index) => {
              const available = slots?.days[date] ?? [];
              const disabled = !slots || available.length === 0;

              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setSelectedDate(date);
                    setTime(null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition-colors",
                    disabled &&
                      "cursor-not-allowed border-gray-100 text-gray-300",
                    !disabled &&
                      selectedDate === date &&
                      "border-brand-teal bg-brand-teal/10 text-brand-teal",
                    !disabled &&
                      selectedDate !== date &&
                      "border-gray-200 text-brand-gray hover:bg-gray-50",
                  )}
                >
                  <span>{dayLabel(index)}</span>
                  <span className="text-sm">{dayNumber(date)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <span className="text-sm font-medium text-brand-gray">Horarios</span>

            {!slots ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-brand-gray">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando horarios...
              </div>
            ) : !selectedDate ? (
              <p className="mt-2 text-sm text-brand-gray">
                Elige un día para ver los horarios disponibles.
              </p>
            ) : daySlots.length === 0 ? (
              <p className="mt-2 text-sm text-brand-gray">
                El doctor no tiene horarios disponibles ese día.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {daySlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                      time === slot
                        ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                        : "border-gray-200 text-brand-gray hover:bg-gray-50",
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-8 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onBack}
        >
          Atrás
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!selectedDate || !time || !slots}
          onClick={() =>
            selectedDate &&
            time &&
            slots &&
            onNext({
              date: selectedDate,
              time,
              durationMinutes: slots.durationMinutes,
            })
          }
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
