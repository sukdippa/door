"use client";

import { useEffect, useRef } from "react";

type ArcStrokeProps = {
    className?: string;
    strokeWidth?: number;
    strokeColor?: string;
    duration?: string;
    delay?: string;
    scale?: number;
    // Forwarded as `data-scroll-fade` on the root <svg> — lets a caller group
    // this into a gsap.utils.toArray('[data-scroll-fade="..."]') selection
    // (see ScrollAnimations.tsx) without ArcStroke needing to know about it.
    dataScrollFade?: string;
};

export default function ArcStroke({
    className = "",
    strokeWidth = 0.1,
    strokeColor = "currentColor",
    duration = "1.8s",
    delay = "1s",
    scale = 1.35,
    dataScrollFade,
}: ArcStrokeProps) {
    const centerX = 50;
    const centerY = 25;
    const animateRef = useRef<SVGAnimateElement | null>(null);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        const parseDelayMs = (value: string) => {
            const trimmed = value.trim();
            if (!trimmed) return 0;
            if (trimmed.endsWith("ms")) {
                return Number.parseFloat(trimmed);
            }
            if (trimmed.endsWith("s")) {
                return Number.parseFloat(trimmed) * 1000;
            }
            return Number.parseFloat(trimmed) * 1000;
        };

        const startAnimation = () => {
            if (hasStartedRef.current) return;
            hasStartedRef.current = true;
            const delayMs = parseDelayMs(delay);
            window.setTimeout(() => {
                animateRef.current?.beginElement();
            }, delayMs);
        };

        if (document.documentElement.dataset.heroLoaded === "true") {
            startAnimation();
            return undefined;
        }

        const handleHeroLoaded = () => {
            startAnimation();
            window.removeEventListener("hero:loaded", handleHeroLoaded);
        };

        window.addEventListener("hero:loaded", handleHeroLoaded);

        return () => {
            window.removeEventListener("hero:loaded", handleHeroLoaded);
        };
    }, [delay]);

    return (
        <svg
            viewBox="0 0 100 50"
            preserveAspectRatio="xMidYMin meet"
            className={className}
            data-scroll-fade={dataScrollFade}
            overflow="visible"
            aria-hidden="true"
        >
            <path
                d="M5,50 A45,45 0 0 1 95,50"
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                transform={`translate(${centerX} ${centerY}) scale(${scale}) translate(${-centerX} ${-centerY})`}
            >
                <animate
                    ref={animateRef}
                    attributeName="stroke-dashoffset"
                    from="1"
                    to="0"
                    dur={duration}
                    begin="indefinite"
                    calcMode="spline"
                    keyTimes="0;1"
                    keySplines="0.4 0 0.2 1"
                    fill="freeze"
                />
            </path>
        </svg>
    );
}
