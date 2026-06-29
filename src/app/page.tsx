"use client";

import { useEffect, useState } from "react";
import R3FHeroScene from "./components/R3FHeroScene";
import ScrollAnimations from "./components/ScrollAnimations";
import ArcStroke from "./components/ArcStroke";
import HeroLoadingOverlay from "./components/HeroLoadingOverlay";

const TOGGLE_REVEAL_ZONE = 80;

export default function Home() {
  const [showOverlay, setShowOverlay] = useState(true);
  const [toggleVisible, setToggleVisible] = useState(false);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setToggleVisible(event.clientY <= TOGGLE_REVEAL_ZONE);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowOverlay((v) => !v)}
        className={`fixed left-1/2 top-4 z-200 -translate-x-1/2 rounded-full border border-white/40 bg-black/40 px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-white/90 backdrop-blur-md transition duration-300 hover:bg-white/20 ${
          toggleVisible
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        {showOverlay ? "Hide UI" : "Show UI"}
      </button>

      <main className="relative">
        <section id="door-hero" className="relative h-screen overflow-hidden">
          <div className={showOverlay ? "contents" : "hidden"}>
            <HeroLoadingOverlay />

            <div
              className="pointer-events-none absolute inset-0 z-20 bg-black"
              data-gsap="intro-black"
            />

            <div className="hero-reveal fixed flex flex-col text-white z-100 w-full">
              <div className="flex flex-row justify-between w-full px-8 py-6 mb-4">
                <div>
                  Logo
                </div>
                <div>
                  UoftHacks
                </div>
                <div>
                  Menu
                </div>
              </div>
              <ArcStroke className="mt-4 h-full w-full text-white/70" />
            </div>


            <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
              <div className="max-w-3xl space-y-4">
                <img
                  src="/hero-welcome.png"
                  alt="Welcome"
                  className="hero-reveal hero-reveal--welcome mx-auto h-6 w-auto sm:h-7"
                  data-gsap="intro-image"
                />
                <img
                  src="/hero-title.png"
                  alt="UofT Hacks 14"
                  className="hero-reveal hero-reveal--title mx-auto h-16 w-auto sm:h-20 lg:h-24"
                  data-gsap="intro-image"
                />
                <p
                  className="hero-reveal hero-reveal--title mx-auto mt-2 text-xs uppercase tracking-[0.35em] text-white/80 sm:text-sm"
                  data-gsap="intro-image"
                >
                  January 16–18, 2026 · University of Toronto
                </p>
                <button
                  type="button"
                  className="hero-reveal hero-reveal--title mx-auto mt-5 inline-flex items-center justify-center rounded-full border border-white/70 bg-white/10 px-6 py-2 text-[0.65rem] uppercase tracking-[0.35em] text-white/90 backdrop-blur-sm transition duration-300 hover:bg-white/20"
                >
                  Register Now
                </button>
              </div>
            </div>
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
          <div
            className={`pointer-events-none absolute inset-0 z-[-1] flex items-center justify-center px-6 text-left ${
              showOverlay ? "" : "hidden"
            }`}
          >
            <div
              className="w-full max-w-2xl rounded-3xl border border-white/15 bg-black/40 p-6 text-white/80 backdrop-blur-md sm:p-8"
              data-gsap="hero-card"
            >
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-white/50">
                Step through the door
              </p>
              <div className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Canada&apos;s largest student-run hackathon
              </div>

              <p className="mt-3 text-sm text-white/60">
                Join 1,000+ hackers for 36 hours of building, workshops, mentorship,
                and prizes. Whether it&apos;s your first hackathon or your fourteenth,
                bring an idea and we&apos;ll bring the rest — food, swag, and a community
                ready to help you ship.
              </p>

              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-[0.6rem] uppercase tracking-[0.25em] text-white/50">
                    Date
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-white">Jan 16–18, 2026</dd>
                </div>
                <div>
                  <dt className="text-[0.6rem] uppercase tracking-[0.25em] text-white/50">
                    Location
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-white">U of T, Toronto</dd>
                </div>
                <div>
                  <dt className="text-[0.6rem] uppercase tracking-[0.25em] text-white/50">
                    Duration
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-white">36 hours</dd>
                </div>
                <div>
                  <dt className="text-[0.6rem] uppercase tracking-[0.25em] text-white/50">
                    Hackers
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-white">1,000+</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-white/60">
                <span className="rounded-full border border-white/15 px-3 py-1">Free to attend</span>
                <span className="rounded-full border border-white/15 px-3 py-1">Travel reimbursement</span>
                <span className="rounded-full border border-white/15 px-3 py-1">$20k in prizes</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
