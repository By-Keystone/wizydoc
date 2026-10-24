"use client";

import { CircleCheck, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import logo from "@/images/logo.png";
import { cn } from "@/lib/utils";
import styles from "./availability-demo.module.css";

const DAYS = [
  { label: "Lunes", value: 1 },
  { label: "Martes", value: 2 },
  { label: "Miércoles", value: 3 },
  { label: "Jueves", value: 4 },
  { label: "Viernes", value: 5 },
  { label: "Sábado", value: 6 },
  { label: "Domingo", value: 0 },
];

const NEW_RANGE_START = "09:00";
const NEW_RANGE_END = "17:00";

const DEMO_STEPS: { day: number; start?: string; end: string }[] = [
  { day: 1, end: "13:00" },
  { day: 1, start: "15:00", end: "19:00" },
  { day: 3, end: "13:00" },
  { day: 5, end: "13:00" },
];

const PAUSE_MS = {
  beforeStart: 1000,
  fingerTravel: 600,
  press: 220,
  afterAddingRange: 450,
  beforeTyping: 350,
  afterTyping: 450,
  betweenSteps: 200,
  scrollToSave: 950,
  saving: 900,
  toastVisible: 2800,
  toastExit: 400,
  rangesExit: 300,
};

const SPACE_BELOW_SAVE_BUTTON = 120;

interface TimeRange {
  id: string;
  start: string;
  end: string;
}

type WeekSchedule = Record<number, TimeRange[]>;

interface Point {
  x: number;
  y: number;
}

class DemoStopped extends Error {}

const rangeId = (day: number, index: number) => `${day}-${index}`;
const addRangeTarget = (day: number) => `add-${day}`;
const timeTarget = (id: string, field: "start" | "end") => `${id}-${field}`;
const SAVE_TARGET = "save";

function rangeIndexOfStep(stepIndex: number) {
  const { day } = DEMO_STEPS[stepIndex];
  return DEMO_STEPS.slice(0, stepIndex).filter((step) => step.day === day)
    .length;
}

function finishedSchedule(): WeekSchedule {
  const schedule: WeekSchedule = {};
  for (const [stepIndex, step] of DEMO_STEPS.entries()) {
    schedule[step.day] ??= [];
    schedule[step.day].push({
      id: rangeId(step.day, rangeIndexOfStep(stepIndex)),
      start: step.start ?? NEW_RANGE_START,
      end: step.end,
    });
  }
  return schedule;
}

export function AvailabilityDemo() {
  const screenRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLSpanElement>(null);
  const [schedule, setSchedule] = useState<WeekSchedule>({});
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [areRangesLeaving, setAreRangesLeaving] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [finger, setFinger] = useState({
    point: { x: 0, y: 0 },
    isVisible: false,
  });
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSchedule(finishedSchedule());
      setIsToastVisible(true);
      return;
    }

    let isStopped = false;

    const pause = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(
          () => (isStopped ? reject(new DemoStopped()) : resolve()),
          ms,
        );
      });

    // El teléfono se dibuja a escala con transform, así que la posición en
    // pantalla se divide por esa escala para ubicar el dedo dentro del marco.
    function pointOnScreen(target: string): Point | null {
      const screen = screenRef.current;
      const element = screen?.querySelector(`[data-demo-target="${target}"]`);
      if (!screen || !element) return null;
      const origin = screen.getBoundingClientRect();
      const scale = origin.width / screen.offsetWidth;
      const box = element.getBoundingClientRect();
      return {
        x: (box.left + box.width / 2 - origin.left) / scale,
        y: (box.top + box.height / 2 - origin.top) / scale,
      };
    }

    async function tap(target: string) {
      const point = pointOnScreen(target);
      if (point) setFinger({ point, isVisible: true });
      await pause(PAUSE_MS.fingerTravel);
      setTapCount((count) => count + 1);
      await pause(PAUSE_MS.press);
    }

    const hideFinger = () =>
      setFinger((current) => ({ ...current, isVisible: false }));

    function offsetToShowSaveButton() {
      const viewport = viewportRef.current;
      const save = saveRef.current;
      if (!viewport || !save) return 0;
      const saveButtonBottom =
        save.offsetTop + save.offsetHeight + SPACE_BELOW_SAVE_BUTTON;
      return Math.max(0, saveButtonBottom - viewport.offsetHeight);
    }

    async function addRange(stepIndex: number) {
      const step = DEMO_STEPS[stepIndex];
      const id = rangeId(step.day, rangeIndexOfStep(stepIndex));

      await tap(addRangeTarget(step.day));
      setSchedule((current) => ({
        ...current,
        [step.day]: [
          ...(current[step.day] ?? []),
          { id, start: NEW_RANGE_START, end: NEW_RANGE_END },
        ],
      }));
      await pause(PAUSE_MS.afterAddingRange);

      for (const field of ["start", "end"] as const) {
        const typedTime = step[field];
        if (!typedTime) continue;
        const target = timeTarget(id, field);
        await tap(target);
        setFocusedTarget(target);
        await pause(PAUSE_MS.beforeTyping);
        setSchedule((current) => ({
          ...current,
          [step.day]: current[step.day].map((range) =>
            range.id === id ? { ...range, [field]: typedTime } : range,
          ),
        }));
        await pause(PAUSE_MS.afterTyping);
        setFocusedTarget(null);
      }
    }

    async function playOnce() {
      setSchedule({});
      setPageOffset(0);
      setIsToastVisible(false);
      setAreRangesLeaving(false);
      hideFinger();
      await pause(PAUSE_MS.beforeStart);

      for (const stepIndex of DEMO_STEPS.keys()) {
        await addRange(stepIndex);
        await pause(PAUSE_MS.betweenSteps);
      }

      hideFinger();
      setPageOffset(offsetToShowSaveButton());
      await pause(PAUSE_MS.scrollToSave);
      await tap(SAVE_TARGET);
      setIsSaving(true);
      await pause(PAUSE_MS.saving);
      setIsSaving(false);
      hideFinger();
      setIsToastVisible(true);
      await pause(PAUSE_MS.toastVisible);
      setIsToastVisible(false);
      await pause(PAUSE_MS.toastExit);
      setAreRangesLeaving(true);
      await pause(PAUSE_MS.rangesExit);
    }

    async function playUntilUnmounted() {
      try {
        for (;;) await playOnce();
      } catch (error) {
        if (!(error instanceof DemoStopped)) throw error;
      }
    }

    void playUntilUnmounted();
    return () => {
      isStopped = true;
    };
  }, []);

  const fingerPosition = { left: finger.point.x, top: finger.point.y };

  return (
    <div
      className={styles.device}
      role="img"
      aria-label="Un médico configura su disponibilidad semanal en WizyDoc desde el celular"
    >
      <div className={styles.frame} aria-hidden="true">
        <div ref={screenRef} className={styles.screen}>
          <div className={styles.island} />
          <div className={styles.statusBar}>
            <span>9:41</span>
            <StatusIcons />
          </div>
          <div className={styles.appBar}>
            <Image src={logo} alt="" className={styles.appLogo} />
            <span className={styles.avatar}>LP</span>
          </div>

          <div ref={viewportRef} className={styles.viewport}>
            <div
              className={styles.page}
              style={{ transform: `translateY(${-pageOffset}px)` }}
            >
              <p className={styles.pageTitle}>Mi Disponibilidad</p>
              <p className={styles.pageIntro}>
                Define tus horarios de atención en esta sede. Puedes agregar
                varios rangos por día (por ejemplo, mañana y tarde).
              </p>

              <div
                className={cn(
                  styles.week,
                  areRangesLeaving && styles.isLeaving,
                )}
              >
                {DAYS.map(({ label, value }) => {
                  const ranges = schedule[value] ?? [];
                  return (
                    <div key={value} className={styles.day}>
                      <div className={styles.dayHeader}>
                        <span className={styles.dayName}>{label}</span>
                        <span
                          className={styles.addRange}
                          data-demo-target={addRangeTarget(value)}
                        >
                          <Plus className="h-3 w-3" />
                          Agregar rango
                        </span>
                      </div>

                      {ranges.length === 0 ? (
                        <p className={styles.noAvailability}>
                          Sin disponibilidad
                        </p>
                      ) : (
                        <div className={styles.ranges}>
                          {ranges.map((range) => (
                            <div key={range.id} className={styles.range}>
                              <TimeField
                                key={`start-${range.start}`}
                                target={timeTarget(range.id, "start")}
                                time={range.start}
                                isFocused={
                                  focusedTarget ===
                                  timeTarget(range.id, "start")
                                }
                              />
                              <span className={styles.separator}>—</span>
                              <TimeField
                                key={`end-${range.end}`}
                                target={timeTarget(range.id, "end")}
                                time={range.end}
                                isFocused={
                                  focusedTarget === timeTarget(range.id, "end")
                                }
                              />
                              <span className={styles.trash}>
                                <Trash2 className="h-4 w-4" />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <span
                ref={saveRef}
                className={cn(styles.save, isSaving && styles.isSaving)}
                data-demo-target={SAVE_TARGET}
              >
                {isSaving ? (
                  <>
                    <span className={styles.spinner} />
                    Guardando...
                  </>
                ) : (
                  "Guardar disponibilidad"
                )}
              </span>
            </div>
          </div>

          <div
            className={cn(
              styles.toast,
              isToastVisible && styles.isToastVisible,
            )}
          >
            <CircleCheck className="h-5 w-5" />
            Disponibilidad guardada correctamente
          </div>

          {tapCount > 0 && (
            <span
              key={tapCount}
              className={styles.ripple}
              style={fingerPosition}
            />
          )}
          <span
            className={cn(
              styles.finger,
              finger.isVisible && styles.isFingerVisible,
            )}
            style={fingerPosition}
          >
            <PointingHand key={tapCount} isPressing={tapCount > 0} />
          </span>
          <div className={styles.homeIndicator} />
        </div>
      </div>
    </div>
  );
}

function TimeField({
  target,
  time,
  isFocused,
}: {
  target: string;
  time: string;
  isFocused: boolean;
}) {
  return (
    <span
      className={cn(styles.time, isFocused && styles.isFocused)}
      data-demo-target={target}
    >
      {time}
    </span>
  );
}

function PointingHand({ isPressing }: { isPressing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="60"
      height="60"
      viewBox="0 0 64 64"
      className={isPressing ? styles.fingerPress : undefined}
    >
      <path
        d="M27 4c-3 0-5 2-5 5v25l-3-3c-2-2-5-2-7 0s-2 5 0 7l9 11c3 4 7 7 13 7h8c8 0 13-6 13-13V31c0-3-2-5-5-5-1 0-2 0-3 1 0-3-2-5-5-5-1 0-3 1-3 2-1-2-3-3-5-3-1 0-2 0-3 1V9c0-3-2-5-5-5Z"
        fill="#fff"
        stroke="#1F2A2A"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 22v10M40 25v8"
        stroke="#1F2A2A"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".35"
      />
    </svg>
  );
}

function StatusIcons() {
  return (
    <span className={styles.statusIcons}>
      <svg
        aria-hidden="true"
        width="18"
        height="12"
        viewBox="0 0 18 12"
        fill="currentColor"
      >
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg
        aria-hidden="true"
        width="16"
        height="12"
        viewBox="0 0 16 12"
        fill="currentColor"
      >
        <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.9 6.9 0 0 0 8 4c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.5-2.2 2.3L8 12l2.2-2.4A3.1 3.1 0 0 0 8 9.3Z" />
      </svg>
      <svg
        aria-hidden="true"
        width="27"
        height="13"
        viewBox="0 0 27 13"
        fill="currentColor"
      >
        <rect
          x=".5"
          y=".5"
          width="23"
          height="12"
          rx="3.5"
          fill="none"
          stroke="currentColor"
          opacity=".4"
        />
        <rect x="2" y="2" width="20" height="9" rx="2" />
        <path d="M25 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" opacity=".4" />
      </svg>
    </span>
  );
}
