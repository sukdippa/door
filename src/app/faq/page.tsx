"use client";

import R3FPathScene from "../components/R3FPathScene";
import ScrollAnimations from "../components/ScrollAnimations";
import HeroLoadingOverlay from "../components/HeroLoadingOverlay";
import SiteNav from "../components/SiteNav";

export default function FaqPage() {
  return (
    <main className="relative">
      <section id="path-hero" className="relative h-screen overflow-hidden">
        <HeroLoadingOverlay />

        <div
          className="pointer-events-none absolute inset-0 z-20 bg-black"
          data-gsap="intro-black"
        />

        <div className="hero-reveal fixed inset-x-0 top-7 z-100 px-4 sm:px-8">
          <SiteNav />
        </div>

        <ScrollAnimations />

        <div className="absolute inset-0 z-0">
          <R3FPathScene
            modelUrl="/path.glb"
            triggerId="path-hero"
            className="pointer-events-none"
          />
        </div>
      </section>
    </main>
  );
}
