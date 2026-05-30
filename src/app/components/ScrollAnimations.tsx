"use client";

import { useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function ScrollAnimations() {
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const introOverlay = document.querySelector<HTMLElement>(
        "[data-gsap='intro-black']"
      );
      const introImages = gsap.utils.toArray<HTMLElement>(
        "[data-gsap='intro-image']"
      );
      const heroCard = document.querySelector<HTMLElement>(
        "[data-gsap='hero-card']"
      );
      const heroSection = document.getElementById("door-hero");

      if (introOverlay) {
        gsap.set(introImages, { autoAlpha: 0, y: 8 });
        gsap
          .timeline()
          .to(introOverlay, {
            autoAlpha: 0,
            duration: 1,
            ease: "power2.out",
          })
          .to(
            introImages,
            {
              autoAlpha: 1,
              y: 0,
              duration: 1,
              ease: "power3.out",
              stagger: 0.08,
            },
            "-=0.2"
          );
      }

      if (heroCard && heroSection) {
        gsap.set(heroCard, { autoAlpha: 0, y: 24 });
        gsap
          .timeline({
            scrollTrigger: {
              trigger: heroSection,
              start: "top top",
              end: "+=220%",
              scrub: true,
            },
          })
          .to(
            heroCard,
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.2,
              ease: "power2.out",
            },
            0.8
          )
          .to(
            introImages,
            {
              autoAlpha: 0,
              y: -6,
              duration: 0.2,
              ease: "power2.out",
            },
            0.8
          );
      }

      const fadeItems = gsap.utils.toArray<HTMLElement>("[data-gsap='fade']");
      fadeItems.forEach((item) => {
        gsap.fromTo(
          item,
          { autoAlpha: 0, y: 40 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: item,
              start: "top 80%",
              once: true,
            },
          }
        );
      });

      const panels = gsap.utils.toArray<HTMLElement>("[data-gsap='panel']");
      panels.forEach((panel) => {
        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: 30 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: panel,
              start: "top 85%",
              end: "bottom 60%",
              scrub: 1,
            },
          }
        );
      });
    }, document.body);

    return () => ctx.revert();
  }, []);

  return null;
}
