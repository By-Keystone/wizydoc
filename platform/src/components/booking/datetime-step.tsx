"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DoctorSlots } from "@/lib/api/doctor-profile/types";
import {
  focusRingClassName,
  optionClassName,
  unavailableOptionClassName,
} from "./option-styles";
import {
  addDays,
  dayLabel,
  dayNumber,
  formatWeekRange,
  getWeekDays,
  startOfWeek,
  todayKey,
} from "./week";

// El api rechaza fechas a más de 366 días de hoy; la semana 52 puede pasarse.
const MAX_WEEK_OFFSET = 51;

const weekArrowClassName = cn(
  "flex h-10 w-10 items-center justify-center rounded-lg text-brand-gray transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30",
  focusRingClassName,
);

interface Props {
  slotsSourceId: string;
  loadSlots: (
    slotsSourceId: string,
    from: string,
    to: string,
  ) => Promise<DoctorSlots>;
  onNext: (selection: {
    date: string;
    time: string;
    durationMinutes: number;
  }) => void;
  onBack?: () => void;
  description?: string;
  emptyDayMessage?: string;
  intro?: ReactNode;
  hint?: ReactNode;
}

export function DateTimeStep({
  slotsSourceId,
  loadSlots,
  onNext,
  onBack,
  description = "Selecciona el día y un horario disponible.",
  emptyDayMessage = "El médico no tiene horarios disponibles ese día.",
  intro,
  hint,
}: Props) {
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

  // Al cambiar de fuente de horarios volvemos a la semana actual.
  useEffect(() => {
    setWeekOffset(0);
  }, [slotsSourceId]);

  // Una petición por semana visible: los huecos ya reservados no llegan a
  // mostrarse. `cancelled` descarta respuestas de una semana que el paciente
  // ya abandonó.
  useEffect(() => {
    let cancelled = false;

    setSlots(null);
    setError(null);
    setSelectedDate(null);
    setTime(null);

    loadSlots(slotsSourceId, from, to)
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los horarios.");
      });

    return () => {
      cancelled = true;
    };
  }, [slotsSourceId, loadSlots, from, to]);

  const daySlots = selectedDate ? (slots?.days[selectedDate] ?? []) : [];

  return (
    <div>
      <h2
        tabIndex={-1}
        className="text-lg font-semibold text-brand-teal-dark outline-none"
      >
        Elige fecha y horario
      </h2>
      <p className="mt-1 text-sm text-brand-gray">{description}</p>

      {intro}

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!error && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              disabled={weekOffset === 0}
              className={weekArrowClassName}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-brand-gray">
              {formatWeekRange(weekDays[0], weekDays[6])}
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset >= MAX_WEEK_OFFSET}
              className={weekArrowClassName}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {weekDays.map((date, index) => {
              const available = slots?.days[date] ?? [];
              const disabled = !slots || available.length === 0;
              const isChosen = !disabled && selectedDate === date;

              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isChosen}
                  onClick={() => {
                    setSelectedDate(date);
                    setTime(null);
                  }}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-2 text-xs font-medium transition-colors",
                    disabled
                      ? unavailableOptionClassName
                      : optionClassName(isChosen),
                  )}
                >
                  <span>{dayLabel(index)}</span>
                  <span className="text-base font-semibold leading-none">
                    {dayNumber(date)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <span className="text-sm font-medium text-brand-gray">
              Horarios
            </span>

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
              <p className="mt-2 text-sm text-brand-gray">{emptyDayMessage}</p>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {daySlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={time === slot}
                    onClick={() => setTime(slot)}
                    className={cn(
                      "rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors",
                      optionClassName(time === slot),
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

      {hint}

      <div className="mt-8 flex gap-3">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onBack}
          >
            Atrás
          </Button>
        )}
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
