"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

type HeroLoadingOverlayProps = {
  className?: string;
};

export default function HeroLoadingOverlay({ className = "" }: HeroLoadingOverlayProps) {
  const { active, progress } = useProgress();
  const [isLoaded, setIsLoaded] = useState(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.heroLoaded = "false";

    if (active || progress > 0) {
      hasStartedRef.current = true;
    }

    if (hasStartedRef.current && !active && progress >= 100) {
      const timeout = window.setTimeout(() => {
        requestAnimationFrame(() => {
          setIsLoaded(true);
          document.documentElement.dataset.heroLoaded = "true";
          window.dispatchEvent(new Event("hero:loaded"));
        });
      }, 350);

      return () => {
        window.clearTimeout(timeout);
      };
    }

    return undefined;
  }, [active, progress]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-120 flex items-center justify-center bg-linear-to-b from-(--hero-load-from) to-(--hero-load-to) text-white transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isLoaded ? "opacity-0" : "opacity-100"
      } ${className}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/70">
          Loading
        </div>
        <div className="relative h-10 w-0.5 overflow-hidden rounded-full bg-white/20">
          <div className="loading-scroll absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  );
}
