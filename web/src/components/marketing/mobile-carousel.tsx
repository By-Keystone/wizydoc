"use client";

import { Children, type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * En celular muestra los hijos de a uno, deslizables y con puntos debajo. Desde
 * el ancho en que `className` lo convierte en grilla, los puntos se ocultan con
 * `dotsClassName` y se comporta como una grilla normal.
 */
export function MobileCarousel({
  label,
  className,
  dotsClassName,
  children,
}: {
  label: string;
  className: string;
  dotsClassName: string;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slideCount = Children.count(children);

  function slideCenters() {
    const slides = Array.from(
      trackRef.current?.children ?? [],
    ) as HTMLElement[];
    return slides.map((slide) => slide.offsetLeft + slide.offsetWidth / 2);
  }

  function updateActiveIndex() {
    const track = trackRef.current;
    if (!track) return;
    const visibleCenter = track.scrollLeft + track.clientWidth / 2;
    const centers = slideCenters();
    const closest = centers.reduce(
      (best, center, index) =>
        Math.abs(center - visibleCenter) <
        Math.abs(centers[best] - visibleCenter)
          ? index
          : best,
      0,
    );
    setActiveIndex(closest);
  }

  function showSlide(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({
      left: slideCenters()[index] - track.clientWidth / 2,
      behavior: "smooth",
    });
  }

  return (
    <>
      <section
        ref={trackRef}
        aria-label={label}
        onScroll={updateActiveIndex}
        className={cn(
          "no-scrollbar relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 py-3",
          className,
        )}
      >
        {children}
      </section>
      <div className={cn("mt-5 flex justify-center gap-2", dotsClassName)}>
        {Array.from({ length: slideCount }, (_, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: los puntos son posiciones fijas, no datos que cambien de orden
            key={index}
            type="button"
            aria-label={`Ver ${index + 1} de ${slideCount}`}
            aria-current={index === activeIndex}
            onClick={() => showSlide(index)}
            className={cn(
              "h-2 rounded-full transition-all motion-reduce:transition-none",
              index === activeIndex
                ? "w-6 bg-brand-teal"
                : "w-2 bg-brand-teal/25",
            )}
          />
        ))}
      </div>
    </>
  );
}
