"use client";

import { useEffect, useRef } from "react";
import lottie from "lottie-web";

type LottieOverlayProps = {
  className?: string;
};

export default function LottieOverlay({ className = "" }: LottieOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const animation = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/data.json",
    });

    return () => {
      animation.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden="true"
    />
  );
}
