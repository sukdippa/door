"use client";

import { useLayoutEffect } from "react";
import { gsap } from "gsap";

// Intro reveal for the hero's 2D overlay. Runs once, gated on the `hero:loaded`
// handshake fired by HeroLoadingOverlay (see HANDOFF.md). The door's scroll
// animation — including the scroll-linked fade of this same overlay — lives
// in R3FHeroScene, not here (a second independent ScrollTrigger on the same
// pinned #door-hero trigger fought with R3FHeroScene's own pinning one and
// produced a stuck-wrong progress value; see its onUpdate instead).
export default function ScrollAnimations() {
  useLayoutEffect(() => {
    let handleHeroLoaded: (() => void) | null = null;

    const ctx = gsap.context(() => {
      const introOverlay = document.querySelector<HTMLElement>(
        "[data-gsap='intro-black']"
      );
      const introImages = gsap.utils.toArray<HTMLElement>(
        "[data-gsap='intro-image']"
      );

      const runIntro = () => {
        if (!introOverlay) return;
        gsap
          .timeline()
          .to(introOverlay, {
            autoAlpha: 0,
            duration: 0.6,
            ease: "power2.out",
          })
          .to(
            introImages,
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.6,
              ease: "power3.out",
              stagger: 0.08,
            },
            0
          );
      };

      if (introOverlay) {
        gsap.set(introOverlay, { autoAlpha: 1 });
        gsap.set(introImages, { autoAlpha: 0, y: 8 });

        if (document.documentElement.dataset.heroLoaded === "true") {
          runIntro();
        } else {
          handleHeroLoaded = () => {
            runIntro();
            if (handleHeroLoaded) {
              window.removeEventListener("hero:loaded", handleHeroLoaded);
              handleHeroLoaded = null;
            }
          };
          window.addEventListener("hero:loaded", handleHeroLoaded);
        }
      }
    }, document.body);

    return () => {
      if (handleHeroLoaded) {
        window.removeEventListener("hero:loaded", handleHeroLoaded);
      }
      ctx.revert();
    };
  }, []);

  return null;
}
