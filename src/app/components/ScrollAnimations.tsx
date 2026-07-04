"use client";

import { useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
const HERO_SCROLL_DISTANCE = "+=460%";

export default function ScrollAnimations() {
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    let handleHeroLoaded: (() => void) | null = null;

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

      if (heroCard && heroSection) {
        gsap.set(heroCard, { autoAlpha: 0, y: 24 });
        gsap
          .timeline({
            scrollTrigger: {
              trigger: heroSection,
              start: "top top",
              end: HERO_SCROLL_DISTANCE,
              scrub: 1,
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
          );
      }

      if (heroSection) {
        gsap.to(introImages, {
          autoAlpha: 0,
          y: -6,
          ease: "none",
          scrollTrigger: {
            trigger: heroSection,
            start: "top top+=35%",
            end: "top top+=80%",
            scrub: 1,
            immediateRender: false,
          },
        });
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

    return () => {
      if (handleHeroLoaded) {
        window.removeEventListener("hero:loaded", handleHeroLoaded);
      }
      ctx.revert();
    };
  }, []);

  return null;
}
