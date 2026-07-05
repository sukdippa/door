"use client";

import R3FHeroScene from "./components/R3FHeroScene";
import ScrollAnimations from "./components/ScrollAnimations";
import ArcStroke from "./components/ArcStroke";
import HeroLoadingOverlay from "./components/HeroLoadingOverlay";
import SiteNav from "./components/SiteNav";

export default function Home() {
  return (
    <main className="relative">
      <section id="door-hero" className="relative h-screen overflow-hidden">
        <HeroLoadingOverlay />

        <div
          className="pointer-events-none absolute inset-0 z-20 bg-black"
          data-gsap="intro-black"
        />

        <div className="hero-reveal fixed inset-x-0 top-7 z-100 px-4 sm:px-8">
          <SiteNav />
        </div>

        <img
          src="/mlh.svg"
          alt="MLH 2027 Season Official Member"
          className="hero-reveal absolute right-4 top-0 z-100 w-[84px] sm:right-8 sm:w-[110px]"
          data-gsap="intro-image"
        />

        <ArcStroke className="pointer-events-none absolute inset-x-0 top-28 z-10 h-full w-full text-white/70" />

        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center">
          <img
            src="/logo.svg"
            alt="UofT Hacks 14"
            className="hero-reveal hero-reveal--title h-auto w-[min(600px,88vw)]"
            data-gsap="intro-image"
          />
          <p
            className="hero-reveal hero-reveal--title text-glow-blue mt-2 font-redhat text-lg font-medium text-white sm:text-xl"
            data-gsap="intro-image"
          >
            January 16 – 18, 2027&nbsp;&nbsp;•&nbsp;&nbsp;University of Toronto
          </p>
          <button
            type="button"
            className="glass-pill glass-button hero-reveal hero-reveal--title mt-8 inline-flex items-center justify-center rounded-full px-12 py-3 font-redhat text-lg text-white transition duration-300 hover:brightness-110"
          >
            Register Now!
          </button>
        </div>

        <ScrollAnimations />

        <div className="absolute inset-0 z-0">
          <R3FHeroScene
            modelUrl="/door.glb"
            triggerId="door-hero"
            openAngleDeg={105}
            className="pointer-events-none"
          />
        </div>
      </section>
    </main>
  );
}
